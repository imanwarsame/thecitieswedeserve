import * as THREE from 'three';
import { events } from '../core/Events';
import { EntityManager } from '../entities/EntityManager';
import { EnergyLineShader } from './shaders/EnergyLineShader';

import { EntityType } from '../simulation/types';
import type { SimulationBridge } from '../simulation/bridge/SimulationBridge';

/**
 * Draws energy-flow connections between power plants and consumers.
 * All line segments are merged into a single LineSegments draw call
 * with a shared shader material for minimal GPU overhead.
 */
export class InfrastructureRenderer {
	private group: THREE.Group;
	private scene: THREE.Scene;
	private bridge: SimulationBridge;
	private entityManager: EntityManager;
	private linesMesh: THREE.LineSegments | null = null;
	private material: THREE.ShaderMaterial | null = null;
	private elapsed = 0;
	private bgLum = new THREE.Color();

	constructor(
		parent: THREE.Group,
		scene: THREE.Scene,
		bridge: SimulationBridge,
		entityManager: EntityManager,
	) {
		this.group = new THREE.Group();
		this.group.name = 'infrastructure';
		parent.add(this.group);

		this.scene = scene;
		this.bridge = bridge;
		this.entityManager = entityManager;

		events.on('building:placed', this.rebuild);
		events.on('building:removed', this.rebuild);
		events.on('housing:placed', this.rebuild);
		events.on('housing:demolished', this.rebuild);
	}

	/** Advance shader time each frame. */
	update(delta: number): void {
		this.elapsed += delta;
		if (!this.material) return;

		// Derive darkness from scene background luminance
		let darkness = 0.0;
		const bg = this.scene.background;
		if (bg && (bg as THREE.Color).isColor) {
			this.bgLum.copy(bg as THREE.Color);
			const hsl = { h: 0, s: 0, l: 0 };
			this.bgLum.getHSL(hsl);
			darkness = 1.0 - hsl.l;
		}

		this.material.uniforms.uTime.value = this.elapsed;
		this.material.uniforms.uDarkness.value = darkness;
	}

	dispose(): void {
		events.off('building:placed', this.rebuild);
		events.off('building:removed', this.rebuild);
		events.off('housing:placed', this.rebuild);
		events.off('housing:demolished', this.rebuild);
		this.clear();
		this.group.parent?.remove(this.group);
	}

	// ── Internals ──────────────────────────────────────────

	/**
	 * Build an MST (Prim's algorithm) over the given points.
	 * Returns edges as index pairs into the points array.
	 */
	private buildMST(points: THREE.Vector3[]): [number, number][] {
		const n = points.length;
		if (n < 2) return [];

		const inMST = new Uint8Array(n);
		const minCost = new Float64Array(n).fill(Infinity);
		const minEdge = new Int32Array(n).fill(-1);
		const edges: [number, number][] = [];

		// Start from node 0
		minCost[0] = 0;

		for (let iter = 0; iter < n; iter++) {
			// Pick the cheapest non-MST node
			let u = -1;
			for (let i = 0; i < n; i++) {
				if (!inMST[i] && (u === -1 || minCost[i] < minCost[u])) u = i;
			}
			inMST[u] = 1;
			if (minEdge[u] !== -1) edges.push([minEdge[u], u]);

			// Update neighbours
			const ux = points[u].x, uz = points[u].z;
			for (let v = 0; v < n; v++) {
				if (inMST[v]) continue;
				const dx = points[v].x - ux;
				const dz = points[v].z - uz;
				const d2 = dx * dx + dz * dz;
				if (d2 < minCost[v]) {
					minCost[v] = d2;
					minEdge[v] = u;
				}
			}
		}
		return edges;
	}

	/** Find the index of the closest point to `target`. */
	private nearest(target: THREE.Vector3, points: THREE.Vector3[]): number {
		let best = 0, bestD2 = Infinity;
		for (let i = 0; i < points.length; i++) {
			const dx = points[i].x - target.x;
			const dz = points[i].z - target.z;
			const d2 = dx * dx + dz * dz;
			if (d2 < bestD2) { bestD2 = d2; best = i; }
		}
		return best;
	}

	private rebuild = (): void => {
		this.clear();

		const entities = this.entityManager.getAll();
		const plants: THREE.Vector3[] = [];
		const consumers: THREE.Vector3[] = [];

		for (const e of entities) {
			if (!e.simulationId) continue;
			const simEntity = this.bridge.getSimEntity(e.id);
			if (!simEntity) continue;

			if (simEntity.type === EntityType.EnergyPlant) {
				plants.push(e.position.clone());
			} else if (simEntity.type !== EntityType.Transport) {
				consumers.push(e.position.clone());
			}
		}

		// Include WFC-placed housing as consumers
		for (const pos of this.bridge.getHousingPositions()) {
			consumers.push(pos);
		}

		// Include pre-existing Forma building meshes as consumers
		for (const pos of this.bridge.getFormaConsumerPositions()) {
			consumers.push(pos);
		}

		if (plants.length === 0 || consumers.length === 0) return;

		// Build an MST across all consumers to form the distribution grid,
		// then connect each plant to the nearest consumer with one line.
		const mstEdges = this.buildMST(consumers);
		const plantEdges: [THREE.Vector3, THREE.Vector3][] = [];
		for (const plantPos of plants) {
			const ci = this.nearest(plantPos, consumers);
			plantEdges.push([plantPos, consumers[ci]]);
		}

		const LINE_Y = 0.15;
		const segmentCount = mstEdges.length + plantEdges.length;
		const positions   = new Float32Array(segmentCount * 6);
		const segmentTs   = new Float32Array(segmentCount * 2);
		const timeOffsets = new Float32Array(segmentCount * 2);
		let idx = 0;
		let attrIdx = 0;

		// MST grid edges (consumer ↔ consumer)
		for (const [a, b] of mstEdges) {
			positions[idx++] = consumers[a].x;
			positions[idx++] = LINE_Y;
			positions[idx++] = consumers[a].z;
			positions[idx++] = consumers[b].x;
			positions[idx++] = LINE_Y;
			positions[idx++] = consumers[b].z;

			const offset = Math.random() * 50;
			segmentTs[attrIdx]   = 0.0;
			timeOffsets[attrIdx] = offset;
			attrIdx++;
			segmentTs[attrIdx]   = 1.0;
			timeOffsets[attrIdx] = offset;
			attrIdx++;
		}

		// Plant → nearest consumer edges
		for (const [from, to] of plantEdges) {
			positions[idx++] = from.x;
			positions[idx++] = LINE_Y;
			positions[idx++] = from.z;
			positions[idx++] = to.x;
			positions[idx++] = LINE_Y;
			positions[idx++] = to.z;

			const offset = Math.random() * 50;
			segmentTs[attrIdx]   = 0.0;
			timeOffsets[attrIdx] = offset;
			attrIdx++;
			segmentTs[attrIdx]   = 1.0;
			timeOffsets[attrIdx] = offset;
			attrIdx++;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position',    new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('aSegmentT',   new THREE.BufferAttribute(segmentTs, 1));
		geometry.setAttribute('aTimeOffset', new THREE.BufferAttribute(timeOffsets, 1));

		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uTime:        { value: this.elapsed },
				uColor:       { value: new THREE.Color(0x888888) },
				uOpacity:     { value: EnergyLineShader.uniforms.uOpacity.value },
				uPulseSpeed:  { value: EnergyLineShader.uniforms.uPulseSpeed.value },
				uPulseSize:   { value: EnergyLineShader.uniforms.uPulseSize.value },
				uPulseBright: { value: EnergyLineShader.uniforms.uPulseBright.value },
				uDarkness:    { value: 0 },
			},
			vertexShader: EnergyLineShader.vertexShader,
			fragmentShader: EnergyLineShader.fragmentShader,
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -4,
			polygonOffsetUnits: -4,
		});

		this.linesMesh = new THREE.LineSegments(geometry, this.material);
		this.group.add(this.linesMesh);
	};

	private clear(): void {
		if (this.linesMesh) {
			this.linesMesh.geometry.dispose();
			this.group.remove(this.linesMesh);
			this.linesMesh = null;
		}
		if (this.material) {
			this.material.dispose();
			this.material = null;
		}
	}
}
