import type { ClockState } from '../engine/Clock.ts';
import type { EnergyMetrics, EconomicMetrics } from '../metrics/types.ts';
import type { Entity } from '../entities/types.ts';

// ── Step record (appended to history each tick) ─────────────

export interface StepRecord {
	readonly tick: number;
	readonly hour: number;
	readonly day: number;
	readonly year: number;
	readonly energy: EnergyMetrics;
	readonly economics: EconomicMetrics;
}

// ── Full simulation state snapshot ──────────────────────────

export interface SimulationState {
	readonly clock: ClockState;
	readonly energy: EnergyMetrics;
	readonly economics: EconomicMetrics;
	readonly entities: readonly Entity[];
	readonly history: readonly StepRecord[];
}
