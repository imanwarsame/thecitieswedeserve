import type { Entity } from '../entities/types.ts';
import type { ClockState } from '../engine/Clock.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { EnergyLayerOutput } from '../metrics/types.ts';

import { computeEnergyMetrics } from '../metrics/calculator.ts';
import { computeEconomics } from '../models/economics.ts';

// ── Layer interface (extensible for future layers) ──────────

export interface Layer<TOutput> {
	compute(
		entities: readonly Entity[],
		clock: ClockState,
		config: SimulationConfig
	): TOutput;
}

// ── Energy Layer ────────────────────────────────────────────

export class EnergyLayer implements Layer<EnergyLayerOutput> {
	compute(
		entities: readonly Entity[],
		clock: ClockState,
		config: SimulationConfig
	): EnergyLayerOutput {
		const energy = computeEnergyMetrics(
			entities,
			clock.hour,
			clock.day,
			clock.tick,
			config
		);

		const economics = computeEconomics(
			energy,
			entities,
			config,
			clock.yearIndex
		);

		return { energy, economics };
	}
}
