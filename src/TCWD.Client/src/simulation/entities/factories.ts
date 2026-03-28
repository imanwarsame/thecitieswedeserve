import { EntityType, FuelType } from '../types.ts';
import type {
	DataCentreEntity,
	HousingEntity,
	EnergyPlantEntity,
	TransportEntity,
	OfficeEntity,
	CommercialEntity,
	SchoolEntity,
	LeisureEntity,
	ParkEntity,
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

// ── Civic building factories ────────────────────────────────

export function createOffice(
	overrides: Partial<Omit<OfficeEntity, 'type'>> = {}
): OfficeEntity {
	const id = overrides.id ?? uid('of');
	return {
		id,
		name: overrides.name ?? `Office ${id}`,
		type: EntityType.Office,
		floorArea: overrides.floorArea ?? 20_000,
		employeeCount: overrides.employeeCount ?? 2_000,
		avgConsumptionKWh: overrides.avgConsumptionKWh ?? 4_000_000,
	};
}

export function createCommercial(
	overrides: Partial<Omit<CommercialEntity, 'type'>> = {}
): CommercialEntity {
	const id = overrides.id ?? uid('cm');
	return {
		id,
		name: overrides.name ?? `Commercial ${id}`,
		type: EntityType.Commercial,
		floorArea: overrides.floorArea ?? 15_000,
		avgConsumptionKWh: overrides.avgConsumptionKWh ?? 3_500_000,
	};
}

export function createSchool(
	overrides: Partial<Omit<SchoolEntity, 'type'>> = {}
): SchoolEntity {
	const id = overrides.id ?? uid('sc');
	return {
		id,
		name: overrides.name ?? `School ${id}`,
		type: EntityType.School,
		studentCapacity: overrides.studentCapacity ?? 2_000,
		avgConsumptionKWh: overrides.avgConsumptionKWh ?? 1_500_000,
	};
}

export function createLeisure(
	overrides: Partial<Omit<LeisureEntity, 'type'>> = {}
): LeisureEntity {
	const id = overrides.id ?? uid('ls');
	return {
		id,
		name: overrides.name ?? `Leisure Centre ${id}`,
		type: EntityType.Leisure,
		visitorCapacity: overrides.visitorCapacity ?? 1_500,
		avgConsumptionKWh: overrides.avgConsumptionKWh ?? 2_500_000,
	};
}

export function createPark(
	overrides: Partial<Omit<ParkEntity, 'type'>> = {}
): ParkEntity {
	const id = overrides.id ?? uid('pk');
	return {
		id,
		name: overrides.name ?? `Park ${id}`,
		type: EntityType.Park,
		areaSqM: overrides.areaSqM ?? 25_000,
		avgConsumptionKWh: overrides.avgConsumptionKWh ?? 150_000,
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
