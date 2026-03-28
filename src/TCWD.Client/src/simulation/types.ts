// ── Shared enums ────────────────────────────────────────────

export const FuelType = {
	Solar: 'Solar',
	Wind: 'Wind',
	Gas: 'Gas',
	Coal: 'Coal',
	Nuclear: 'Nuclear'
} as const;
export type FuelType = (typeof FuelType)[keyof typeof FuelType];

export const EntityType = {
	DataCentre: 'DataCentre',
	Housing: 'Housing',
	EnergyPlant: 'EnergyPlant',
	Transport: 'Transport'
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const RENEWABLE_FUELS: ReadonlySet<FuelType> = new Set([
	FuelType.Solar,
	FuelType.Wind
]);

export const FOSSIL_FUELS: ReadonlySet<FuelType> = new Set([
	FuelType.Gas,
	FuelType.Coal
]);

// ── Unit aliases (documentation purpose — all resolve to number) ─

export type MWh = number;
export type MW = number;
export type TonneCO2 = number;
export type Currency = number;
