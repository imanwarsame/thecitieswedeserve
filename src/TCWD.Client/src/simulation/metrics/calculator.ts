import { EntityType, FuelType } from '../types.ts';
import type { MWh } from '../types.ts';
import type { Entity, EnergyPlantEntity } from '../entities/types.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { EnergyMetrics } from './types.ts';

import { totalDemand } from '../models/demand.ts';
import { totalSupply, isRenewable, mulberry32 } from '../models/supply.ts';
import { carbonIntensity } from '../models/carbon.ts';
import { operatingCosts } from '../models/cost.ts';

// ── Metric computation ──────────────────────────────────────

export function computeEnergyMetrics(
	entities: readonly Entity[],
	hour: number,
	dayOfYear: number,
	tick: number,
	config: SimulationConfig
): EnergyMetrics {
	// Partition entities
	const plants: EnergyPlantEntity[] = [];
	const consumers: Entity[] = [];

	for (const e of entities) {
		if (e.type === EntityType.EnergyPlant) {
			plants.push(e);
		} else {
			consumers.push(e);
		}
	}

	// 1. Demand
	const demand = totalDemand(consumers, hour, dayOfYear);

	// 2. Supply (merit-order dispatch)
	const rng = mulberry32(config.rngSeed + tick);
	const supply = totalSupply(plants, hour, dayOfYear, demand.totalMWh, rng);

	// 3. Carbon
	const carbon = carbonIntensity(supply.perPlant, plants);

	// 4. Operating costs
	const opCost = operatingCosts(supply.perPlant, plants);

	// 5. Renewable / fossil fractions
	let renewableMWh = 0;
	let fossilMWh = 0;

	for (const p of plants) {
		const output = supply.perPlant.get(p.id) ?? 0;
		if (isRenewable(p.fuelType)) {
			renewableMWh += output;
		} else if (p.fuelType === FuelType.Gas || p.fuelType === FuelType.Coal) {
			fossilMWh += output;
		}
		// Nuclear is neither renewable nor fossil in this categorisation
	}

	const totalGen = supply.totalMWh || 1; // avoid division by zero

	// 6. Supply breakdown by fuel type
	const supplyBreakdown: Record<string, MWh> = {};
	for (const p of plants) {
		const output = supply.perPlant.get(p.id) ?? 0;
		supplyBreakdown[p.fuelType] = (supplyBreakdown[p.fuelType] ?? 0) + output;
	}

	// 7. Grid stability
	const gridStability = demand.totalMWh > 0
		? supply.totalMWh / demand.totalMWh
		: 1.0;

	return {
		totalDemandMWh: demand.totalMWh,
		totalSupplyMWh: supply.totalMWh,
		renewableFraction: renewableMWh / totalGen,
		fossilFraction: fossilMWh / totalGen,
		gridStability,
		carbonIntensityPerMWh: carbon.intensityPerMWh,
		totalCarbonTonnes: carbon.totalTonnes,
		operatingCost: opCost,
		supplyBreakdown,
		demandBreakdown: demand.byType
	};
}
