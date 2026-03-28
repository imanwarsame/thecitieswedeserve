import { FuelType, RENEWABLE_FUELS } from '../types.ts';
import type { MWh } from '../types.ts';
import type { EnergyPlantEntity } from '../entities/types.ts';

// ── Seeded PRNG (mulberry32) ────────────────────────────────

export function mulberry32(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

// ── Solar supply ────────────────────────────────────────────

/**
 * Solar output follows a bell curve centred on solar noon (hour 12).
 * - Zero output at night (before sunrise / after sunset).
 * - Seasonal variation: longer days in summer, shorter in winter.
 */
export function solarSupply(
	plant: EnergyPlantEntity,
	hour: number,
	dayOfYear: number
): MWh {
	// Approximate sunrise / sunset with seasonal shift
	const daylightHalfSpan = 6 + 2 * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365);
	const sunrise = 12 - daylightHalfSpan;
	const sunset = 12 + daylightHalfSpan;

	if (hour < sunrise || hour >= sunset) return 0;

	// Normalized position in [0, 1] across daylight hours, peak at 0.5
	const t = (hour - sunrise) / (sunset - sunrise);
	// Sinusoidal curve: peaks at t = 0.5
	const irradiance = Math.sin(Math.PI * t);

	return plant.capacityMW * plant.efficiencyPct * irradiance;
}

// ── Wind supply ─────────────────────────────────────────────

/**
 * Wind output with a deterministic pseudo-random component.
 * Slightly higher capacity factor at night (thermal gradients).
 */
export function windSupply(
	plant: EnergyPlantEntity,
	hour: number,
	rng: () => number
): MWh {
	const baseCapacityFactor = hour >= 22 || hour < 6 ? 0.38 : 0.30;
	// Add ±0.08 bounded noise
	const noise = (rng() - 0.5) * 0.16;
	const cf = Math.max(0, Math.min(1, baseCapacityFactor + noise));
	return plant.capacityMW * cf;
}

// ── Dispatchable supply (Gas / Coal / Nuclear) ──────────────

/**
 * Dispatchable plants ramp to fill a demand gap, constrained by capacity.
 * - Nuclear: inflexible — operates between 80 % and 100 % of capacity.
 * - Gas / Coal: fully flexible — 0 % to 100 %.
 */
export function dispatchableSupply(
	plant: EnergyPlantEntity,
	demandGapMW: MWh
): MWh {
	if (demandGapMW <= 0) {
		// Even with no gap, nuclear has a minimum output
		if (plant.fuelType === FuelType.Nuclear) {
			return plant.capacityMW * 0.8;
		}
		return 0;
	}

	if (plant.fuelType === FuelType.Nuclear) {
		// Ramp between 80–100 % capacity
		const min = plant.capacityMW * 0.8;
		const max = plant.capacityMW;
		return Math.min(max, Math.max(min, demandGapMW));
	}

	// Gas / Coal — ramp freely up to capacity
	return Math.min(plant.capacityMW, demandGapMW);
}

// ── Merit-order dispatch ────────────────────────────────────

export interface SupplyResult {
	readonly perPlant: Map<string, MWh>;
	readonly totalMWh: MWh;
}

/**
 * Dispatches plants in merit order:
 *   1. Solar (zero marginal cost)
 *   2. Wind  (zero marginal cost)
 *   3. Nuclear (low marginal cost, inflexible)
 *   4. Gas / Coal (highest marginal cost, flexible)
 *
 * Within each tier, plants are dispatched in definition order.
 */
export function totalSupply(
	plants: readonly EnergyPlantEntity[],
	hour: number,
	dayOfYear: number,
	demandMWh: MWh,
	rng: () => number
): SupplyResult {
	const perPlant = new Map<string, MWh>();

	// Partition plants into dispatch tiers
	const solar: EnergyPlantEntity[] = [];
	const wind: EnergyPlantEntity[] = [];
	const nuclear: EnergyPlantEntity[] = [];
	const fossil: EnergyPlantEntity[] = [];

	for (const p of plants) {
		switch (p.fuelType) {
			case FuelType.Solar:
				solar.push(p);
				break;
			case FuelType.Wind:
				wind.push(p);
				break;
			case FuelType.Nuclear:
				nuclear.push(p);
				break;
			default:
				fossil.push(p);
				break;
		}
	}

	// Sort fossil by variable cost ascending (cheapest first)
	fossil.sort((a, b) => a.variableCostPerMWh - b.variableCostPerMWh);

	let remaining = demandMWh;

	// Tier 1 — Solar
	for (const p of solar) {
		const output = solarSupply(p, hour, dayOfYear);
		perPlant.set(p.id, output);
		remaining -= output;
	}

	// Tier 2 — Wind
	for (const p of wind) {
		const output = windSupply(p, hour, rng);
		perPlant.set(p.id, output);
		remaining -= output;
	}

	// Tier 3 — Nuclear (inflexible)
	for (const p of nuclear) {
		const output = dispatchableSupply(p, remaining);
		perPlant.set(p.id, output);
		remaining -= output;
	}

	// Tier 4 — Fossil (flexible)
	for (const p of fossil) {
		const output = dispatchableSupply(p, remaining);
		perPlant.set(p.id, output);
		remaining -= output;
	}

	let total = 0;
	for (const v of perPlant.values()) total += v;

	return { perPlant, totalMWh: total };
}

// ── Helpers exposed for metrics ─────────────────────────────

export function isRenewable(fuelType: FuelType): boolean {
	return RENEWABLE_FUELS.has(fuelType);
}
