import type { TransportMetrics } from '../metrics/types.ts';
import type { Layer } from './Layer.ts';
import type { Entity } from '../entities/types.ts';
import type { ClockState } from '../engine/Clock.ts';
import type { TransportModule } from '../transport/TransportModule.ts';

// ── Transport Layer ─────────────────────────────────────────
//
// Delegates to the TransportModule when available.
// Falls back to zero metrics when no module is injected.

export class TransportLayer implements Layer<TransportMetrics> {
	private module: TransportModule | null = null;

	/** Inject the transport module (called by SimulationEngine). */
	setModule(module: TransportModule): void {
		this.module = module;
	}

	compute(
		entities: readonly Entity[],
		clock: ClockState,
	): TransportMetrics {
		if (!this.module) {
			return {
				totalPassengersPerHour: 0,
				averageCommuteMins: 0,
				congestionIndex: 0,
				evAdoptionRate: 0,
				modalSplit: {},
			};
		}

		const result = this.module.compute(entities, clock);

		return {
			totalPassengersPerHour: result.totalPassengers,
			averageCommuteMins: result.avgCommuteMins,
			congestionIndex: result.congestionIndex,
			evAdoptionRate: 0, // EV adoption tracked separately in future
			modalSplit: { ...result.modalSplit },
		};
	}
}
