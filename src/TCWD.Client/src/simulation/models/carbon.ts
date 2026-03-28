import type { MWh, TonneCO2 } from '../types.ts';
import type { EnergyPlantEntity } from '../entities/types.ts';

// ── Carbon intensity calculation ────────────────────────────

export interface CarbonResult {
	/** Total CO₂ emitted this tick (tonnes) */
	readonly totalTonnes: TonneCO2;
	/** Weighted average CO₂ per MWh across all plants */
	readonly intensityPerMWh: number;
	/** Per-plant emissions */
	readonly perPlant: Map<string, TonneCO2>;
}

/**
 * Calculate carbon emissions from the supply mix.
 *
 * Each plant's contribution = output (MWh) × co2PerMWh (tonnes/MWh).
 * Intensity = total tonnes / total MWh generated.
 */
export function carbonIntensity(
	supplyByPlant: ReadonlyMap<string, MWh>,
	plants: readonly EnergyPlantEntity[]
): CarbonResult {
	const plantMap = new Map<string, EnergyPlantEntity>();
	for (const p of plants) plantMap.set(p.id, p);

	const perPlant = new Map<string, TonneCO2>();
	let totalTonnes = 0;
	let totalOutput = 0;

	for (const [id, outputMWh] of supplyByPlant) {
		const plant = plantMap.get(id);
		if (!plant) continue;
		const emissions = outputMWh * plant.co2PerMWh;
		perPlant.set(id, emissions);
		totalTonnes += emissions;
		totalOutput += outputMWh;
	}

	return {
		totalTonnes,
		intensityPerMWh: totalOutput > 0 ? totalTonnes / totalOutput : 0,
		perPlant
	};
}
