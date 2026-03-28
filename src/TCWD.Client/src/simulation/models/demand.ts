import { EntityType } from '../types.ts';
import type { MWh } from '../types.ts';
import type {
	Entity,
	DataCentreEntity,
	HousingEntity,
	TransportEntity
} from '../entities/types.ts';

// ── Diurnal multiplier curves ───────────────────────────────

/**
 * Housing demand follows a residential diurnal pattern:
 *   - Overnight (0–5):   0.3× base
 *   - Morning   (6–9):   1.3× base (wake-up, heating/cooling)
 *   - Midday    (10–16): 0.8× base (most residents out)
 *   - Evening   (17–21): 1.5× base (cooking, heating, lighting)
 *   - Late      (22–23): 0.6× base (winding down)
 */
const HOUSING_HOUR_MULTIPLIER: readonly number[] = [
	// 0     1     2     3     4     5
	0.30, 0.28, 0.25, 0.25, 0.27, 0.30,
	// 6     7     8     9
	0.90, 1.20, 1.30, 1.25,
	// 10    11    12    13    14    15    16
	0.80, 0.75, 0.85, 0.80, 0.75, 0.78, 0.82,
	// 17    18    19    20    21    22    23
	1.30, 1.50, 1.50, 1.40, 1.20, 0.70, 0.45
];

/**
 * Seasonal multiplier — higher demand in winter (heating), lower in summer.
 * Uses a cosine curve peaking on ~day 0 (Jan 1 ≈ mid-winter in Northern Hemisphere).
 */
function seasonalMultiplier(dayOfYear: number, daysPerYear: number = 365): number {
	const angle = (2 * Math.PI * dayOfYear) / daysPerYear;
	// Range ≈ [0.85, 1.15] — winter peak, summer trough
	return 1.0 + 0.15 * Math.cos(angle);
}

// ── Per-entity demand functions ─────────────────────────────

export function housingDemand(
	entity: HousingEntity,
	hour: number,
	dayOfYear: number
): MWh {
	// Convert annual kWh to hourly MW base:  kWh/year → MWh/hour
	const annualMWh = (entity.units * entity.avgConsumptionKWh) / 1_000;
	const hourlyBaseMWh = annualMWh / 8_760; // hours per year

	const diurnal = HOUSING_HOUR_MULTIPLIER[hour] ?? 1.0;
	const seasonal = seasonalMultiplier(dayOfYear);

	return hourlyBaseMWh * diurnal * seasonal;
}

export function dataCentreDemand(
	entity: DataCentreEntity,
	hour: number
): MWh {
	const baseMW = entity.itLoadMW * entity.pueRatio;
	// Slight uplift during business hours (cooling load increase)
	const businessHourBoost = hour >= 9 && hour <= 17 ? 1.05 : 1.0;
	return baseMW * businessHourBoost; // 1 hour tick → MWh = MW × 1h
}

export function transportDemand(
	entity: TransportEntity,
	hour: number
): MWh {
	const baseMW = entity.peakDemandMW;

	let multiplier: number;
	if (hour >= 7 && hour <= 9) {
		multiplier = 0.85; // morning rush — high but not absolute peak
	} else if (hour >= 17 && hour <= 19) {
		multiplier = 1.0; // evening rush — peak
	} else if (hour >= 10 && hour <= 16) {
		multiplier = 0.4; // midday
	} else if (hour >= 20 && hour <= 22) {
		multiplier = 0.3; // evening wind-down
	} else {
		multiplier = 0.1; // overnight
	}

	return baseMW * multiplier;
}

// ── Aggregate ───────────────────────────────────────────────

export interface DemandBreakdown {
	readonly perEntity: Map<string, MWh>;
	readonly byType: Record<string, MWh>;
	readonly totalMWh: MWh;
}

export function totalDemand(
	entities: readonly Entity[],
	hour: number,
	dayOfYear: number
): DemandBreakdown {
	const perEntity = new Map<string, MWh>();
	const byType: Record<string, MWh> = {};
	let total = 0;

	for (const e of entities) {
		let d = 0;
		switch (e.type) {
			case EntityType.Housing:
				d = housingDemand(e, hour, dayOfYear);
				break;
			case EntityType.DataCentre:
				d = dataCentreDemand(e, hour);
				break;
			case EntityType.Transport:
				d = transportDemand(e, hour);
				break;
			case EntityType.EnergyPlant:
				continue; // plants don't consume from grid in this model
		}
		perEntity.set(e.id, d);
		byType[e.type] = (byType[e.type] ?? 0) + d;
		total += d;
	}

	return { perEntity, byType, totalMWh: total };
}
