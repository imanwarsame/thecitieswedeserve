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
