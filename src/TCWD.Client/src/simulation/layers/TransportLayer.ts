import type { TransportMetrics } from '../metrics/types.ts';
import type { Layer } from './Layer.ts';

// ── Transport Layer (stub) ──────────────────────────────────

/**
 * Placeholder transport layer.  Returns zero metrics until the
 * transport simulation is implemented.
 */
export class TransportLayer implements Layer<TransportMetrics> {
	compute(): TransportMetrics {
		return {
			totalPassengersPerHour: 0,
			averageCommuteMins: 0,
			congestionIndex: 0,
			evAdoptionRate: 0,
		};
	}
}
