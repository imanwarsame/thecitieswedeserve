import type { SimulationConfig } from './types.ts';

export const DEFAULT_CONFIG: Readonly<SimulationConfig> = Object.freeze({
	ticksPerDay: 24,
	daysPerYear: 365,
	startYear: 2025,

	baseGDP: 5_000_000_000, // 5 billion currency units
	baseTaxRate: 0.03, // 3 %
	carbonTaxPerTonne: 50, // 50 currency units / tonne CO₂

	maxHistoryLength: 8_760, // 1 year of hourly ticks

	rngSeed: 42
});
