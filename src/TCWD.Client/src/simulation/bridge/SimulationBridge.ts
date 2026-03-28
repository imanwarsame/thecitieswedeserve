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
import {
	createBuildingMesh,
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

	/** 3D entity id → simulation entity id */
	private renderToSim = new Map<string, string>();
	/** simulation entity id → 3D entity id */
	private simToRender = new Map<string, string>();
	/** 3D entity id → BuildingType */
	private entityBuildingTypes = new Map<string, BuildingType>();

	private lastState: SimulationState;

	constructor(entityManager: EntityManager, gridPlacement: GridPlacement, worldClock: WorldClock) {
		this.engine = new SimulationEngine();
		this.entityManager = entityManager;
		this.gridPlacement = gridPlacement;

		// Sync the simulation clock to the WorldClock's starting hour.
		// The sim clock starts at tick 0 (= hour 0 midnight) but the world
		// may start at e.g. hour 8.  Pre-advance so hours match.
		const startHour = Math.floor(worldClock.getHour());
		for (let i = 0; i < startHour; i++) {
			this.engine.step();
		}

		this.lastState = this.engine.getState();

		events.on('world:hourChanged', this.onHourChanged);
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

		// Create 3D entity
		const mesh = createBuildingMesh(type);
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

	getSimEntityId(renderEntityId: string): string | undefined {
		return this.renderToSim.get(renderEntityId);
	}

	getSimEntity(renderEntityId: string): SimEntity | undefined {
		const simId = this.renderToSim.get(renderEntityId);
		if (!simId) return undefined;
		return this.engine.getEntities().find(e => e.id === simId);
	}

	// ── Tick ─────────────────────────────────────────────────

	/** Manually advance the simulation by one tick. */
	tick(): SimulationState {
		this.lastState = this.engine.step();
		events.emit('simulation:tick', this.lastState);
		return this.lastState;
	}

	// ── Lifecycle ────────────────────────────────────────────

	dispose(): void {
		events.off('world:hourChanged', this.onHourChanged);
	}

	// ── Private ──────────────────────────────────────────────

	private onHourChanged = (): void => {
		this.tick();
	};
}
