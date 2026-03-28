import * as THREE from 'three';
import { events } from '../core/Events';
import { EntityManager } from '../entities/EntityManager';

import { EntityType } from '../simulation/types';
import type { SimulationBridge } from '../simulation/bridge/SimulationBridge';

/**
 * Draws power-line connections between energy plants and consumers.
 * Lines use a dashed material and animate their dash offset to
 * visualise energy flow direction (plant → consumer).
 */
export class InfrastructureRenderer {
	private group: THREE.Group;
	private bridge: SimulationBridge;
	private entityManager: EntityManager;
	private lines: THREE.Line[] = [];
	private material: THREE.LineDashedMaterial;
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

		this.material = new THREE.LineDashedMaterial({
			color: 0x888888,
			dashSize: 0.15,
			gapSize: 0.1,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
		});

		events.on('building:placed', this.rebuild);
		events.on('building:removed', this.rebuild);
	}

	/** Animate dash offset each frame. */
	update(delta: number): void {
		this.elapsed += delta * 0.4;
		this.material.dashOffset = -this.elapsed;
	}

	dispose(): void {
		events.off('building:placed', this.rebuild);
		events.off('building:removed', this.rebuild);
		this.clear();
		this.material.dispose();
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
			} else if (
				simEntity.type === EntityType.Housing ||
				simEntity.type === EntityType.DataCentre
			) {
				consumers.push(e.position.clone());
			}
		}

		// Connect each plant to every consumer (simple star topology)
		const LINE_Y = 0.05;
		for (const plantPos of plants) {
			for (const consumerPos of consumers) {
				const points = [
					new THREE.Vector3(plantPos.x, LINE_Y, plantPos.z),
					new THREE.Vector3(consumerPos.x, LINE_Y, consumerPos.z),
				];
				const geometry = new THREE.BufferGeometry().setFromPoints(points);
				const line = new THREE.Line(geometry, this.material);
				line.computeLineDistances(); // required for dashed lines
				this.lines.push(line);
				this.group.add(line);
			}
		}
	};

	private clear(): void {
		for (const line of this.lines) {
			line.geometry.dispose();
			this.group.remove(line);
		}
		this.lines = [];
	}
}
