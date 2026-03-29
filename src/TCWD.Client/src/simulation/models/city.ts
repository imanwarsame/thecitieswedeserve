import { EntityType } from '../types.ts';
import type { Currency } from '../types.ts';
import type { Entity } from '../entities/types.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { EnergyMetrics, EconomicMetrics, CityMetrics, TransportMetrics } from '../metrics/types.ts';

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
 * - Grid stability: brownouts (< 1.0) penalise productivity.
 * - Transport connectivity: low congestion and high throughput boost output.
 * - Year-over-year growth of 1.5%.
 */
export function computeGDP(
	energy: EnergyMetrics,
	economics: EconomicMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	yearIndex: number,
	transport?: TransportMetrics,
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

	// Grid stability: supply shortages depress productivity
	const stability = energy.gridStability;
	const stabilityFactor = stability >= 1.0
		? 1.0
		: stability >= 0.9
			? 0.9 + (stability - 0.9)
			: Math.max(0.5, stability);

	// Transport connectivity: low congestion and active transit boost GDP
	let transportFactor = 1.0;
	if (transport) {
		// Congestion drags on productivity (up to −15 %)
		transportFactor -= transport.congestionIndex * 0.15;
		// Active passenger throughput signals a healthy transit network (+5 % cap)
		const throughputBoost = Math.min(transport.totalPassengersPerHour / 50_000, 0.05);
		transportFactor += throughputBoost;
		// Long commutes reduce effective working hours (−8 % cap)
		const commutePenalty = Math.min(transport.averageCommuteMins / 60, 1) * 0.08;
		transportFactor -= commutePenalty;
		transportFactor = Math.max(transportFactor, 0.7);
	}

	return (baseGDPPerHour * infraMultiplier + energySectorOutput - economics.carbonTaxPaid) *
		stabilityFactor * transportFactor * yearGrowth;
}

// ── Land Value ──────────────────────────────────────────────

/**
 * Average land value per cell.
 * - Boosted by housing density and renewable fraction.
 * - Boosted by transit accessibility (low congestion, short commutes).
 * - Penalised by carbon emissions, fossil fraction, and grid instability.
 */
export function computeLandValue(
	energy: EnergyMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	transport?: TransportMetrics,
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

	// Grid stability: unreliable power depresses property values
	const stabilityPenalty = energy.gridStability < 1.0
		? (1.0 - Math.max(energy.gridStability, 0.5)) * 0.25
		: 0;

	// Transport accessibility: connected areas command a premium
	let transitBoost = 0;
	let congestionPenalty = 0;
	if (transport) {
		// Low congestion → premium (up to +10 %)
		congestionPenalty = transport.congestionIndex * 0.15;
		// Active transit network signals accessibility (+8 % cap)
		transitBoost = Math.min(transport.totalPassengersPerHour / 50_000, 0.08);
		// Short average commute → premium (up to +6 %)
		const commuteBonus = transport.averageCommuteMins > 0
			? Math.max(0, (1 - transport.averageCommuteMins / 60)) * 0.06
			: 0;
		transitBoost += commuteBonus;
	}

	const multiplier = 1
		+ densityBoost + renewableBoost + activityBoost + transitBoost
		- pollutionPenalty - stabilityPenalty - congestionPenalty;

	return config.baseLandValue * Math.max(multiplier, 0.3);
}

// ── Health Index ────────────────────────────────────────────

/**
 * Population health (0–1).
 * - Penalised by carbon emissions, fossil fuel reliance, and grid instability.
 * - Boosted by renewable fraction, parks, public transport, schools, and leisure.
 */
export function computeHealthIndex(
	energy: EnergyMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
): number {
	let housingUnits = 0;
	let parkAreaSqM = 0;
	let railLineLengthKm = 0;
	let schoolCapacity = 0;
	let leisureCapacity = 0;

	for (const e of entities) {
		if (e.type === EntityType.Housing) housingUnits += e.units;
		if (e.type === EntityType.Park) parkAreaSqM += e.areaSqM;
		if (e.type === EntityType.Transport) railLineLengthKm += e.railLineLengthKm;
		if (e.type === EntityType.School) schoolCapacity += e.studentCapacity;
		if (e.type === EntityType.Leisure) leisureCapacity += e.visitorCapacity;
	}

	const carbonPenalty = Math.min(energy.totalCarbonTonnes / 200, 0.3);
	const fossilPenalty = energy.fossilFraction * 0.15;
	// Overcrowding stress: penalty above 10k housing units
	const densityStress = Math.min(Math.max(housingUnits - 10_000, 0) / 50_000, 0.1);
	const renewableBonus = energy.renewableFraction * 0.1;
	// Grid instability harms health (brownouts → no heating/cooling)
	const stabilityPenalty = energy.gridStability < 0.9 ? (0.9 - energy.gridStability) * 0.5 : 0;

	// Green space: parks improve air quality & mental health (up to +0.15)
	const greenSpaceBonus = Math.min(parkAreaSqM / 200_000, 0.15);
	// Public transport: reduces car pollution & improves access to healthcare (up to +0.1)
	const transitHealthBonus = Math.min(railLineLengthKm / 100, 0.1);
	// Schools: health education & awareness (up to +0.08)
	const educationBonus = Math.min(schoolCapacity / 10_000, 0.08);
	// Leisure: recreation keeps population active (up to +0.07)
	const leisureBonus = Math.min(leisureCapacity / 10_000, 0.07);

	return clamp01(
		config.baseHealthIndex
			- carbonPenalty - fossilPenalty - densityStress - stabilityPenalty
			+ renewableBonus + greenSpaceBonus + transitHealthBonus + educationBonus + leisureBonus,
	);
}

// ── Crime Index ─────────────────────────────────────────────

/**
 * Crime level (0–1, higher = worse).
 * - Driven by energy insecurity (brownouts), economic stress, and density.
 * - Reduced by prosperity, schools, parks, public transport, commercial activity, and leisure.
 */
export function computeCrimeIndex(
	energy: EnergyMetrics,
	economics: EconomicMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	hour: number = 12,
): number {
	let housingUnits = 0;
	let parkAreaSqM = 0;
	let railLineLengthKm = 0;
	let evChargerCount = 0;
	let schoolCapacity = 0;
	let commercialFloorArea = 0;
	let leisureCapacity = 0;

	for (const e of entities) {
		if (e.type === EntityType.Housing) housingUnits += e.units;
		if (e.type === EntityType.Park) parkAreaSqM += e.areaSqM;
		if (e.type === EntityType.Transport) {
			railLineLengthKm += e.railLineLengthKm;
			evChargerCount += e.evChargerCount;
		}
		if (e.type === EntityType.School) schoolCapacity += e.studentCapacity;
		if (e.type === EntityType.Commercial) commercialFloorArea += e.floorArea;
		if (e.type === EntityType.Leisure) leisureCapacity += e.visitorCapacity;
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

	// Education: schools reduce crime through opportunity (up to −0.12)
	const educationRelief = Math.min(schoolCapacity / 10_000, 0.12);
	// Parks: community spaces & natural surveillance (up to −0.08)
	const parkRelief = Math.min(parkAreaSqM / 200_000, 0.08);
	// Public transport: connectivity reduces isolation & improves policing reach (up to −0.08)
	const transitRelief = Math.min((railLineLengthKm / 100 + evChargerCount / 500) / 2, 0.08);
	// Commercial activity: eyes on the street, economic opportunity (up to −0.06)
	const commercialRelief = Math.min(commercialFloorArea / 100_000, 0.06);
	// Leisure: engaged population less prone to crime (up to −0.05)
	const leisureRelief = Math.min(leisureCapacity / 10_000, 0.05);

	// Time-of-day modifier: crime peaks ~2 AM (+0.08), lowest ~2 PM (−0.08)
	const timeOfDayShift = 0.08 * Math.cos((hour - 2) * Math.PI / 12);

	return clamp01(
		config.baseCrimeIndex
			+ costStress + instabilityStress + densityPressure + timeOfDayShift
			- prosperityRelief - educationRelief - parkRelief - transitRelief - commercialRelief - leisureRelief,
	);
}

// ── Tourism Index ───────────────────────────────────────────

/**
 * Tourism attractiveness (0–1).
 * - Composite of health, crime, renewable fraction, parks, transport, leisure, and commercial.
 * - Cities with clean energy, low crime, green spaces, good transit, and attractions draw visitors.
 */
export function computeTourismIndex(
	healthIndex: number,
	crimeIndex: number,
	renewableFraction: number,
	entities: readonly Entity[],
	config: SimulationConfig,
): number {
	let parkAreaSqM = 0;
	let railLineLengthKm = 0;
	let leisureCapacity = 0;
	let commercialFloorArea = 0;
	let schoolCapacity = 0;

	for (const e of entities) {
		if (e.type === EntityType.Park) parkAreaSqM += e.areaSqM;
		if (e.type === EntityType.Transport) railLineLengthKm += e.railLineLengthKm;
		if (e.type === EntityType.Leisure) leisureCapacity += e.visitorCapacity;
		if (e.type === EntityType.Commercial) commercialFloorArea += e.floorArea;
		if (e.type === EntityType.School) schoolCapacity += e.studentCapacity;
	}

	const healthBoost = (healthIndex - 0.5) * 0.4;      // bonus above 0.5, penalty below
	const crimePenalty = (crimeIndex - 0.3) * 0.4;       // penalty above 0.3, bonus below
	const greenBoost = renewableFraction * 0.2;           // eco-tourism

	// Parks: scenic green spaces attract tourists (up to +0.12)
	const parkBoost = Math.min(parkAreaSqM / 200_000, 0.12);
	// Public transport: ease of getting around (up to +0.1)
	const transitBoost = Math.min(railLineLengthKm / 100, 0.1);
	// Leisure: attractions, venues, culture (up to +0.12)
	const leisureBoost = Math.min(leisureCapacity / 10_000, 0.12);
	// Commercial: shopping, dining, nightlife (up to +0.08)
	const commercialBoost = Math.min(commercialFloorArea / 100_000, 0.08);
	// Schools: quality-of-life signal (up to +0.03)
	const educationBoost = Math.min(schoolCapacity / 20_000, 0.03);

	return clamp01(
		config.baseTourismIndex
			+ healthBoost - crimePenalty + greenBoost
			+ parkBoost + transitBoost + leisureBoost + commercialBoost + educationBoost,
	);
}

// ── Aggregate ───────────────────────────────────────────────

export function computeCityMetrics(
	energy: EnergyMetrics,
	economics: EconomicMetrics,
	entities: readonly Entity[],
	config: SimulationConfig,
	yearIndex: number,
	transport?: TransportMetrics,
	hour: number = 12,
): CityMetrics {
	const gdp = computeGDP(energy, economics, entities, config, yearIndex, transport);
	const landValue = computeLandValue(energy, entities, config, transport);
	const taxRevenue = economics.taxRevenue;
	const healthIndex = computeHealthIndex(energy, entities, config);
	const crimeIndex = computeCrimeIndex(energy, economics, entities, config, hour);
	const tourismIndex = computeTourismIndex(healthIndex, crimeIndex, energy.renewableFraction, entities, config);

	return { gdp, landValue, taxRevenue, healthIndex, crimeIndex, tourismIndex };
}
