import type { MWh, TonneCO2, Currency } from '../types.ts';

// ── Energy metrics (per-step) ───────────────────────────────

export interface EnergyMetrics {
	readonly totalDemandMWh: MWh;
	readonly totalSupplyMWh: MWh;

	/** Fraction of supply from renewable sources (0–1) */
	readonly renewableFraction: number;
	/** Fraction of supply from fossil sources (0–1) */
	readonly fossilFraction: number;

	/**
	 * Grid stability index = totalSupply / totalDemand.
	 *  - 1.0 = perfectly balanced
	 *  - < 0.9 = brownout risk
	 *  - > 1.1 = oversupply / curtailment
	 */
	readonly gridStability: number;

	readonly carbonIntensityPerMWh: number;
	readonly totalCarbonTonnes: TonneCO2;
	readonly operatingCost: Currency;

	/** MWh generated per fuel type */
	readonly supplyBreakdown: Readonly<Record<string, MWh>>;
	/** MWh consumed per entity type */
	readonly demandBreakdown: Readonly<Record<string, MWh>>;
}

// ── Economic metrics (per-step) ─────────────────────────────

export interface EconomicMetrics {
	readonly taxRevenue: Currency;
	readonly gdpContribution: Currency;
	readonly carbonTaxPaid: Currency;
	readonly energyCostBurden: Currency;
}

// ── Combined layer output ───────────────────────────────────

export interface EnergyLayerOutput {
	readonly energy: EnergyMetrics;
	readonly economics: EconomicMetrics;
}

// ── City-wide metrics (aggregated across all layers) ────────

export interface CityMetrics {
	/** Gross domestic product (hourly slice, currency units) */
	readonly gdp: Currency;
	/** Average land value index (currency units per cell) */
	readonly landValue: Currency;
	/** Municipal tax revenue (hourly slice) */
	readonly taxRevenue: Currency;
	/** Population health index (0 = critical, 1 = excellent) */
	readonly healthIndex: number;
	/** Crime index (0 = safe, 1 = severe) */
	readonly crimeIndex: number;
	/** Tourism attractiveness index (0 = none, 1 = world-class) */
	readonly tourismIndex: number;
}

// ── Transport metrics ────────────────────────────────────────

export interface TransportMetrics {
	readonly totalPassengersPerHour: number;
	readonly averageCommuteMins: number;
	readonly congestionIndex: number;
	readonly evAdoptionRate: number;
	/** Fraction of trips per mode (0–1 each). */
	readonly modalSplit: Readonly<Record<string, number>>;
}

// ── Water metrics (stub — future layer) ─────────────────────

export interface WaterMetrics {
	readonly totalDemandLitres: number;
	readonly totalSupplyLitres: number;
	readonly waterQualityIndex: number;
	readonly wastewaterTreatedPct: number;
}
