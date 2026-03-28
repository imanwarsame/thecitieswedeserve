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
	EnergyLayerOutput
} from './metrics/types.ts';

// ── State ───────────────────────────────────────────────────
export type { SimulationState, StepRecord } from './state/types.ts';
export { createSnapshot, toJSON } from './state/snapshot.ts';

// ── Layers ──────────────────────────────────────────────────
export { EnergyLayer } from './layers/EnergyLayer.ts';
export type { Layer } from './layers/EnergyLayer.ts';
