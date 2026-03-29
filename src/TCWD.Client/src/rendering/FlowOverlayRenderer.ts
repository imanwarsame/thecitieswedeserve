import * as THREE from 'three';
import { events } from '../core/Events';
import { TransportMode } from '../simulation/transport/types';
import type { TransportModule } from '../simulation/transport/TransportModule';
import type { FlowSegment, OccupancyRate } from '../simulation/transport/types';
import type { VoronoiCell } from '../grid/types';
import { FlowLineShader } from './shaders/FlowLineShader';
import { FlowRibbonShader } from './shaders/FlowRibbonShader';

// ── Flow Overlay Renderer ─────────────────────────────────────────────────────
//
// Toggleable population-flow/congestion overlay drawn on top of the transport
// network, updated once per simulation tick (once per game hour).
//
// Three visual layers:
//   1. Variable-width ribbon meshes — width AND colour (green→yellow→red) encodes
//      trips-per-hour on each edge.  Thick red = congested; thin green = free-flow.
//   2. Animated pulse LineSegments — directional travelling dots layered on top.
//      Pulse speed and density scale with flow so busy edges look visibly busier.
//   3. Cell congestion halos — translucent discs at heavily occupied cells
//      (> CONGESTION_THRESHOLD trips/hr) to surface hotspot locations instantly.

const CONGESTION_THRESHOLD = 200;  // trips/hr — mirrors FlowAccumulator
const FLOW_Y               = 0.35; // above infrastructure (0.15) & old flow lines (0.25)
const HALO_Y               = 0.04;
const MIN_HALF_WIDTH       = 0.30;
const MAX_HALF_WIDTH       = 3.6;
const FADE_DURATION        = 1.2;  // seconds for cross-fade in/out
const DISC_SEGMENTS        = 12;   // polygon count for junction fill discs

// Outgoing geometry set kept alive while fading out
interface FadingSet {
	meshes:      THREE.Mesh[];
	lines:       THREE.LineSegments[];
	disposables: (THREE.Material | THREE.BufferGeometry)[];
	mats:        THREE.ShaderMaterial[];
	fade:        number; // 1 → 0
}

// Slight Y offset per mode so overlapping edges on the same cell pair don't Z-fight
const MODE_PULSE_Y: Record<TransportMode, number> = {
	[TransportMode.Road]:  FLOW_Y + 0.01,
	[TransportMode.Cycle]: FLOW_Y + 0.02,
	[TransportMode.Metro]: FLOW_Y + 0.03,
	[TransportMode.Train]: FLOW_Y + 0.04,
};

/** CPU-side HSL ramp: green (low) → yellow → red (high congestion). */
function flowToColor(normalized: number): THREE.Color {
	const hue = (1 - Math.min(normalized, 1)) * (120 / 360);
	return new THREE.Color().setHSL(hue, 0.88, 0.50);
}

export class FlowOverlayRenderer {
	/** Dedicated scene – rendered after the EffectComposer so no post-processing
	 *  passes (GTAO, bloom, etc.) can darken or suppress the overlay. */
	private overlayScene = new THREE.Scene();
	private group: THREE.Group;
	private ribbonMeshes: THREE.Mesh[] = [];
	private pulseLines: THREE.LineSegments[] = [];
	private haloMeshes: THREE.Mesh[] = [];
	/** All disposable resources created in the current frame. */
	private disposables: (THREE.Material | THREE.BufferGeometry)[] = [];
	/** Live pulse shader material references for per-frame uniform updates. */
	private pulseMaterials: THREE.ShaderMaterial[] = [];
	/** Ribbon materials requiring only uDarkness updates (no uTime). */
	private ribbonMaterials: THREE.ShaderMaterial[] = [];

	private transportModule: TransportModule;
	private cells: readonly VoronoiCell[];
	private modeFilter: Set<TransportMode>;
	private scene: THREE.Scene | null;

	private _visible   = false;
	private dirty      = true;
	private elapsed    = 0;
	private bgLum      = new THREE.Color();
	private fadeIn     = 1.0;  // 0→1 for current active geometry
	private fadingOut: FadingSet | null = null;

	constructor(
		transportModule: TransportModule,
		cells: readonly VoronoiCell[],
		scene?: THREE.Scene,
	) {
		this.transportModule = transportModule;
		this.cells           = cells;
		this.modeFilter      = new Set(Object.values(TransportMode));
		this.scene           = scene ?? null;

		this.group      = new THREE.Group();
		this.group.name = 'flow-overlay';
		// Starts hidden; toggled by the UI
		this.group.visible = false;
		// Add to the private overlay scene, not the main scene, so the group
		// renders in a separate pass after EffectComposer (bypasses GTAO etc).
		this.overlayScene.add(this.group);

		events.on('simulation:tick', this.markDirty);
	}

	// ── Public API ───────────────────────────────────────────────────────────

	setVisible(visible: boolean): void {
		this._visible      = visible;
		this.group.visible = visible;
		// Trigger an immediate rebuild when switching on so there is no blank frame
		if (visible && this.dirty) {
			this.dirty = false;
			this.rebuild();
		}
	}

	isVisible(): boolean {
		return this._visible;
	}

	/** The private scene to pass to the render pipeline for post-compositor rendering. */
	getOverlayScene(): THREE.Scene {
		return this.overlayScene;
	}

	setModeFilter(modes: Set<TransportMode>): void {
		this.modeFilter = new Set(modes);
		if (this._visible) this.markDirty();
	}

	getModeFilter(): Set<TransportMode> {
		return new Set(this.modeFilter);
	}

	/** Call every frame from the engine loop. */
	update(delta: number): void {
		this.elapsed += delta;

		// Derive scene darkness from background luminance (day/night adaptation)
		let darkness = 0;
		if (this.scene) {
			const bg = this.scene.background;
			if (bg && (bg as THREE.Color).isColor) {
				this.bgLum.copy(bg as THREE.Color);
				const hsl = { h: 0, s: 0, l: 0 };
				this.bgLum.getHSL(hsl);
				darkness = 1 - hsl.l;
			}
		}

		// ── Advance cross-fades ───────────────────────────────────────────────

		// Fade in new geometry
		if (this.fadeIn < 1.0) {
			this.fadeIn = Math.min(1.0, this.fadeIn + delta / FADE_DURATION);
		}

		// Fade out old geometry, dispose once fully transparent
		if (this.fadingOut) {
			this.fadingOut.fade = Math.max(0, this.fadingOut.fade - delta / FADE_DURATION);
			for (const mat of this.fadingOut.mats) {
				mat.uniforms.uFade.value     = this.fadingOut.fade;
				mat.uniforms.uDarkness.value = darkness;
				if ('uTime' in mat.uniforms) mat.uniforms.uTime.value = this.elapsed;
			}
			if (this.fadingOut.fade <= 0) {
				for (const m of this.fadingOut.meshes) this.group.remove(m);
				for (const l of this.fadingOut.lines)  this.group.remove(l);
				for (const d of this.fadingOut.disposables) d.dispose();
				this.fadingOut = null;
			}
		}

		// Update active materials
		for (const mat of this.pulseMaterials) {
			mat.uniforms.uTime.value     = this.elapsed;
			mat.uniforms.uDarkness.value = darkness;
			mat.uniforms.uFade.value     = this.fadeIn;
		}
		for (const mat of this.ribbonMaterials) {
			mat.uniforms.uDarkness.value = darkness;
			mat.uniforms.uFade.value     = this.fadeIn;
		}

		if (this.dirty && this._visible) {
			this.dirty = false;
			this.rebuild();
		}
	}

	dispose(): void {
		events.off('simulation:tick', this.markDirty);
		this.clear();
		this.group.parent?.remove(this.group);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private markDirty = (): void => {
		this.dirty = true;
	};

	private rebuild(): void {
		const result = this.transportModule.getLastResult();

		// ── Retire current geometry into the fade-out set ─────────────────────
		// Immediately drop any previously fading-out set to avoid accumulation.
		if (this.fadingOut) {
			for (const m of this.fadingOut.meshes) this.group.remove(m);
			for (const l of this.fadingOut.lines)  this.group.remove(l);
			for (const d of this.fadingOut.disposables) d.dispose();
			this.fadingOut = null;
		}

		const hasActive = this.ribbonMeshes.length + this.pulseLines.length + this.haloMeshes.length > 0;
		if (hasActive) {
			this.fadingOut = {
				meshes:      [...this.ribbonMeshes, ...this.haloMeshes],
				lines:       [...this.pulseLines],
				disposables: [...this.disposables],
				mats:        [...this.ribbonMaterials, ...this.pulseMaterials],
				fade:        this.fadeIn, // fade out from whatever opacity we reached
			};
		}

		// ── Build new geometry (starts invisible; fades in via update()) ───────
		this.ribbonMeshes    = [];
		this.pulseLines      = [];
		this.haloMeshes      = [];
		this.disposables     = [];
		this.pulseMaterials  = [];
		this.ribbonMaterials = [];
		this.fadeIn          = 0.0;

		if (result.segments.length === 0) return;

		// Pre-compute max flow across all visible-mode segments for normalisation
		let maxFlow = 1;
		for (const seg of result.segments) {
			if (this.modeFilter.has(seg.mode) && seg.tripsPerHour > maxFlow) {
				maxFlow = seg.tripsPerHour;
			}
		}

		this.buildRibbons(result.segments, maxFlow);
		this.buildPulseLines(result.segments, maxFlow);
		this.buildHalos(result.occupancy, result.totalPassengers);
	}

	// ── Layer 1: variable-width glowing ribbons + junction fill discs ───────────

	private buildRibbons(segments: readonly FlowSegment[], maxFlow: number): void {
		const verts:   number[] = [];
		const indices: number[] = [];
		const colors:  number[] = [];
		const edgeUVs: number[] = [];
		const flows:   number[] = [];
		let   offset = 0;

		// Track the max-flow norm at each cell for junction disc sizing
		const cellMaxFlow = new Map<number, number>();

		for (const seg of segments) {
			if (!this.modeFilter.has(seg.mode)) continue;
			const fromCell = this.cells[seg.from];
			const toCell   = this.cells[seg.to];
			if (!fromCell || !toCell) continue;

			const norm  = Math.min(seg.tripsPerHour / maxFlow, 1);
			const halfW = MIN_HALF_WIDTH + (MAX_HALF_WIDTH - MIN_HALF_WIDTH) * norm;
			const col   = flowToColor(norm);

			offset = pushFlowRibbon(
				fromCell.center.x, fromCell.center.y,
				toCell.center.x,   toCell.center.y,
				halfW, FLOW_Y, col, norm,
				verts, indices, colors, edgeUVs, flows,
				offset,
			);

			// Record the highest-flow norm seen at each endpoint
			cellMaxFlow.set(seg.from, Math.max(cellMaxFlow.get(seg.from) ?? 0, norm));
			cellMaxFlow.set(seg.to,   Math.max(cellMaxFlow.get(seg.to)   ?? 0, norm));
		}

		// Junction fill discs — smooth the blocky ribbon endpoints/intersections.
		// Each disc uses aEdgeUV=0.5 at the centre (full glow) and aEdgeUV=0 at
		// the rim (transparent), creating a radial glow profile that melts into
		// the ribbons arriving from all directions.
		for (const [cellIdx, norm] of cellMaxFlow) {
			const cell  = this.cells[cellIdx];
			if (!cell) continue;
			const halfW = MIN_HALF_WIDTH + (MAX_HALF_WIDTH - MIN_HALF_WIDTH) * norm;
			offset = pushFlowDisc(
				cell.center.x, cell.center.y,
				halfW, FLOW_Y, flowToColor(norm), norm,
				verts, indices, colors, edgeUVs, flows, offset,
			);
		}

		if (verts.length === 0) return;

		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uDarkness: { value: 0.0 },
				uFade:     { value: 0.0 }, // will be set to this.fadeIn each frame
			},
			vertexShader:   FlowRibbonShader.vertexShader,
			fragmentShader: FlowRibbonShader.fragmentShader,
			transparent:    true,
			depthWrite:     false,
			depthTest:      false, // always draw on top of buildings/terrain
			side:           THREE.DoubleSide,
		});
		this.ribbonMaterials.push(mat);
		this.disposables.push(mat);

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,   3));
		geo.setAttribute('aColor',   new THREE.Float32BufferAttribute(colors,  3));
		geo.setAttribute('aEdgeUV',  new THREE.Float32BufferAttribute(edgeUVs, 1));
		geo.setAttribute('aFlow',    new THREE.Float32BufferAttribute(flows,   1));
		geo.setIndex(indices);
		this.disposables.push(geo);

		const mesh = new THREE.Mesh(geo, mat);
		mesh.frustumCulled = false;
		mesh.renderOrder   = 999; // render after all opaque scene geometry
		this.ribbonMeshes.push(mesh);
		this.group.add(mesh);
	}

	// ── Layer 2: animated pulse LineSegments ─────────────────────────────────

	private buildPulseLines(segments: readonly FlowSegment[], maxFlow: number): void {
		// All filtered segments go into one batched LineSegments geometry.
		// Per-segment custom attributes carry flow + phase offset to the shader.
		const positions:   number[] = [];
		const segmentTs:   number[] = [];
		const flows:       number[] = [];
		const timeOffsets: number[] = [];

		for (const seg of segments) {
			if (!this.modeFilter.has(seg.mode)) continue;
			const fromCell = this.cells[seg.from];
			const toCell   = this.cells[seg.to];
			if (!fromCell || !toCell) continue;

			const norm   = Math.min(seg.tripsPerHour / maxFlow, 1);
			const offset = Math.random() * 50;
			const y      = MODE_PULSE_Y[seg.mode];

			// Start vertex (aSegmentT = 0)
			positions.push(fromCell.center.x, y, fromCell.center.y);
			segmentTs.push(0.0);
			flows.push(norm);
			timeOffsets.push(offset);

			// End vertex (aSegmentT = 1)
			positions.push(toCell.center.x, y, toCell.center.y);
			segmentTs.push(1.0);
			flows.push(norm);
			timeOffsets.push(offset);
		}

		if (positions.length === 0) return;

		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uTime:     { value: this.elapsed },
				uDarkness: { value: 0.0 },
				uFade:     { value: 0.0 }, // will be set to this.fadeIn each frame
			},
			vertexShader:   FlowLineShader.vertexShader,
			fragmentShader: FlowLineShader.fragmentShader,
			transparent:    true,
			depthWrite:     false,
			depthTest:      false, // always draw on top of buildings/terrain
		});
		this.pulseMaterials.push(mat);
		this.disposables.push(mat);

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position',    new THREE.Float32BufferAttribute(positions,   3));
		geo.setAttribute('aSegmentT',   new THREE.Float32BufferAttribute(segmentTs,   1));
		geo.setAttribute('aFlow',       new THREE.Float32BufferAttribute(flows,       1));
		geo.setAttribute('aTimeOffset', new THREE.Float32BufferAttribute(timeOffsets, 1));
		this.disposables.push(geo);

		const line = new THREE.LineSegments(geo, mat);
		line.frustumCulled = false;
		line.renderOrder   = 998;
		this.pulseLines.push(line);
		this.group.add(line);
	}

	// ── Layer 3: cell congestion halos ────────────────────────────────────────

	private buildHalos(occupancy: readonly OccupancyRate[], totalPassengers: number): void {
		if (totalPassengers === 0) return;

		// Find the maximum occupancy above the congestion threshold
		let maxOcc = CONGESTION_THRESHOLD + 1;
		for (const occ of occupancy) {
			if (occ.tripsPerHour > maxOcc) maxOcc = occ.tripsPerHour;
		}

		for (const occ of occupancy) {
			if (occ.tripsPerHour < CONGESTION_THRESHOLD) continue;
			const cell = this.cells[occ.cellIndex];
			if (!cell) continue;

			const norm    = Math.min((occ.tripsPerHour - CONGESTION_THRESHOLD) / (maxOcc - CONGESTION_THRESHOLD), 1);
			const radius  = 1.6 + norm * 3.2;
			const opacity = 0.10 + norm * 0.28;
			// Halos always sit in the orange-red range (0.7–1.0 of the ramp)
			const col     = flowToColor(0.70 + norm * 0.30);

			const geo = new THREE.CircleGeometry(radius, 18);
			const mat = new THREE.MeshBasicMaterial({
				color:       col,
				transparent: true,
				opacity,
				depthWrite:  false,
				side:        THREE.DoubleSide,
			});
			this.disposables.push(mat);
			this.disposables.push(geo);

			const mesh = new THREE.Mesh(geo, mat);
			mesh.rotation.x = -Math.PI / 2; // flat on the ground plane
			mesh.position.set(cell.center.x, HALO_Y, cell.center.y);
			mesh.frustumCulled = false;
			this.haloMeshes.push(mesh);
			this.group.add(mesh);
		}
	}

	// ── Cleanup ──────────────────────────────────────────────────────────────

	private clear(): void {
		// Dispose any in-flight fade-out set
		if (this.fadingOut) {
			for (const m of this.fadingOut.meshes) this.group.remove(m);
			for (const l of this.fadingOut.lines)  this.group.remove(l);
			for (const d of this.fadingOut.disposables) d.dispose();
			this.fadingOut = null;
		}
		for (const m of this.ribbonMeshes) this.group.remove(m);
		for (const l of this.pulseLines)   this.group.remove(l);
		for (const h of this.haloMeshes)   this.group.remove(h);
		for (const d of this.disposables)  d.dispose();
		this.ribbonMeshes    = [];
		this.pulseLines      = [];
		this.haloMeshes      = [];
		this.disposables     = [];
		this.pulseMaterials  = [];
		this.ribbonMaterials = [];
		this.fadeIn          = 1.0;
	}
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Push a junction fill disc (triangle fan) using the same FlowRibbonShader
 * attributes as the ribbon quads, so it melds seamlessly.
 *
 * Centre vertex:  aEdgeUV = 0.5  → sin(PI * 0.5) = 1  → fully bright
 * Rim vertices:   aEdgeUV = 0.0  → sin(PI * 0.0) = 0  → transparent edge
 * Result: a radial soft-glow blob that fills the gap between arriving ribbons.
 */
function pushFlowDisc(
	cx: number, cz: number,
	radius: number,
	y: number,
	col: THREE.Color,
	flow: number,
	verts: number[],
	indices: number[],
	colors: number[],
	edgeUVs: number[],
	flows: number[],
	vertexOffset: number,
): number {
	// Centre vertex
	verts.push(cx, y, cz);
	colors.push(col.r, col.g, col.b);
	edgeUVs.push(0.5); // bright centre
	flows.push(flow);

	// Rim vertices
	for (let i = 0; i < DISC_SEGMENTS; i++) {
		const angle = (i / DISC_SEGMENTS) * Math.PI * 2;
		verts.push(
			cx + Math.cos(angle) * radius,
			y,
			cz + Math.sin(angle) * radius,
		);
		colors.push(col.r, col.g, col.b);
		edgeUVs.push(0.0); // transparent rim
		flows.push(flow);
	}

	// Triangle fan: centre → rim[i] → rim[(i+1)%N]
	const o = vertexOffset;
	for (let i = 0; i < DISC_SEGMENTS; i++) {
		indices.push(o, o + 1 + i, o + 1 + (i + 1) % DISC_SEGMENTS);
	}
	return vertexOffset + DISC_SEGMENTS + 1;
}

/**
 * Push a ribbon quad (2 triangles) with per-vertex attributes for the
 * FlowRibbonShader (colour, edge UV, flow intensity).
 *
 * aEdgeUV: 0 = left edge, 1 = right edge.  The shader uses sin(UV * PI)
 * to produce a bright centre and transparent edges (soft glow profile).
 */
function pushFlowRibbon(
	ax: number, az: number,
	bx: number, bz: number,
	halfWidth: number,
	y: number,
	col: THREE.Color,
	flow: number,
	verts: number[],
	indices: number[],
	colors: number[],
	edgeUVs: number[],
	flows: number[],
	vertexOffset: number,
): number {
	const dx  = bx - ax;
	const dz  = bz - az;
	const len = Math.hypot(dx, dz);
	if (len < 0.001) return vertexOffset;

	const px = (-dz / len) * halfWidth;
	const pz = ( dx / len) * halfWidth;

	// 4 vertices: left-start, right-start, left-end, right-end
	verts.push(
		ax + px, y, az + pz,  // 0: left-start
		ax - px, y, az - pz,  // 1: right-start
		bx + px, y, bz + pz,  // 2: left-end
		bx - px, y, bz - pz,  // 3: right-end
	);
	for (let i = 0; i < 4; i++) colors.push(col.r, col.g, col.b);
	edgeUVs.push(0, 1, 0, 1);   // left=0, right=1
	for (let i = 0; i < 4; i++) flows.push(flow);

	const o = vertexOffset;
	indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
	return vertexOffset + 4;
}
