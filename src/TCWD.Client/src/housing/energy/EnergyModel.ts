import type { Building } from '../BuildingAnalyzer';
import { HousingConfig } from '../HousingConfig';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface ClimateData {
	/** Heating degree-days base 18°C (annual). Amsterdam ~2800, Oslo ~4200, Dubai ~0. */
	heatingDegreeDays: number;
	/** Cooling degree-days base 24°C (annual). Amsterdam ~100, Dubai ~2500. */
	coolingDegreeDays: number;
	/** Annual solar irradiance kWh/m²/yr by cardinal direction (vertical surfaces). */
	solarIrradiance: Record<string, number>;
	latitude: number;
}

export type ThermalZoneType =
	| 'perimeter'
	| 'core'
	| 'top-exposed'
	| 'ground-contact'
	| 'semi-outdoor'
	| 'service';

export interface ThermalZone {
	type: ThermalZoneType;
	voxelKeys: Set<string>;
	exteriorArea: number;
	volume: number;
	avgUValue: number;
}

export interface AnnualEnergyEstimate {
	heatingDemand: number;         // kWh/yr
	coolingDemand: number;         // kWh/yr
	eui: number;                   // kWh/m²/yr
	heatingPeak: number;           // W (design day peak)
	carbonOperational: number;     // kgCO₂e/yr
	solarGainTotal: number;        // kWh/yr
}

export interface DaylightMetrics {
	spatialDaylightAutonomy: number;  // % of floor with >300 lux
	avgDaylightFactor: number;        // %
	usefulDaylightDepth: number;      // m
}

export interface VentilationPotential {
	crossVentilationPossible: boolean;
	stackVentilationHeight: number;
	naturallyVentilatableFraction: number;
}

export interface WholeLifeCarbon {
	embodiedUpfront: number;
	embodiedReplacement: number;
	operationalCarbon: number;
	endOfLife: number;
	total: number;
	intensity: number;  // kgCO₂e/m²/yr
}

// ═══════════════════════════════════════════════════════
// Climate presets
// ═══════════════════════════════════════════════════════

const SOLAR_52N: Record<string, number> = {
	'S': 980, 'SE': 780, 'SW': 780, 'E': 590, 'W': 590,
	'NE': 380, 'NW': 380, 'N': 290, 'up': 1050, 'down': 0,
};

export const CLIMATES: Record<string, ClimateData> = {
	copenhagen: { heatingDegreeDays: 3200, coolingDegreeDays: 50, solarIrradiance: SOLAR_52N, latitude: 55.7 },
	amsterdam:  { heatingDegreeDays: 2800, coolingDegreeDays: 100, solarIrradiance: SOLAR_52N, latitude: 52.4 },
	london:     { heatingDegreeDays: 2600, coolingDegreeDays: 80, solarIrradiance: SOLAR_52N, latitude: 51.5 },
	oslo:       { heatingDegreeDays: 4200, coolingDegreeDays: 20, solarIrradiance: SOLAR_52N, latitude: 59.9 },
};

// ═══════════════════════════════════════════════════════
// Steady-state energy model (degree-day method)
// ═══════════════════════════════════════════════════════

export function estimateAnnualEnergy(
	building: Building,
	climate: ClimateData,
): AnnualEnergyEstimate {
	const m = building.metrics;

	// Transmission heat loss coefficient HT (W/K)
	const extFaces = building.envelope.filter(f => f.exposure === 'exterior');
	const HT = extFaces.reduce((sum, f) => sum + f.energy.uValue * f.area, 0);

	// Ventilation heat loss HV (W/K) — 0.5 ACH
	const ACH = 0.5;
	const HV = ACH * m.conditionedVolume * 1.2 * 1005 / 3600;

	const Htotal = HT + HV;

	// Annual heating demand (kWh)
	const heatingGross = Htotal * climate.heatingDegreeDays * 24 / 1000;

	// Solar gains
	const solarGainTotal = extFaces.reduce((sum, f) => {
		if (!f.energy.shgc) return sum;
		const irr = climate.solarIrradiance[f.direction] ?? 0;
		return sum + f.area * f.energy.shgc * irr * 0.85; // 15% frame reduction
	}, 0);

	// Internal gains (20 W/m² × 2500 occupied hours)
	const internalGains = m.grossFloorArea * 20 * 2500 / 1000;

	// Net heating
	const heatingDemand = Math.max(0, heatingGross - solarGainTotal * 0.8 - internalGains * 0.7);

	// Cooling
	const coolingDemand = Htotal * climate.coolingDegreeDays * 24 / 1000
		+ solarGainTotal * 0.5 + internalGains * 0.3;

	const eui = m.grossFloorArea > 0 ? (heatingDemand + coolingDemand) / m.grossFloorArea : 0;
	const heatingPeak = Htotal * 30; // design delta-T 30K
	const carbonOperational = (heatingDemand * 0.2 + coolingDemand * 0.5) * 0.3; // grid factor

	return { heatingDemand, coolingDemand, eui, heatingPeak, carbonOperational, solarGainTotal };
}

// ═══════════════════════════════════════════════════════
// Thermal zone inference
// ═══════════════════════════════════════════════════════

export function classifyThermalZones(building: Building): ThermalZone[] {
	const h = HousingConfig.layerHeight;
	const zones = new Map<ThermalZoneType, ThermalZone>();

	const ensure = (type: ThermalZoneType): ThermalZone => {
		if (!zones.has(type)) zones.set(type, { type, voxelKeys: new Set(), exteriorArea: 0, volume: 0, avgUValue: 0 });
		return zones.get(type)!;
	};

	for (const key of building.voxelKeys) {
		const [_ci, li] = key.split(':').map(Number);
		const faces = building.envelope.filter(f => `${f.cellIndex}:${f.layer}` === key);
		const extSideFaces = faces.filter(f => f.exposure === 'exterior' && f.direction !== 'up' && f.direction !== 'down');
		const hasExtTop = faces.some(f => f.exposure === 'exterior' && f.direction === 'up');
		const isGround = li === 0;

		let zoneType: ThermalZoneType;
		if (extSideFaces.length > 0 && hasExtTop) zoneType = 'top-exposed';
		else if (isGround && extSideFaces.length > 0) zoneType = 'ground-contact';
		else if (extSideFaces.length > 0) zoneType = 'perimeter';
		else zoneType = 'core';

		const zone = ensure(zoneType);
		zone.voxelKeys.add(key);
		zone.exteriorArea += faces.filter(f => f.exposure === 'exterior').reduce((s, f) => s + f.area, 0);
		zone.volume += faces.filter(f => f.direction === 'up').reduce((s, f) => s + f.area, 0) * h;
	}

	// Compute avg U-values
	for (const zone of zones.values()) {
		let uSum = 0, aSum = 0;
		for (const key of zone.voxelKeys) {
			const faces = building.envelope.filter(f => `${f.cellIndex}:${f.layer}` === key && f.exposure === 'exterior');
			for (const f of faces) { uSum += f.energy.uValue * f.area; aSum += f.area; }
		}
		zone.avgUValue = aSum > 0 ? uSum / aSum : 0;
	}

	return [...zones.values()];
}

// ═══════════════════════════════════════════════════════
// Daylight estimation
// ═══════════════════════════════════════════════════════

export function estimateDaylight(building: Building, cellIndex: number, layer: number): DaylightMetrics {
	const h = HousingConfig.layerHeight;
	const key = `${cellIndex}:${layer}`;

	const glazedFaces = building.envelope.filter(f =>
		`${f.cellIndex}:${f.layer}` === key &&
		f.energy.materialClass === 'glazed' &&
		f.exposure === 'exterior' &&
		f.direction !== 'up' && f.direction !== 'down'
	);

	if (glazedFaces.length === 0) {
		return { spatialDaylightAutonomy: 0, avgDaylightFactor: 0, usefulDaylightDepth: 0 };
	}

	const windowHeadHeight = h * 0.85;
	const daylightDepth = windowHeadHeight * 2.5;

	const allSideFaces = building.envelope.filter(f =>
		`${f.cellIndex}:${f.layer}` === key && f.exposure === 'exterior' && f.direction !== 'up' && f.direction !== 'down'
	);
	const glazedArea = glazedFaces.reduce((s, f) => s + f.area, 0);
	const totalArea = allSideFaces.reduce((s, f) => s + f.area, 0);
	const glazingRatio = totalArea > 0 ? glazedArea / totalArea : 0;

	const transmittance = 0.7;
	const avgDaylightFactor = glazingRatio * transmittance * 0.45 * 100;
	const daylitFraction = Math.min(1, (daylightDepth * 2) / 15);
	const spatialDaylightAutonomy = daylitFraction * Math.min(1, avgDaylightFactor / 2) * 100;

	return { spatialDaylightAutonomy, avgDaylightFactor, usefulDaylightDepth: daylightDepth };
}

// ═══════════════════════════════════════════════════════
// Natural ventilation potential
// ═══════════════════════════════════════════════════════

export function assessVentilation(building: Building, layer: number): VentilationPotential {
	const h = HousingConfig.layerHeight;

	const openFaces = building.envelope.filter(f =>
		f.layer === layer && f.exposure === 'exterior' &&
		f.direction !== 'up' && f.direction !== 'down' &&
		(f.energy.materialClass === 'glazed' || f.energy.materialClass === 'open')
	);

	let crossVent = false;
	for (let i = 0; i < openFaces.length && !crossVent; i++) {
		for (let j = i + 1; j < openFaces.length; j++) {
			const delta = Math.abs(openFaces[i].bearing - openFaces[j].bearing);
			const opp = Math.min(delta, 360 - delta);
			if (opp > 120 && opp < 240) { crossVent = true; break; }
		}
	}

	const topLayer = Math.max(...[...building.voxelKeys].map(k => parseInt(k.split(':')[1])));
	const stackHeight = (topLayer - layer + 1) * h;
	const crossDepth = crossVent ? h * 5 : h * 2.5;

	return {
		crossVentilationPossible: crossVent,
		stackVentilationHeight: stackHeight,
		naturallyVentilatableFraction: Math.min(1, crossDepth / 15),
	};
}

// ═══════════════════════════════════════════════════════
// Whole-life carbon
// ═══════════════════════════════════════════════════════

export function computeWholeLifeCarbon(
	building: Building,
	energy: AnnualEnergyEstimate,
	lifespan = 60,
	gridCarbonIntensity = 0.3,
): WholeLifeCarbon {
	const embodiedUpfront = building.metrics.totalEmbodiedCarbon;
	const glazedArea = building.metrics.glazingArea;
	const replacementCycles = Math.floor(lifespan / 30);
	const embodiedReplacement = glazedArea * 120 * replacementCycles;

	let operationalCarbon = 0;
	for (let y = 0; y < lifespan; y++) {
		const factor = gridCarbonIntensity * (1 - 0.8 * y / lifespan);
		operationalCarbon += (energy.heatingDemand + energy.coolingDemand) * factor;
	}

	const endOfLife = embodiedUpfront * 0.1;
	const total = embodiedUpfront + embodiedReplacement + operationalCarbon + endOfLife;
	const gfa = building.metrics.grossFloorArea;

	return {
		embodiedUpfront,
		embodiedReplacement,
		operationalCarbon,
		endOfLife,
		total,
		intensity: gfa > 0 ? total / (gfa * lifespan) : 0,
	};
}
