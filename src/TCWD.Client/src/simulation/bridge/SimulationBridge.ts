import {
	SimulationEngine,
	EntityType,
	createDataCentre,
	createHousing,
	createEnergyPlant,
} from '../index';
import type { SimulationState, Entity as SimEntity } from '../index';
import { events } from '../../core/Events';
import { Entity } from '../../entities/Entity';
import { EntityManager } from '../../entities/EntityManager';
import { GridPlacement } from '../../grid/GridPlacement';
import type { WorldClock } from '../../gameplay/WorldClock';
import type { ModelFactory } from '../../assets/ModelFactory';
import type { HousingSystem } from '../../housing/HousingSystem';
import * as THREE from 'three';
import {
	createBuildingModel,
	simEntityTypeFromBuildingType,
	type BuildingType,
} from './BuildingFactory';

/**
 * Bridges the headless SimulationEngine with the 3D world.
 *
 * - Maintains a bidirectional map between 3D Entity ids and simulation Entity ids.
 * - Listens to `world:hourChanged` to auto-tick the simulation once per in-game hour.
 * - Emits `simulation:tick` with the latest SimulationState after each step.
 * - Provides add/remove building methods that synchronise both worlds.
 */
export class SimulationBridge {
	private engine: SimulationEngine;
	private entityManager: EntityManager;
	private gridPlacement: GridPlacement;
	private modelFactory?: ModelFactory;
	private housingSystem?: HousingSystem;

	/** 3D entity id → simulation entity id */
	private renderToSim = new Map<string, string>();
	/** simulation entity id → 3D entity id */
	private simToRender = new Map<string, string>();
	/** 3D entity id → BuildingType */
	private entityBuildingTypes = new Map<string, BuildingType>();
	/** 3D entity id → AnimationMixer (for animated GLB models) */
	private mixers = new Map<string, THREE.AnimationMixer>();

	/** cell index → simulation entity id for WFC-placed housing */
	private housingSimIds = new Map<number, string>();

	private lastState: SimulationState;

	constructor(entityManager: EntityManager, gridPlacement: GridPlacement, worldClock: WorldClock, modelFactory?: ModelFactory) {
		this.engine = new SimulationEngine();
		this.entityManager = entityManager;
		this.gridPlacement = gridPlacement;
		this.modelFactory = modelFactory;

		// Sync the simulation clock to the WorldClock's starting hour.
		// The sim clock starts at tick 0 (= hour 0 midnight) but the world
		// may start at e.g. hour 8.  Pre-advance so hours match.
		const startHour = Math.floor(worldClock.getHour());
		for (let i = 0; i < startHour; i++) {
			this.engine.step();
		}

		this.lastState = this.engine.getState();

		events.on('world:hourChanged', this.onHourChanged);
		events.on('housing:placed', this.onHousingPlaced);
		events.on('housing:demolished', this.onHousingDemolished);
	}

	/** Connect the WFC housing system so housing placements register as energy demand. */
	setHousingSystem(housing: HousingSystem): void {
		this.housingSystem = housing;
	}

	// ── Building management ──────────────────────────────────

	addBuilding(type: BuildingType, cellIndex: number): Entity | null {
		if (!this.gridPlacement.isCellFree(cellIndex)) return null;

		const worldPos = this.gridPlacement.getCellWorldPosition(cellIndex, 0);
		if (!worldPos) return null;

		// Create simulation entity
		const info = simEntityTypeFromBuildingType(type);
		let simEntity: SimEntity;
		switch (info.entityType) {
			case EntityType.Housing:
				simEntity = createHousing();
				break;
			case EntityType.DataCentre:
				simEntity = createDataCentre();
				break;
			case EntityType.EnergyPlant:
				simEntity = createEnergyPlant(info.fuelType!);
				break;
			default:
				return null;
		}

		this.engine.addEntity(simEntity);

		// Create 3D entity (prefer GLB model if available)
		const { root: mesh, mixer } = createBuildingModel(type, this.modelFactory);
		const entity = new Entity({
			name: simEntity.name,
			mesh,
			position: worldPos,
			cellIndex,
		});
		(entity as Entity & { simulationId: string }).simulationId = simEntity.id;

		this.gridPlacement.occupyCell(cellIndex);
		this.entityManager.spawn(entity);

		// Track mapping
		this.renderToSim.set(entity.id, simEntity.id);
		this.simToRender.set(simEntity.id, entity.id);
		this.entityBuildingTypes.set(entity.id, type);

		if (mixer) {
			this.mixers.set(entity.id, mixer);
		}

		events.emit('building:placed', { entityId: entity.id, simId: simEntity.id, type, cellIndex });

		// Recompute metrics immediately so the dashboard reflects the new building
		this.lastState = this.engine.recompute();
		events.emit('simulation:tick', this.lastState);

		return entity;
	}

	removeBuilding(entityId: string): boolean {
		const simId = this.renderToSim.get(entityId);
		if (!simId) return false;

		const entity = this.entityManager.get(entityId);
		if (entity) {
			this.gridPlacement.freeCell(entity.cellIndex);
		}

		this.engine.removeEntity(simId);
		this.entityManager.remove(entityId);

		this.renderToSim.delete(entityId);
		this.simToRender.delete(simId);
		this.entityBuildingTypes.delete(entityId);

		const mixer = this.mixers.get(entityId);
		if (mixer) {
			mixer.stopAllAction();
			this.mixers.delete(entityId);
		}

		events.emit('building:removed', { entityId, simId });

		// Recompute metrics immediately so the dashboard reflects the removal
		this.lastState = this.engine.recompute();
		events.emit('simulation:tick', this.lastState);

		return true;
	}

	// ── Accessors ────────────────────────────────────────────

	getState(): SimulationState {
		return this.lastState;
	}

	getSimEngine(): SimulationEngine {
		return this.engine;
	}

	getBuildingType(entityId: string): BuildingType | undefined {
		return this.entityBuildingTypes.get(entityId);
	}

	getBuildingTypeAtCell(cellIndex: number): BuildingType | undefined {
		const renderEntity = this.entityManager.getEntityAtCell(cellIndex);
		if (renderEntity) {
			return this.entityBuildingTypes.get(renderEntity.id);
		}

		if (this.housingSimIds.has(cellIndex)) {
			return 'housing';
		}

		return undefined;
	}

	getSimEntityId(renderEntityId: string): string | undefined {
		return this.renderToSim.get(renderEntityId);
	}

	getSimEntity(renderEntityId: string): SimEntity | undefined {
		const simId = this.renderToSim.get(renderEntityId);
		if (!simId) return undefined;
		return this.engine.getEntities().find(e => e.id === simId);
	}

	getSimEntityAtCell(cellIndex: number): SimEntity | undefined {
		const renderEntity = this.entityManager.getEntityAtCell(cellIndex);
		if (renderEntity) {
			return this.getSimEntity(renderEntity.id);
		}

		const housingSimId = this.housingSimIds.get(cellIndex);
		if (!housingSimId) return undefined;

		return this.engine.getEntities().find(e => e.id === housingSimId);
	}

	/** Return world positions for all WFC-placed housing cells (for infrastructure lines). */
	getHousingPositions(): THREE.Vector3[] {
		const positions: THREE.Vector3[] = [];
		for (const cellIndex of this.housingSimIds.keys()) {
			const pos = this.gridPlacement.getCellWorldPosition(cellIndex, 0);
			if (pos) positions.push(pos);
		}
		return positions;
	}

	// ── Tick ─────────────────────────────────────────────────

	/** Manually advance the simulation by one tick. */
	tick(): SimulationState {
		this.lastState = this.engine.step();
		events.emit('simulation:tick', this.lastState);
		return this.lastState;
	}

	/** Advance all active animation mixers. Call once per frame. */
	updateAnimations(delta: number): void {
		for (const mixer of this.mixers.values()) {
			mixer.update(delta);
		}
	}

	// ── Lifecycle ────────────────────────────────────────────

	dispose(): void {
		events.off('world:hourChanged', this.onHourChanged);
		events.off('housing:placed', this.onHousingPlaced);
		events.off('housing:demolished', this.onHousingDemolished);
		for (const mixer of this.mixers.values()) {
			mixer.stopAllAction();
		}
		this.mixers.clear();
	}

	// ── Private ──────────────────────────────────────────────

	private onHourChanged = (): void => {
		this.tick();
	};

	/**
	 * When WFC housing is placed, create or update a simulation HousingEntity
	 * so the energy layer counts its demand.
	 */
	private onHousingPlaced = (data: unknown): void => {
		const { cellIndex } = data as { cellIndex: number; height: number };
		if (!this.housingSystem) return;

		const units = this.housingSystem.getHousingUnits(cellIndex);
		const existingId = this.housingSimIds.get(cellIndex);

		if (existingId) {
			// Remove the old entity and replace with updated unit count
			this.engine.removeEntity(existingId);
		}

		const simEntity = createHousing({ units });
		this.engine.addEntity(simEntity);
		this.housingSimIds.set(cellIndex, simEntity.id);

		this.lastState = this.engine.recompute();
		events.emit('simulation:tick', this.lastState);
	};

	/**
	 * When WFC housing is demolished, remove the corresponding simulation entity.
	 */
	private onHousingDemolished = (data: unknown): void => {
		const { cellIndex } = data as { cellIndex: number };
		const simId = this.housingSimIds.get(cellIndex);
		if (!simId) return;

		this.engine.removeEntity(simId);
		this.housingSimIds.delete(cellIndex);

		this.lastState = this.engine.recompute();
		events.emit('simulation:tick', this.lastState);
	};
}
