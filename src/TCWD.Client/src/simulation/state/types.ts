import type { ClockState } from '../engine/Clock.ts';
import type {
	EnergyMetrics,
	EconomicMetrics,
	CityMetrics,
	TransportMetrics,
	WaterMetrics,
} from '../metrics/types.ts';
import type { Entity } from '../entities/types.ts';

// ── Step record (appended to history each tick) ─────────────

export interface StepRecord {
	readonly tick: number;
	readonly hour: number;
	readonly day: number;
	readonly year: number;
	readonly energy: EnergyMetrics;
	readonly economics: EconomicMetrics;
	readonly city: CityMetrics;
	readonly transport?: TransportMetrics;
	readonly water?: WaterMetrics;
}

// ── Full simulation state snapshot ──────────────────────────

export interface SimulationState {
	readonly clock: ClockState;
	readonly energy: EnergyMetrics;
	readonly economics: EconomicMetrics;
	readonly city: CityMetrics;
	readonly transport?: TransportMetrics;
	readonly water?: WaterMetrics;
	readonly entities: readonly Entity[];
	readonly history: readonly StepRecord[];
}
