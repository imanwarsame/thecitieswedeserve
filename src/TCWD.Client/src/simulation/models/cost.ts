import type { MWh, Currency } from '../types.ts';
import type { EnergyPlantEntity } from '../entities/types.ts';

// ── Operating cost calculation ──────────────────────────────

/**
 * Sum of variable operating costs across all dispatched plants.
 * Cost = Σ (output_i × variableCostPerMWh_i)
 */
export function operatingCosts(
	supplyByPlant: ReadonlyMap<string, MWh>,
	plants: readonly EnergyPlantEntity[]
): Currency {
	const plantMap = new Map<string, EnergyPlantEntity>();
	for (const p of plants) plantMap.set(p.id, p);

	let total: Currency = 0;

	for (const [id, outputMWh] of supplyByPlant) {
		const plant = plantMap.get(id);
		if (!plant) continue;
		total += outputMWh * plant.variableCostPerMWh;
	}

	return total;
}
