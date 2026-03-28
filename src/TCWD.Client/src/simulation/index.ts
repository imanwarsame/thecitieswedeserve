// ── Simulation Engine — Public API ──────────────────────────
//
// Single entry-point for consuming the headless simulation.
// Import everything you need from 'simulation/':
//
//   import { SimulationEngine, createHousing, FuelType } from '../simulation';

// ── Core engine ─────────────────────────────────────────────
export { SimulationEngine } from './engine/SimulationEngine.ts';
export { Clock } from './engine/Clock.ts';
export type { ClockState } from './engine/Clock.ts';

// ── Configuration ───────────────────────────────────────────
export type { SimulationConfig } from './config/types.ts';
export { DEFAULT_CONFIG } from './config/defaults.ts';

// ── Shared enums & units ────────────────────────────────────
export { FuelType, EntityType, RENEWABLE_FUELS, FOSSIL_FUELS } from './types.ts';
export type { MWh, MW, TonneCO2, Currency } from './types.ts';

// ── Entities ────────────────────────────────────────────────
export type {
	Entity,
	DataCentreEntity,
	HousingEntity,
	EnergyPlantEntity,
	TransportEntity
} from './entities/types.ts';

export {
	createDataCentre,
	createHousing,
	createEnergyPlant,
	createTransport
} from './entities/factories.ts';

// ── Metrics ─────────────────────────────────────────────────
export type {
	EnergyMetrics,
	EconomicMetrics,
	CityMetrics,
	TransportMetrics,
	WaterMetrics,
	EnergyLayerOutput
} from './metrics/types.ts';

// ── State ───────────────────────────────────────────────────
export type { SimulationState, StepRecord } from './state/types.ts';
export { createSnapshot, toJSON } from './state/snapshot.ts';

// ── Layers ──────────────────────────────────────────────────
export { EnergyLayer } from './layers/EnergyLayer.ts';
export { CityLayer } from './layers/CityLayer.ts';
export { TransportLayer } from './layers/TransportLayer.ts';
export { WaterLayer } from './layers/WaterLayer.ts';
export { LayerRegistry } from './layers/Layer.ts';
export type { Layer, LayerOutputMap } from './layers/Layer.ts';

// ── City models ─────────────────────────────────────────────
export { computeCityMetrics } from './models/city.ts';

// ── Bridge (3D ↔ Simulation) ────────────────────────────────
export { SimulationBridge } from './bridge/SimulationBridge.ts';
export {
	createBuildingMesh,
	buildingTypeFromSimEntity,
	simEntityTypeFromBuildingType,
	BUILDING_LABELS,
} from './bridge/BuildingFactory.ts';
export type { BuildingType } from './bridge/BuildingFactory.ts';
