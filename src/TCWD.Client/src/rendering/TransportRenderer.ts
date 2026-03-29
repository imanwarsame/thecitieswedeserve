import * as THREE from 'three';
import { events } from '../core/Events';
import type { TransportModule } from '../simulation/transport/TransportModule';
import type { VoronoiCell } from '../grid/types';

// ── Transport Renderer ──────────────────────────────────────
//
// Draws player-placed transport infrastructure as solid mesh ribbons
// (roads, metro, train) — always visible, independent of the flow overlay.
//
// Population-flow / congestion visualisation is handled separately by
// FlowOverlayRenderer, which can be toggled on/off by the user.

const INFRA_COLORS: Record<string, number> = {
	road: 0x999999,
	metro: 0x5566cc,
	train: 0xaa5555,
};

const INFRA_Y = 0.15;
const ROAD_HALF_WIDTH  = 1.2;  // ribbon half-width in world units
const METRO_HALF_WIDTH = 0.8;
const TRAIN_HALF_WIDTH = 0.8;

export class TransportRenderer {
	private group = new THREE.Group();
	/** Sub-group for road meshes (always visible). */
	private roadGroup = new THREE.Group();
	/** Sub-group for metro + train meshes (togglable). */
	private transitGroup = new THREE.Group();
	private meshes: THREE.Mesh[] = [];
	private disposables: THREE.Material[] = [];
	private transportModule: TransportModule;
	private cells: readonly VoronoiCell[];
	private dirty = true;

	constructor(
		parent: THREE.Object3D,
		transportModule: TransportModule,
		cells: readonly VoronoiCell[],
	) {
		this.transportModule = transportModule;
		this.cells = cells;
		this.group.name = 'transport-lines';
		this.roadGroup.name = 'transport-roads';
		this.transitGroup.name = 'transport-transit';
		this.group.add(this.roadGroup);
		this.group.add(this.transitGroup);
		parent.add(this.group);

		events.on('simulation:tick', this.markDirty);
		events.on('transport:roadPlaced', this.markDirty);
		events.on('transport:transitLinkPlaced', this.markDirty);
	}

	update(): void {
		if (!this.dirty) return;
		this.dirty = false;
		this.rebuild();
	}

	/** Show/hide the metro + train transit lines sub-group. */
	setTransitLinesVisible(visible: boolean): void {
		this.transitGroup.visible = visible;
	}

	isTransitLinesVisible(): boolean {
		return this.transitGroup.visible;
	}

	dispose(): void {
		events.off('simulation:tick', this.markDirty);
		events.off('transport:roadPlaced', this.markDirty);
		events.off('transport:transitLinkPlaced', this.markDirty);
		this.clear();
		this.group.parent?.remove(this.group);
	}

	private markDirty = (): void => {
		this.dirty = true;
	};

	private rebuild(): void {
		this.clear();
		this.buildInfrastructureMeshes();
	}

	// ── 1. Infrastructure: mesh-based ribbons ───────────────

	private buildInfrastructureMeshes(): void {
		const network = this.transportModule.network;

		const roadVerts: number[] = [];
		const roadIdx: number[] = [];
		const metroVerts: number[] = [];
		const metroIdx: number[] = [];
		const trainVerts: number[] = [];
		const trainIdx: number[] = [];

		let roadOff = 0;
		let metroOff = 0;
		let trainOff = 0;

		// Explicit roads → ribbon quads + round end-caps
		const roadEndpoints = new Set<number>();
		for (const key of network.getExplicitRoads()) {
			const [aStr, bStr] = key.split('-');
			const a = Number(aStr);
			const b = Number(bStr);
			roadEndpoints.add(a);
			roadEndpoints.add(b);
			const cellA = this.cells[a];
			const cellB = this.cells[b];
			if (!cellA || !cellB) continue;
			roadOff = pushRibbon(
				cellA.center.x, cellA.center.y,
				cellB.center.x, cellB.center.y,
				ROAD_HALF_WIDTH, INFRA_Y, roadVerts, roadIdx, roadOff,
			);
		}
		// Disc at each road cell centre — fills intersections and rounds termini
		for (const idx of roadEndpoints) {
			const cell = this.cells[idx];
			if (!cell) continue;
			roadOff = pushDisc(
				cell.center.x, cell.center.y,
				ROAD_HALF_WIDTH, INFRA_Y, roadVerts, roadIdx, roadOff,
			);
		}

		// Metro: explicit links + station discs
		const metroStations = new Set<number>();
		for (const key of network.getExplicitMetroLinks()) {
			const [aStr, bStr] = key.split('-');
			const a = Number(aStr);
			const b = Number(bStr);
			metroStations.add(a);
			metroStations.add(b);
			const cellA = this.cells[a];
			const cellB = this.cells[b];
			if (!cellA || !cellB) continue;
			metroOff = pushRibbon(
				cellA.center.x, cellA.center.y,
				cellB.center.x, cellB.center.y,
				METRO_HALF_WIDTH, INFRA_Y, metroVerts, metroIdx, metroOff,
			);
		}
		// Also add any metro cells that haven't been linked yet (standalone stations)
		for (const idx of network.getCellIndices()) {
			if (network.hasMetro(idx)) metroStations.add(idx);
		}
		for (const idx of metroStations) {
			const cell = this.cells[idx];
			if (!cell) continue;
			metroOff = pushDisc(
				cell.center.x, cell.center.y,
				METRO_HALF_WIDTH, INFRA_Y, metroVerts, metroIdx, metroOff,
			);
		}

		// Train: explicit links + station discs
		const trainStations = new Set<number>();
		for (const key of network.getExplicitTrainLinks()) {
			const [aStr, bStr] = key.split('-');
			const a = Number(aStr);
			const b = Number(bStr);
			trainStations.add(a);
			trainStations.add(b);
			const cellA = this.cells[a];
			const cellB = this.cells[b];
			if (!cellA || !cellB) continue;
			trainOff = pushRibbon(
				cellA.center.x, cellA.center.y,
				cellB.center.x, cellB.center.y,
				TRAIN_HALF_WIDTH, INFRA_Y, trainVerts, trainIdx, trainOff,
			);
		}
		for (const idx of network.getCellIndices()) {
			if (network.hasTrain(idx)) trainStations.add(idx);
		}
		for (const idx of trainStations) {
			const cell = this.cells[idx];
			if (!cell) continue;
			trainOff = pushDisc(
				cell.center.x, cell.center.y,
				TRAIN_HALF_WIDTH, INFRA_Y, trainVerts, trainIdx, trainOff,
			);
		}

		const sets: [string, number[], number[], THREE.Group][] = [
			['road', roadVerts, roadIdx, this.roadGroup],
			['metro', metroVerts, metroIdx, this.transitGroup],
			['train', trainVerts, trainIdx, this.transitGroup],
		];

		for (const [kind, verts, indices, parent] of sets) {
			if (verts.length === 0) continue;
			const mat = new THREE.MeshBasicMaterial({
				color: INFRA_COLORS[kind],
				transparent: true,
				opacity: 0.85,
				depthWrite: false,
				side: THREE.DoubleSide,
			});
			this.disposables.push(mat);

			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
			geo.setIndex(indices);
			geo.computeVertexNormals();
			const mesh = new THREE.Mesh(geo, mat);
			mesh.frustumCulled = false;
			this.meshes.push(mesh);
			parent.add(mesh);
		}
	}

	// ── Cleanup ─────────────────────────────────────────────

	private clear(): void {
		for (const m of this.meshes) {
			m.geometry.dispose();
			if (m.parent) m.parent.remove(m);
		}
		for (const d of this.disposables) d.dispose();
		this.meshes       = [];
		this.disposables  = [];
	}
}

// ── Helpers ─────────────────────────────────────────────────

/** Push a flat ribbon quad (2 triangles) between two cell centres. */
function pushRibbon(
	ax: number, az: number,
	bx: number, bz: number,
	halfWidth: number,
	y: number,
	verts: number[],
	indices: number[],
	vertexOffset: number,
): number {
	const dx = bx - ax;
	const dz = bz - az;
	const len = Math.hypot(dx, dz);
	if (len < 0.001) return vertexOffset;
	// Perpendicular direction
	const px = (-dz / len) * halfWidth;
	const pz = (dx / len) * halfWidth;

	// 4 vertices of the ribbon quad
	verts.push(
		ax + px, y, az + pz,  // 0 (left-start)
		ax - px, y, az - pz,  // 1 (right-start)
		bx + px, y, bz + pz,  // 2 (left-end)
		bx - px, y, bz - pz,  // 3 (right-end)
	);

	// 2 triangles: 0-1-2, 1-3-2
	const o = vertexOffset;
	indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);

	return vertexOffset + 4;
}

/**
 * Push a circular disc (triangle fan) centred at (cx, cz) at height y.
 * Used as round end-caps and junction fills for all infrastructure types.
 */
function pushDisc(
	cx: number, cz: number,
	radius: number,
	y: number,
	verts: number[],
	indices: number[],
	vertexOffset: number,
): number {
	const N = 12; // segments — gives a smooth circle at typical road widths
	verts.push(cx, y, cz); // centre vertex
	for (let i = 0; i < N; i++) {
		const angle = (i / N) * Math.PI * 2;
		verts.push(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius);
	}
	const o = vertexOffset;
	for (let i = 0; i < N; i++) {
		indices.push(o, o + 1 + i, o + 1 + (i + 1) % N);
	}
	return vertexOffset + N + 1;
}
