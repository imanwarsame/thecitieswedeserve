import {
	SimulationEngine,
	EntityType,
	createDataCentre,
	createHousing,
	createEnergyPlant,
	createTransport,
	createOffice,
	createCommercial,
	createSchool,
	createLeisure,
	createPark,
} from '../index';
import type { SimulationState, Entity as SimEntity } from '../index';
import type { FormaManifestEntry } from '../../scene/GameScene';
import { events } from '../../core/Events';
import { Entity } from '../../entities/Entity';
import { EntityManager } from '../../entities/EntityManager';
import { GridPlacement } from '../../grid/GridPlacement';
import type { GridQuery } from '../../grid/GridQuery';
import type { WorldClock } from '../../gameplay/WorldClock';
import type { ModelFactory } from '../../assets/ModelFactory';
import type { HousingSystem } from '../../housing/HousingSystem';
import type { TransportModule } from '../transport/TransportModule';
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
	private transportModule?: TransportModule;

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
	/** Simulation entity ids created from pre-existing Forma GLB models */
	private formaSimIds: string[] = [];
	/** World-space positions of Forma building meshes (consumers for power lines) */
	private formaConsumerPositions: THREE.Vector3[] = [];

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

	/** Connect the transport module for infrastructure placement and entity mapping. */
	setTransportModule(module: TransportModule): void {
		this.transportModule = module;
		this.engine.setTransportModule(module);
	}

	// ── Forma baseline entities ─────────────────────────────

	/**
	 * Register pre-existing Forma GLB meshes as individual simulation entities.
	 * Each mesh in every manifest entry becomes its own Entity + SimEntity pair,
	 * mapped to the nearest grid cell — behaving like a user-placed building.
	 */
	registerFormaEntities(manifest: readonly FormaManifestEntry[]): void {
		const grid = this.gridPlacement;

		for (const entry of manifest) {
			const n = entry.meshCount;
			if (n === 0) continue;

			let registered = 0;
			for (let i = 0; i < n; i++) {
				const mesh = entry.meshes[i];
				const pos = entry.positions[i];
				if (!mesh || !pos) continue;

				// Create individual simulation entity
				const simEntity = this.createSimEntityForType(entry.simulationType, entry.catalogId);
				if (!simEntity) continue;

				this.engine.addEntity(simEntity);
				this.formaSimIds.push(simEntity.id);

				// Find nearest free grid cell
				const cell = grid.findFreeCellNear(pos.x, pos.z);
				const cellIndex = cell ? cell.index : -1;

				// Create 3D Entity wrapper (mesh stays in Forma group — not re-parented)
				const entity = new Entity({
					name: simEntity.name,
					catalogId: entry.catalogId,
					mesh,
					position: pos,
					cellIndex,
					simulationId: simEntity.id,
					externalMesh: true,
				});

				this.entityManager.spawnExternal(entity);

				if (cellIndex >= 0) {
					grid.occupyCell(cellIndex);
				}

				// Bidirectional mapping
				this.renderToSim.set(entity.id, simEntity.id);
				this.simToRender.set(simEntity.id, entity.id);
				this.entityBuildingTypes.set(entity.id, entry.simulationType);

				// Store position as consumer endpoint for power lines
				this.formaConsumerPositions.push(pos.clone());

				// Map to transport
				if (this.transportModule && cellIndex >= 0) {
					this.transportModule.mapEntityToCell(simEntity.id, cellIndex);
				}

				registered++;
			}

			console.log(`[SimBridge] Registered ${registered} Forma "${entry.catalogId}" entities as ${entry.simulationType}`);
		}

		// Recompute so dashboard reflects the baseline immediately
		if (this.formaSimIds.length > 0) {
			this.lastState = this.engine.recompute();
			events.emit('simulation:tick', this.lastState);
		}
	}

	/** Create an individual simulation entity for a Forma building mesh. */
	private createSimEntityForType(type: BuildingType, catalogId: string): SimEntity | null {
		switch (type) {
			case 'housing':
				return createHousing({ name: `Forma ${catalogId}`, units: 50, avgConsumptionKWh: 4_500 });
			case 'commercial':
				return createCommercial({ name: `Forma ${catalogId}`, floorArea: 800, avgConsumptionKWh: 200_000 });
			case 'office':
				return createOffice({ name: `Forma ${catalogId}`, floorArea: 1_000, employeeCount: 100, avgConsumptionKWh: 250_000 });
			case 'school':
				return createSchool({ name: `Forma ${catalogId}`, studentCapacity: 500, avgConsumptionKWh: 400_000 });
			case 'leisure':
				return createLeisure({ name: `Forma ${catalogId}`, visitorCapacity: 300, avgConsumptionKWh: 350_000 });
			default:
				return null;
		}
	}

	/** World-space positions of Forma building meshes (for infrastructure power lines). */
	getFormaConsumerPositions(): THREE.Vector3[] {
		return this.formaConsumerPositions;
	}

	// ── Forma road registration ───────────────────────────────

	/**
	 * Register pre-existing Forma road meshes as transport edges.
	 * Each road mesh position is mapped to the nearest grid cell.
	 * Adjacent cells that both contain road meshes get a road edge,
	 * enabling Road+Cycle transport routing through the baseline network.
	 */
	registerFormaRoads(roadPositions: readonly THREE.Vector3[], gridQuery: GridQuery): void {
		if (!this.transportModule) return;
		if (roadPositions.length === 0) return;

		// Map each road mesh position to a grid cell
		const roadCells = new Set<number>();
		for (const pos of roadPositions) {
			const cellIndex = gridQuery.findCell(pos.x, pos.z);
			if (cellIndex >= 0) {
				roadCells.add(cellIndex);
			}
		}

		// For each pair of adjacent road cells, add a road edge
		let edgesAdded = 0;
		for (const cellIndex of roadCells) {
			const cell = gridQuery.getCell(cellIndex);
			if (!cell) continue;
			for (const neighborIndex of cell.neighbors) {
				if (roadCells.has(neighborIndex)) {
					this.transportModule.addRoad(cellIndex, neighborIndex);
					edgesAdded++;
				}
			}
		}

		console.log(`[SimBridge] Registered ${roadCells.size} Forma road cells, ${edgesAdded} road edges`);
	}

	// ── Building management ──────────────────────────────────

	/** Place an explicit road between two adjacent cells. */
	addRoad(fromCell: number, toCell: number): void {
		if (!this.transportModule) return;
		this.transportModule.addRoad(fromCell, toCell);
		events.emit('transport:roadPlaced', { fromCell, toCell });
	}

	/** Draw a metro link between two station cells (any distance). */
	addMetroLink(fromCell: number, toCell: number): void {
		if (!this.transportModule) return;
		this.transportModule.addMetroLink(fromCell, toCell);
		events.emit('transport:transitLinkPlaced', { fromCell, toCell, mode: 'metro' });
	}

	/** Draw a train link between two station cells (any distance). */
	addTrainLink(fromCell: number, toCell: number): void {
		if (!this.transportModule) return;
		this.transportModule.addTrainLink(fromCell, toCell);
		events.emit('transport:transitLinkPlaced', { fromCell, toCell, mode: 'train' });
	}

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
			case EntityType.Office:
				simEntity = createOffice();
				break;
			case EntityType.Commercial:
				simEntity = createCommercial();
				break;
			case EntityType.School:
				simEntity = createSchool();
				break;
			case EntityType.Leisure:
				simEntity = createLeisure();
				break;
			case EntityType.Park:
				simEntity = createPark();
				break;
			case EntityType.Transport:
				simEntity = createTransport();
				break;
			default:
				return null;
		}

		this.engine.addEntity(simEntity);

		// Create 3D entity (prefer GLB model if available; pass cell for cell-filling types)
		const cell = this.gridPlacement.getCell(cellIndex) ?? undefined;
		const { root: mesh, mixer } = createBuildingModel(type, this.modelFactory, cell);
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

		// Notify transport module of new entity → cell mapping
		if (this.transportModule) {
			this.transportModule.mapEntityToCell(simEntity.id, cellIndex);
			// Infrastructure placement
			if (type === 'metro') this.transportModule.addMetro(cellIndex);
			if (type === 'train') this.transportModule.addTrain(cellIndex);
		}

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

		// Notify transport module
		if (this.transportModule) {
			this.transportModule.unmapEntity(simId);
		}

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

	/** Map of cell index → BuildingType for every occupied cell. */
	getCellLandUseMap(): Map<number, BuildingType> {
		const map = new Map<number, BuildingType>();

		// Entities placed via addBuilding (have a render Entity with a cellIndex)
		for (const [renderId, bt] of this.entityBuildingTypes) {
			const entity = this.entityManager.get(renderId);
			if (entity && entity.cellIndex >= 0) {
				map.set(entity.cellIndex, bt);
			}
		}

		// WFC housing cells
		for (const cellIndex of this.housingSimIds.keys()) {
			map.set(cellIndex, 'housing');
		}

		return map;
	}

	/** Map of cell index → annual energy consumption (kWh) for every occupied cell. */
	getCellEnergyMap(): Map<number, number> {
		const map = new Map<number, number>();
		const entities = this.engine.getEntities();
		const entityById = new Map(entities.map(e => [e.id, e]));

		// Entities placed via addBuilding
		for (const [renderId, simId] of this.renderToSim) {
			const renderEnt = this.entityManager.get(renderId);
			if (!renderEnt || renderEnt.cellIndex < 0) continue;
			const simEnt = entityById.get(simId);
			if (!simEnt) continue;
			map.set(renderEnt.cellIndex, entityEnergyKWh(simEnt));
		}

		// WFC housing cells
		for (const [cellIndex, simId] of this.housingSimIds) {
			const simEnt = entityById.get(simId);
			if (!simEnt) continue;
			map.set(cellIndex, entityEnergyKWh(simEnt));
		}

		return map;
	}

	/** Map of cell index → 3D mesh for non-housing placed entities. */
	getCellEntityMeshMap(): Map<number, THREE.Object3D> {
		const map = new Map<number, THREE.Object3D>();
		for (const [renderId] of this.renderToSim) {
			const entity = this.entityManager.get(renderId);
			if (entity && entity.cellIndex >= 0 && entity.mesh) {
				map.set(entity.cellIndex, entity.mesh);
			}
		}
		return map;
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

	/** Soft reset: clear all placed buildings, transport, and sim state without unsubscribing events. */
	clearAll(): void {
		// Stop all animation mixers
		for (const mixer of this.mixers.values()) mixer.stopAllAction();
		this.mixers.clear();

		// Clear bidirectional maps
		this.renderToSim.clear();
		this.simToRender.clear();
		this.entityBuildingTypes.clear();
		this.housingSimIds.clear();
		this.formaSimIds.length = 0;
		this.formaConsumerPositions.length = 0;

		// Reset headless simulation engine (removes all entities, resets clock)
		this.engine.reset();
		this.lastState = this.engine.getState();

		// Reset transport: clear entity-cell map; network is re-inited by Engine.
	}

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

		// Map housing to cell for transport routing
		if (this.transportModule) {
			this.transportModule.mapEntityToCell(simEntity.id, cellIndex);
		}

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

		// Unmap from transport
		if (this.transportModule) {
			this.transportModule.unmapEntity(simId);
		}

		this.lastState = this.engine.recompute();
		events.emit('simulation:tick', this.lastState);
	};
}

// ── Helpers ──────────────────────────────────────────────────

/** Extract the annual energy consumption (kWh) from any simulation entity. */
function entityEnergyKWh(entity: SimEntity): number {
	switch (entity.type) {
		case EntityType.Housing:
			return entity.units * entity.avgConsumptionKWh;
		case EntityType.DataCentre:
			return entity.itLoadMW * entity.pueRatio * 8_760 * 1_000; // MW → kWh/yr
		case EntityType.EnergyPlant:
			return 0; // producer, not consumer
		case EntityType.Transport:
			return entity.peakDemandMW * 8_760 * 1_000 * 0.4; // rough avg load factor
		case EntityType.Office:
		case EntityType.Commercial:
		case EntityType.School:
		case EntityType.Leisure:
		case EntityType.Park:
			return entity.avgConsumptionKWh;
		default:
			return 0;
	}
}
