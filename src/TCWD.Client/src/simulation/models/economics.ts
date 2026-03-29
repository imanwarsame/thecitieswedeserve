import { EntityType } from '../types.ts';
import type { Entity } from '../entities/types.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { EnergyMetrics, EconomicMetrics } from '../metrics/types.ts';

// ── Economics computation ───────────────────────────────────

/**
 * Derive per-step economic metrics from the energy simulation output
 * and the current entity portfolio.
 *
 * Municipal Tax Revenue:
 *   - Base contribution per housing unit and data-centre rack.
 *   - Reduced proportionally by energy-cost burden (higher costs → lower activity).
 *   - Data centres provide a premium multiplier (tech sector tax base).
 *
 * GDP Contribution:
 *   - Infrastructure value: proportional to entity count & scale.
 *   - Energy sector output: operating cost acts as proxy for economic activity.
 *   - Carbon-tax penalty: subtracts from GDP.
 */
export function computeEconomics(
	energyMetrics: EnergyMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	yearIndex: number
): EconomicMetrics {
	// Count entity presence
	let housingUnits = 0;
	let dataCentreRacks = 0;
	let transportHubs = 0;

	for (const e of entities) {
		switch (e.type) {
			case EntityType.Housing:
				housingUnits += e.units;
				break;
			case EntityType.DataCentre:
				dataCentreRacks += e.rackCount;
				break;
			case EntityType.Transport:
				transportHubs += 1;
				break;
		}
	}

	// ── Carbon tax ──────────────────────────────────────────
	const carbonTaxPaid = energyMetrics.totalCarbonTonnes * config.carbonTaxPerTonne;

	// ── Energy cost burden ──────────────────────────────────
	// Normalised cost per MWh consumed — high values depress economic activity
	const costPerMWh = energyMetrics.totalDemandMWh > 0
		? energyMetrics.operatingCost / energyMetrics.totalDemandMWh
		: 0;
	// Burden factor: 1.0 when costs are zero, approaching 0.5 at very high costs
	const energyCostBurden = 1 / (1 + costPerMWh / 100);

	// ── Grid stability penalty ─────────────────────────────
	// Brownouts (stability < 1.0) directly suppress economic output.
	// Below 0.9 the effect accelerates (businesses close, productivity drops).
	const stability = energyMetrics.gridStability;
	const stabilityFactor = stability >= 1.0
		? 1.0
		: stability >= 0.9
			? 0.9 + (stability - 0.9)		// linear 0.9–1.0
			: Math.max(0.5, stability);		// floor at 0.5 for severe shortages

	// ── Tax revenue (hourly slice) ──────────────────────────
	// Per housing unit: ~$2,000/year → ~$0.23/hour
	const housingTaxPerHour = (housingUnits * 2_000) / 8_760;
	// Per data-centre rack: ~$5,000/year → ~$0.57/hour
	const dcTaxPerHour = (dataCentreRacks * 5_000) / 8_760;
	// Slight boost per transport hub
	const transportTaxPerHour = (transportHubs * 500_000) / 8_760;

	// Adjust by cost burden, grid stability, and year-over-year growth (1.5 % annual)
	const yearGrowth = Math.pow(1.015, yearIndex);
	const taxRevenue =
		(housingTaxPerHour + dcTaxPerHour + transportTaxPerHour) *
		energyCostBurden *
		stabilityFactor *
		yearGrowth;

	// ── GDP contribution (hourly slice) ─────────────────────
	// Base GDP per hour
	const baseGDPPerHour = config.baseGDP / 8_760;
	// Infrastructure multiplier: more entities → more economic activity
	const infraMultiplier = 1 + (housingUnits / 10_000) * 0.05 + (dataCentreRacks / 1_000) * 0.08;
	// Energy sector direct contribution (operating costs ≈ economic activity)
	const energySectorOutput = energyMetrics.operatingCost * 0.3;

	const gdpContribution =
		(baseGDPPerHour * infraMultiplier + energySectorOutput - carbonTaxPaid) *
		stabilityFactor *
		yearGrowth;

	return {
		taxRevenue,
		gdpContribution,
		carbonTaxPaid,
		energyCostBurden: costPerMWh
	};
}
