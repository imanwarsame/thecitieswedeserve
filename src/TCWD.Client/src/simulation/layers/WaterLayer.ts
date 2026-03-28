import type { WaterMetrics } from '../metrics/types.ts';
import type { Layer } from './Layer.ts';

// ── Water Layer (stub) ──────────────────────────────────────

/**
 * Placeholder water layer.  Returns zero metrics until the
 * water simulation is implemented.
 */
export class WaterLayer implements Layer<WaterMetrics> {
	compute(): WaterMetrics {
		return {
			totalDemandLitres: 0,
			totalSupplyLitres: 0,
			waterQualityIndex: 0,
			wastewaterTreatedPct: 0,
		};
	}
}
