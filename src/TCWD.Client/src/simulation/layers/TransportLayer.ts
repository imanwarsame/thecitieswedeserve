import type { Entity } from '../entities/types.ts';
import type { ClockState } from '../engine/Clock.ts';
import type { SimulationConfig } from '../config/types.ts';
import type { TransportMetrics } from '../metrics/types.ts';
import type { Layer, LayerOutputMap } from './Layer.ts';

// ── Transport Layer (stub) ──────────────────────────────────

/**
 * Placeholder transport layer.  Returns zero metrics until the
 * transport simulation is implemented.
 */
export class TransportLayer implements Layer<TransportMetrics> {
	compute(
		_entities: readonly Entity[],
		_clock: ClockState,
		_config: SimulationConfig,
		_upstreamOutputs: LayerOutputMap,
	): TransportMetrics {
		return {
			totalPassengersPerHour: 0,
			averageCommuteMins: 0,
			congestionIndex: 0,
			evAdoptionRate: 0,
		};
	}
}
