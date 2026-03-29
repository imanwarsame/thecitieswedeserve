import * as THREE from 'three';
import { events } from '../core/Events';
import { TransportMode } from '../simulation/transport/types';
import type { TransportModule } from '../simulation/transport/TransportModule';
import type { FlowSegment, OccupancyRate } from '../simulation/transport/types';
import type { VoronoiCell } from '../grid/types';
import { FlowLineShader } from './shaders/FlowLineShader';

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
const MIN_HALF_WIDTH       = 0.25;
const MAX_HALF_WIDTH       = 2.8;

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
	private group: THREE.Group;
	private ribbonMeshes: THREE.Mesh[] = [];
	private pulseLines: THREE.LineSegments[] = [];
	private haloMeshes: THREE.Mesh[] = [];
	/** All disposable resources created in the current frame. */
	private disposables: (THREE.Material | THREE.BufferGeometry)[] = [];
	/** Live pulse shader material references for per-frame uniform updates. */
	private pulseMaterials: THREE.ShaderMaterial[] = [];

	private transportModule: TransportModule;
	private cells: readonly VoronoiCell[];
	private modeFilter: Set<TransportMode>;
	private scene: THREE.Scene | null;

	private _visible = false;
	private dirty    = true;
	private elapsed  = 0;
	private bgLum    = new THREE.Color();

	constructor(
		parent: THREE.Object3D,
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
		parent.add(this.group);

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
		for (const mat of this.pulseMaterials) {
			mat.uniforms.uTime.value     = this.elapsed;
			mat.uniforms.uDarkness.value = darkness;
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
		this.clear();
		const result = this.transportModule.getLastResult();
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

	// ── Layer 1: variable-width colour ribbons ────────────────────────────────

	private buildRibbons(segments: readonly FlowSegment[], maxFlow: number): void {
		// Collect all filtered segments separately per mode in a single pass
		type BatchData = { verts: number[]; indices: number[]; colors: number[]; offset: number };
		const batches = new Map<TransportMode, BatchData>();

		for (const seg of segments) {
			if (!this.modeFilter.has(seg.mode)) continue;
			const fromCell = this.cells[seg.from];
			const toCell   = this.cells[seg.to];
			if (!fromCell || !toCell) continue;

			let batch = batches.get(seg.mode);
			if (!batch) {
				batch = { verts: [], indices: [], colors: [], offset: 0 };
				batches.set(seg.mode, batch);
			}

			const norm   = Math.min(seg.tripsPerHour / maxFlow, 1);
			const halfW  = MIN_HALF_WIDTH + (MAX_HALF_WIDTH - MIN_HALF_WIDTH) * norm;
			const col    = flowToColor(norm);
			batch.offset = pushColoredRibbon(
				fromCell.center.x, fromCell.center.y,
				toCell.center.x,   toCell.center.y,
				halfW, FLOW_Y, col,
				batch.verts, batch.indices, batch.colors, batch.offset,
			);
		}

		for (const batch of batches.values()) {
			if (batch.verts.length === 0) continue;

			const mat = new THREE.MeshBasicMaterial({
				vertexColors: true,
				transparent:  true,
				opacity:      0.72,
				depthWrite:   false,
				side:         THREE.DoubleSide,
			});
			this.disposables.push(mat);

			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.Float32BufferAttribute(batch.verts,  3));
			geo.setAttribute('color',    new THREE.Float32BufferAttribute(batch.colors, 3));
			geo.setIndex(batch.indices);
			this.disposables.push(geo);

			const mesh = new THREE.Mesh(geo, mat);
			mesh.frustumCulled = false;
			this.ribbonMeshes.push(mesh);
			this.group.add(mesh);
		}
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
			},
			vertexShader:   FlowLineShader.vertexShader,
			fragmentShader: FlowLineShader.fragmentShader,
			transparent:    true,
			depthWrite:     false,
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
		for (const m of this.ribbonMeshes) this.group.remove(m);
		for (const l of this.pulseLines)   this.group.remove(l);
		for (const h of this.haloMeshes)   this.group.remove(h);
		for (const d of this.disposables)  d.dispose();
		this.ribbonMeshes   = [];
		this.pulseLines     = [];
		this.haloMeshes     = [];
		this.disposables    = [];
		this.pulseMaterials = [];
	}
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Push a flat ribbon quad (2 triangles) with per-vertex colours. */
function pushColoredRibbon(
	ax: number, az: number,
	bx: number, bz: number,
	halfWidth: number,
	y: number,
	col: THREE.Color,
	verts: number[],
	indices: number[],
	colors: number[],
	vertexOffset: number,
): number {
	const dx  = bx - ax;
	const dz  = bz - az;
	const len = Math.hypot(dx, dz);
	if (len < 0.001) return vertexOffset;

	const px = (-dz / len) * halfWidth;
	const pz = ( dx / len) * halfWidth;

	verts.push(
		ax + px, y, az + pz,  // 0: left-start
		ax - px, y, az - pz,  // 1: right-start
		bx + px, y, bz + pz,  // 2: left-end
		bx - px, y, bz - pz,  // 3: right-end
	);
	for (let i = 0; i < 4; i++) colors.push(col.r, col.g, col.b);

	const o = vertexOffset;
	indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
	return vertexOffset + 4;
}
