import * as THREE from 'three';
import { events } from '../core/Events';
import { EntityManager } from '../entities/EntityManager';
import { EnergyLineShader } from './shaders/EnergyLineShader';

import { EntityType } from '../simulation/types';
import type { SimulationBridge } from '../simulation/bridge/SimulationBridge';

/**
 * Draws energy-flow connections between power plants and consumers.
 * Each line uses a custom shader with directional dashes and a
 * travelling pulse to visualise energy flow (plant → consumer).
 */
export class InfrastructureRenderer {
	private group: THREE.Group;
	private bridge: SimulationBridge;
	private entityManager: EntityManager;
	private lines: THREE.Line[] = [];
	private materials: THREE.ShaderMaterial[] = [];
	private elapsed = 0;

	constructor(
		parent: THREE.Group,
		bridge: SimulationBridge,
		entityManager: EntityManager,
	) {
		this.group = new THREE.Group();
		this.group.name = 'infrastructure';
		parent.add(this.group);

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
		for (const mat of this.materials) {
			mat.uniforms.uTime.value = this.elapsed;
		}
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

	private createLineMaterial(lineLength: number): THREE.ShaderMaterial {
		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uTime:        { value: this.elapsed },
				uLineLength:  { value: lineLength },
				uTimeOffset:  { value: Math.random() * 20 },
				uColor:       { value: new THREE.Color(0x888888) },
				uOpacity:     { value: EnergyLineShader.uniforms.uOpacity.value },
				uPulseSpeed:  { value: EnergyLineShader.uniforms.uPulseSpeed.value },
				uPulseSize:   { value: EnergyLineShader.uniforms.uPulseSize.value },
				uPulseBright: { value: EnergyLineShader.uniforms.uPulseBright.value },
			},
			vertexShader: EnergyLineShader.vertexShader,
			fragmentShader: EnergyLineShader.fragmentShader,
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -4,
			polygonOffsetUnits: -4,
		});
		return mat;
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

		// Connect each plant → consumer (star topology, direction matters)
		const LINE_Y = 0.15;
		for (const plantPos of plants) {
			for (const consumerPos of consumers) {
				const start = new THREE.Vector3(plantPos.x, LINE_Y, plantPos.z);
				const end = new THREE.Vector3(consumerPos.x, LINE_Y, consumerPos.z);
				const lineLength = start.distanceTo(end);

				const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
				const material = this.createLineMaterial(lineLength);
				const line = new THREE.Line(geometry, material);
				line.computeLineDistances(); // populates lineDistance attribute

				this.lines.push(line);
				this.materials.push(material);
				this.group.add(line);
			}
		}
	};

	private clear(): void {
		for (const line of this.lines) {
			line.geometry.dispose();
		}
		for (const mat of this.materials) {
			mat.dispose();
		}
		this.lines = [];
		this.materials = [];
		// Remove all children at once
		while (this.group.children.length) {
			this.group.remove(this.group.children[0]);
		}
	}
}
