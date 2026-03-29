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

		// Build all segments into a single geometry
		const LINE_Y = 0.15;
		const segmentCount = plants.length * consumers.length;
		const positions = new Float32Array(segmentCount * 6); // 2 points × 3 floats
		let idx = 0;

		for (const plantPos of plants) {
			for (const consumerPos of consumers) {
				positions[idx++] = plantPos.x;
				positions[idx++] = LINE_Y;
				positions[idx++] = plantPos.z;
				positions[idx++] = consumerPos.x;
				positions[idx++] = LINE_Y;
				positions[idx++] = consumerPos.z;
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uTime:        { value: this.elapsed },
				uLineLength:  { value: 100 },
				uTimeOffset:  { value: 0 },
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
