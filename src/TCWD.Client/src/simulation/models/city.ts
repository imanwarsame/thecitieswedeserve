import { EntityType } from '../types.ts';
import type { Currency } from '../types.ts';
import type { Entity } from '../entities/types.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { EnergyMetrics, EconomicMetrics, CityMetrics } from '../metrics/types.ts';

// ── City-wide metric computation ────────────────────────────
//
// Each function models one of the mayor's key performance indicators.
// All indices are clamped to [0, 1].  Models are intentionally simple
// and can be refined as the simulation matures.

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

// ── GDP ─────────────────────────────────────────────────────

/**
 * Hourly GDP slice.
 * - Base GDP scaled by infrastructure multiplier.
 * - Energy sector direct contribution (operating costs as proxy).
 * - Carbon-tax penalty subtracted.
 * - Year-over-year growth of 1.5%.
 */
export function computeGDP(
	energy: EnergyMetrics,
	economics: EconomicMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	yearIndex: number,
): Currency {
	let housingUnits = 0;
	let dataCentreRacks = 0;

	for (const e of entities) {
		if (e.type === EntityType.Housing) housingUnits += e.units;
		if (e.type === EntityType.DataCentre) dataCentreRacks += e.rackCount;
	}

	const baseGDPPerHour = config.baseGDP / 8_760;
	const infraMultiplier =
		1 + (housingUnits / 10_000) * 0.05 + (dataCentreRacks / 1_000) * 0.08;
	const energySectorOutput = energy.operatingCost * 0.3;
	const yearGrowth = Math.pow(1.015, yearIndex);

	return (baseGDPPerHour * infraMultiplier + energySectorOutput - economics.carbonTaxPaid) * yearGrowth;
}

// ── Land Value ──────────────────────────────────────────────

/**
 * Average land value per cell.
 * - Boosted by housing density and renewable fraction.
 * - Penalised by carbon emissions and fossil fraction.
 */
export function computeLandValue(
	energy: EnergyMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
): Currency {
	let housingUnits = 0;
	let entityCount = 0;

	for (const e of entities) {
		entityCount++;
		if (e.type === EntityType.Housing) housingUnits += e.units;
	}

	const densityBoost = Math.min(housingUnits / 5_000, 0.3);
	const renewableBoost = energy.renewableFraction * 0.15;
	const pollutionPenalty = energy.fossilFraction * 0.2 + Math.min(energy.totalCarbonTonnes / 500, 0.15);
	const activityBoost = Math.min(entityCount / 20, 0.1);

	const multiplier = 1 + densityBoost + renewableBoost + activityBoost - pollutionPenalty;

	return config.baseLandValue * Math.max(multiplier, 0.3);
}

// ── Health Index ────────────────────────────────────────────

/**
 * Population health (0–1).
 * - Penalised by carbon emissions and fossil fuel reliance.
 * - Boosted by renewable fraction and grid stability.
 */
export function computeHealthIndex(
	energy: EnergyMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
): number {
	let housingUnits = 0;
	for (const e of entities) {
		if (e.type === EntityType.Housing) housingUnits += e.units;
	}

	const carbonPenalty = Math.min(energy.totalCarbonTonnes / 200, 0.3);
	const fossilPenalty = energy.fossilFraction * 0.15;
	// Overcrowding stress: penalty above 10k housing units
	const densityStress = Math.min(Math.max(housingUnits - 10_000, 0) / 50_000, 0.1);
	const renewableBonus = energy.renewableFraction * 0.1;
	// Grid instability harms health (brownouts → no heating/cooling)
	const stabilityPenalty = energy.gridStability < 0.9 ? (0.9 - energy.gridStability) * 0.5 : 0;

	return clamp01(
		config.baseHealthIndex - carbonPenalty - fossilPenalty - densityStress - stabilityPenalty + renewableBonus,
	);
}

// ── Crime Index ─────────────────────────────────────────────

/**
 * Crime level (0–1, higher = worse).
 * - Driven by energy insecurity (brownouts), economic stress, and density.
 * - Reduced by prosperity (high GDP/capita proxy) and grid stability.
 */
export function computeCrimeIndex(
	energy: EnergyMetrics,
	economics: EconomicMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
): number {
	let housingUnits = 0;
	for (const e of entities) {
		if (e.type === EntityType.Housing) housingUnits += e.units;
	}

	// Economic stress: normalised energy cost burden
	const costPerMWh = energy.totalDemandMWh > 0
		? energy.operatingCost / energy.totalDemandMWh
		: 0;
	const costStress = Math.min(costPerMWh / 200, 0.15);

	// Grid instability → social unrest
	const instabilityStress = energy.gridStability < 0.9 ? (0.9 - energy.gridStability) * 0.4 : 0;

	// Density pressure
	const densityPressure = Math.min(housingUnits / 30_000, 0.1);

	// Prosperity dampener (high tax revenue per capita → lower crime)
	const perCapitaTax = housingUnits > 0 ? economics.taxRevenue / housingUnits : 0;
	const prosperityRelief = Math.min(perCapitaTax / 5, 0.15);

	return clamp01(
		config.baseCrimeIndex + costStress + instabilityStress + densityPressure - prosperityRelief,
	);
}

// ── Tourism Index ───────────────────────────────────────────

/**
 * Tourism attractiveness (0–1).
 * - Composite of health, crime, and renewable fraction.
 * - Cities with clean energy, low crime, and healthy populations attract visitors.
 */
export function computeTourismIndex(
	healthIndex: number,
	crimeIndex: number,
	renewableFraction: number,
	config: SimulationConfig,
): number {
	const healthBoost = (healthIndex - 0.5) * 0.4;      // bonus above 0.5, penalty below
	const crimePenalty = (crimeIndex - 0.3) * 0.4;       // penalty above 0.3, bonus below
	const greenBoost = renewableFraction * 0.2;           // eco-tourism

	return clamp01(config.baseTourismIndex + healthBoost - crimePenalty + greenBoost);
}

// ── Aggregate ───────────────────────────────────────────────

export function computeCityMetrics(
	energy: EnergyMetrics,
	economics: EconomicMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	yearIndex: number,
): CityMetrics {
	const gdp = computeGDP(energy, economics, entities, config, yearIndex);
	const landValue = computeLandValue(energy, entities, config);
	const taxRevenue = economics.taxRevenue;
	const healthIndex = computeHealthIndex(energy, entities, config);
	const crimeIndex = computeCrimeIndex(energy, economics, entities, config);
	const tourismIndex = computeTourismIndex(healthIndex, crimeIndex, energy.renewableFraction, config);

	return { gdp, landValue, taxRevenue, healthIndex, crimeIndex, tourismIndex };
}
