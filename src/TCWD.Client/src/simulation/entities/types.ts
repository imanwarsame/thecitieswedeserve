import { EntityType, FuelType } from '../types.ts';
import type { MWh, MW, Currency } from '../types.ts';

// ── Base entity ─────────────────────────────────────────────

interface EntityBase {
	readonly id: string;
	readonly name: string;
}

// ── Data Centre ─────────────────────────────────────────────

export interface DataCentreEntity extends EntityBase {
	readonly type: typeof EntityType.DataCentre;
	/** Number of server racks */
	readonly rackCount: number;
	/** Power Usage Effectiveness ratio (≥ 1.0) */
	readonly pueRatio: number;
	/** IT load in megawatts */
	readonly itLoadMW: MW;
}

// ── Housing ─────────────────────────────────────────────────

export interface HousingEntity extends EntityBase {
	readonly type: typeof EntityType.Housing;
	/** Number of households */
	readonly units: number;
	/** Average annual consumption per household (kWh) */
	readonly avgConsumptionKWh: MWh;
}

// ── Energy Plant ────────────────────────────────────────────

export interface EnergyPlantEntity extends EntityBase {
	readonly type: typeof EntityType.EnergyPlant;
	readonly fuelType: FuelType;
	/** Nameplate capacity in MW */
	readonly capacityMW: MW;
	/** Conversion efficiency (0–1) */
	readonly efficiencyPct: number;
	/** Variable operating cost per MWh generated */
	readonly variableCostPerMWh: Currency;
	/** CO₂ emitted per MWh generated */
	readonly co2PerMWh: number;
}

// ── Transport ───────────────────────────────────────────────

export interface TransportEntity extends EntityBase {
	readonly type: typeof EntityType.Transport;
	/** Number of EV charging stations */
	readonly evChargerCount: number;
	/** Length of electrified rail lines (km) */
	readonly railLineLengthKm: number;
	/** Peak electricity demand in MW */
	readonly peakDemandMW: MW;
}

// ── Office ──────────────────────────────────────────────────

export interface OfficeEntity extends EntityBase {
	readonly type: typeof EntityType.Office;
	/** Gross floor area in m² */
	readonly floorArea: number;
	/** Number of employees */
	readonly employeeCount: number;
	/** Average annual consumption (kWh) */
	readonly avgConsumptionKWh: MWh;
}

// ── Commercial ──────────────────────────────────────────────

export interface CommercialEntity extends EntityBase {
	readonly type: typeof EntityType.Commercial;
	/** Gross floor area in m² */
	readonly floorArea: number;
	/** Average annual consumption (kWh) */
	readonly avgConsumptionKWh: MWh;
}

// ── School ──────────────────────────────────────────────────

export interface SchoolEntity extends EntityBase {
	readonly type: typeof EntityType.School;
	/** Maximum student capacity */
	readonly studentCapacity: number;
	/** Average annual consumption (kWh) */
	readonly avgConsumptionKWh: MWh;
}

// ── Leisure ─────────────────────────────────────────────────

export interface LeisureEntity extends EntityBase {
	readonly type: typeof EntityType.Leisure;
	/** Maximum visitor capacity */
	readonly visitorCapacity: number;
	/** Average annual consumption (kWh) */
	readonly avgConsumptionKWh: MWh;
}

// ── Park ────────────────────────────────────────────────────

export interface ParkEntity extends EntityBase {
	readonly type: typeof EntityType.Park;
	/** Park area in m² */
	readonly areaSqM: number;
	/** Average annual consumption (kWh) — lighting & irrigation */
	readonly avgConsumptionKWh: MWh;
}

// ── Discriminated union ─────────────────────────────────────

export type Entity =
	| DataCentreEntity
	| HousingEntity
	| EnergyPlantEntity
	| TransportEntity
	| OfficeEntity
	| CommercialEntity
	| SchoolEntity
	| LeisureEntity
	| ParkEntity;
