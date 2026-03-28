import { EntityType, FuelType } from '../types.ts';
import type {
	DataCentreEntity,
	HousingEntity,
	EnergyPlantEntity,
	TransportEntity
} from './types.ts';

// ── Helpers ─────────────────────────────────────────────────

let _nextId = 0;
function uid(prefix: string): string {
	return `${prefix}-${++_nextId}`;
}

// ── Factories ───────────────────────────────────────────────

export function createDataCentre(
	overrides: Partial<Omit<DataCentreEntity, 'type'>> = {}
): DataCentreEntity {
	const id = overrides.id ?? uid('dc');
	return {
		id,
		name: overrides.name ?? `Data Centre ${id}`,
		type: EntityType.DataCentre,
		rackCount: overrides.rackCount ?? 500,
		pueRatio: overrides.pueRatio ?? 1.4,
		itLoadMW: overrides.itLoadMW ?? 10
	};
}

export function createHousing(
	overrides: Partial<Omit<HousingEntity, 'type'>> = {}
): HousingEntity {
	const id = overrides.id ?? uid('hs');
	return {
		id,
		name: overrides.name ?? `Housing Block ${id}`,
		type: EntityType.Housing,
		units: overrides.units ?? 1_000,
		avgConsumptionKWh: overrides.avgConsumptionKWh ?? 4_500 // kWh / year
	};
}

export function createEnergyPlant(
	fuelType: FuelType,
	overrides: Partial<Omit<EnergyPlantEntity, 'type' | 'fuelType'>> = {}
): EnergyPlantEntity {
	const id = overrides.id ?? uid('ep');
	const defaults = PLANT_DEFAULTS[fuelType];
	return {
		id,
		name: overrides.name ?? `${fuelType} Plant ${id}`,
		type: EntityType.EnergyPlant,
		fuelType,
		capacityMW: overrides.capacityMW ?? defaults.capacityMW,
		efficiencyPct: overrides.efficiencyPct ?? defaults.efficiencyPct,
		variableCostPerMWh: overrides.variableCostPerMWh ?? defaults.variableCostPerMWh,
		co2PerMWh: overrides.co2PerMWh ?? defaults.co2PerMWh
	};
}

export function createTransport(
	overrides: Partial<Omit<TransportEntity, 'type'>> = {}
): TransportEntity {
	const id = overrides.id ?? uid('tr');
	return {
		id,
		name: overrides.name ?? `Transport Hub ${id}`,
		type: EntityType.Transport,
		evChargerCount: overrides.evChargerCount ?? 200,
		railLineLengthKm: overrides.railLineLengthKm ?? 25,
		peakDemandMW: overrides.peakDemandMW ?? 15
	};
}

// ── Per-fuel-type defaults ──────────────────────────────────

const PLANT_DEFAULTS: Record<
	FuelType,
	Pick<EnergyPlantEntity, 'capacityMW' | 'efficiencyPct' | 'variableCostPerMWh' | 'co2PerMWh'>
> = {
	[FuelType.Solar]: {
		capacityMW: 100,
		efficiencyPct: 0.2,
		variableCostPerMWh: 0,
		co2PerMWh: 0
	},
	[FuelType.Wind]: {
		capacityMW: 80,
		efficiencyPct: 0.35,
		variableCostPerMWh: 0,
		co2PerMWh: 0
	},
	[FuelType.Gas]: {
		capacityMW: 200,
		efficiencyPct: 0.55,
		variableCostPerMWh: 35,
		co2PerMWh: 0.4 // tonnes CO₂ / MWh
	},
	[FuelType.Coal]: {
		capacityMW: 300,
		efficiencyPct: 0.38,
		variableCostPerMWh: 25,
		co2PerMWh: 0.9
	},
	[FuelType.Nuclear]: {
		capacityMW: 500,
		efficiencyPct: 0.33,
		variableCostPerMWh: 10,
		co2PerMWh: 0
	}
};
