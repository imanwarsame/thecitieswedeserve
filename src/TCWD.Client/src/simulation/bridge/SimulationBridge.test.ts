import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SimulationBridge } from './SimulationBridge';
import { EntityManager } from '../../entities/EntityManager';
import { EntityType } from '../types';
import type { FormaManifestEntry } from '../../scene/GameScene';

// ── Minimal stubs ──────────────────────────────────────────

/** Stub WorldClock so the constructor doesn't advance the sim clock. */
function stubWorldClock() {
	return { getHour: () => 0 } as any;
}

/** Stub GridPlacement (not needed for Forma registration). */
function stubGridPlacement() {
	return {
		isCellFree: () => true,
		occupyCell: () => {},
		freeCell: () => {},
		getCell: () => null,
		getCellWorldPosition: () => null,
	} as any;
}

// ── Tests ──────────────────────────────────────────────────

describe('SimulationBridge – Forma entity registration', () => {
	let bridge: SimulationBridge;

	beforeEach(() => {
		const entityGroup = new THREE.Group();
		const entityManager = new EntityManager(entityGroup);
		bridge = new SimulationBridge(
			entityManager,
			stubGridPlacement(),
			stubWorldClock(),
		);
	});

	it('registers Forma manifest entries as simulation entities', () => {
		const manifest: FormaManifestEntry[] = [
			{
				catalogId: 'housing',
				simulationType: 'housing',
				meshCount: 10,
				positions: [new THREE.Vector3(1, 0, 2), new THREE.Vector3(3, 0, 4)],
			},
			{
				catalogId: 'comercial',
				simulationType: 'commercial',
				meshCount: 5,
				positions: [new THREE.Vector3(10, 0, 20)],
			},
		];

		bridge.registerFormaEntities(manifest);

		const state = bridge.getState();
		const entities = state.entities;

		// Should have created 2 simulation entities (one per manifest entry)
		expect(entities.length).toBe(2);

		const housing = entities.find(e => e.type === EntityType.Housing);
		const commercial = entities.find(e => e.type === EntityType.Commercial);
		expect(housing).toBeDefined();
		expect(commercial).toBeDefined();

		// Housing: 10 meshes × 50 units each = 500
		expect(housing!.type).toBe(EntityType.Housing);
		expect((housing as any).units).toBe(500);

		// Commercial: 5 meshes × 800 floorArea each = 4000
		expect(commercial!.type).toBe(EntityType.Commercial);
		expect((commercial as any).floorArea).toBe(4000);
	});

	it('stores consumer positions for power lines', () => {
		const positions = [
			new THREE.Vector3(1, 0, 2),
			new THREE.Vector3(3, 0, 4),
			new THREE.Vector3(5, 0, 6),
		];

		const manifest: FormaManifestEntry[] = [
			{
				catalogId: 'housing',
				simulationType: 'housing',
				meshCount: 3,
				positions,
			},
		];

		bridge.registerFormaEntities(manifest);

		const consumerPositions = bridge.getFormaConsumerPositions();
		expect(consumerPositions).toHaveLength(3);
		expect(consumerPositions[0].x).toBe(1);
		expect(consumerPositions[1].z).toBe(4);
		expect(consumerPositions[2].x).toBe(5);
	});

	it('skips entries with zero meshes', () => {
		const manifest: FormaManifestEntry[] = [
			{
				catalogId: 'empty',
				simulationType: 'office',
				meshCount: 0,
				positions: [],
			},
		];

		bridge.registerFormaEntities(manifest);

		expect(bridge.getState().entities).toHaveLength(0);
		expect(bridge.getFormaConsumerPositions()).toHaveLength(0);
	});

	it('creates correct entity types for all supported categories', () => {
		const manifest: FormaManifestEntry[] = [
			{ catalogId: 'buildings', simulationType: 'office', meshCount: 2, positions: [new THREE.Vector3()] },
			{ catalogId: 'housing', simulationType: 'housing', meshCount: 3, positions: [new THREE.Vector3()] },
			{ catalogId: 'comercial', simulationType: 'commercial', meshCount: 4, positions: [new THREE.Vector3()] },
			{ catalogId: 'school', simulationType: 'school', meshCount: 1, positions: [new THREE.Vector3()] },
			{ catalogId: 'leasure', simulationType: 'leisure', meshCount: 2, positions: [new THREE.Vector3()] },
		];

		bridge.registerFormaEntities(manifest);

		const entities = bridge.getState().entities;
		expect(entities).toHaveLength(5);

		const types = entities.map(e => e.type).sort();
		expect(types).toEqual([
			EntityType.Commercial,
			EntityType.Housing,
			EntityType.Leisure,
			EntityType.Office,
			EntityType.School,
		].sort());
	});

	it('produces non-zero energy demand after registration', () => {
		const manifest: FormaManifestEntry[] = [
			{
				catalogId: 'housing',
				simulationType: 'housing',
				meshCount: 10,
				positions: Array.from({ length: 10 }, () => new THREE.Vector3()),
			},
		];

		bridge.registerFormaEntities(manifest);

		const state = bridge.getState();
		// Housing demand should be > 0 after recompute
		expect(state.energy.totalDemandMWh).toBeGreaterThan(0);
	});
});
