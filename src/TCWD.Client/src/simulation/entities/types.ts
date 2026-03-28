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

// ── Discriminated union ─────────────────────────────────────

export type Entity =
	| DataCentreEntity
	| HousingEntity
	| EnergyPlantEntity
	| TransportEntity;
