import type { Currency } from '../types.ts';

export interface SimulationConfig {
	/** Ticks per simulated day (default 24 = 1 tick per hour) */
	readonly ticksPerDay: number;
	/** Days per simulated year */
	readonly daysPerYear: number;
	/** Calendar year the simulation begins */
	readonly startYear: number;

	// ── Economic parameters ──────────────────────────────────
	/** Base municipal GDP in currency units */
	readonly baseGDP: Currency;
	/** Base municipal tax rate (0–1) */
	readonly baseTaxRate: number;
	/** Carbon tax charged per tonne of CO₂ */
	readonly carbonTaxPerTonne: Currency;

	// ── City-wide parameters ─────────────────────────────────
	/** Base land value per cell (currency units) */
	readonly baseLandValue: Currency;
	/** Baseline health index before modifiers (0–1) */
	readonly baseHealthIndex: number;
	/** Baseline crime index before modifiers (0–1) */
	readonly baseCrimeIndex: number;
	/** Baseline tourism index before modifiers (0–1) */
	readonly baseTourismIndex: number;

	// ── History ──────────────────────────────────────────────
	/** Maximum step records kept in the rolling history buffer */
	readonly maxHistoryLength: number;

	// ── RNG ──────────────────────────────────────────────────
	/** Seed for the deterministic PRNG (wind variability, etc.) */
	readonly rngSeed: number;
}
