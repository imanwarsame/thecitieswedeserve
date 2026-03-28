import type { Entity } from '../entities/types.ts';
import type { ClockState } from '../engine/Clock.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { CityMetrics, EnergyLayerOutput } from '../metrics/types.ts';
import type { Layer, LayerOutputMap } from './Layer.ts';
import { computeCityMetrics } from '../models/city.ts';

// ── City Layer ──────────────────────────────────────────────

/**
 * Aggregates city-wide KPIs (GDP, land value, health, crime, tourism)
 * from entity state and upstream energy-layer output.
 *
 * Must be registered after the EnergyLayer so that energy metrics
 * are available in `upstreamOutputs`.
 */
export class CityLayer implements Layer<CityMetrics> {
	compute(
		entities: readonly Entity[],
		clock: ClockState,
		config: SimulationConfig,
		upstreamOutputs: LayerOutputMap,
	): CityMetrics {
		const energyOutput = upstreamOutputs['energy'] as EnergyLayerOutput;

		return computeCityMetrics(
			energyOutput.energy,
			energyOutput.economics,
			entities,
			config,
			clock.yearIndex,
		);
	}
}
