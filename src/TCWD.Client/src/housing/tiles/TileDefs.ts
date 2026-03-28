import type { TileDef, EnergyProperties } from './TileRegistry';

// ── Energy property presets ──

const CONCRETE_WALL: EnergyProperties = {
	uValue: 0.28,           // well-insulated concrete wall W/(m²·K)
	embodiedCarbon: 180,    // kgCO₂e/m²
	thermalMass: 250,       // kJ/(m²·K)
	materialClass: 'opaque',
};

const GLAZED_WALL: EnergyProperties = {
	uValue: 1.1,            // double-glazed curtain wall
	shgc: 0.35,
	embodiedCarbon: 120,
	thermalMass: 10,
	materialClass: 'glazed',
};

const INSULATED_ROOF: EnergyProperties = {
	uValue: 0.15,           // well-insulated flat roof
	embodiedCarbon: 90,
	thermalMass: 150,
	materialClass: 'opaque',
};

const GROUND_SLAB: EnergyProperties = {
	uValue: 0.22,           // insulated ground floor slab
	embodiedCarbon: 200,
	thermalMass: 400,
	materialClass: 'opaque',
};

const OPEN_AIR: EnergyProperties = {
	uValue: 0,
	materialClass: 'open',
};

const MIXED_WALL: EnergyProperties = {
	uValue: 0.6,            // partial wall / partial opening
	shgc: 0.15,
	embodiedCarbon: 140,
	thermalMass: 120,
	materialClass: 'mixed',
};

/**
 * Housing tile definitions with energy metadata.
 * U-values follow EU nZEB (nearly Zero Energy Building) targets.
 */
export const HOUSING_TILES: TileDef[] = [
	// ── Solid blocks ──
	{
		id: 'solid-cube',
		label: 'Solid Block',
		pattern: { minBottomRatio: 1, maxBottomRatio: 1, minTopRatio: 1, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 3,
		requiresSupport: false,
		energy: CONCRETE_WALL,
	},
	{
		id: 'solid-ground',
		label: 'Ground Block',
		pattern: { minBottomRatio: 1, maxBottomRatio: 1, minTopRatio: 1, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 5,
		requiresSupport: false,
		energy: GROUND_SLAB,
	},

	// ── Roofs ──
	{
		id: 'roof-flat',
		label: 'Flat Roof',
		pattern: { minBottomRatio: 1, maxBottomRatio: 1, minTopRatio: 0, maxTopRatio: 0 },
		topSocket: 'roof',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 3,
		requiresSupport: true,
		energy: INSULATED_ROOF,
	},
	{
		id: 'roof-peaked',
		label: 'Peaked Roof',
		pattern: { minBottomRatio: 1, maxBottomRatio: 1, minTopRatio: 0, maxTopRatio: 0.5 },
		topSocket: 'air',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 2,
		requiresSupport: true,
		energy: INSULATED_ROOF,
	},

	// ── Walls ──
	{
		id: 'wall-full',
		label: 'Full Wall',
		pattern: { minBottomRatio: 0.5, maxBottomRatio: 1, minTopRatio: 0.5, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 4,
		requiresSupport: false,
		energy: CONCRETE_WALL,
	},
	{
		id: 'wall-windowed',
		label: 'Wall with Window',
		pattern: { minBottomRatio: 0.5, maxBottomRatio: 1, minTopRatio: 0.5, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'floor',
		sideSocket: 'window',
		weight: 2,
		requiresSupport: true,
		energy: GLAZED_WALL,
	},

	// ── Arches ──
	{
		id: 'arch',
		label: 'Archway',
		pattern: { minBottomRatio: 0.3, maxBottomRatio: 0.7, minTopRatio: 0.8, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'arch-t',
		sideSocket: 'arch-t',
		weight: 1,
		requiresSupport: true,
		energy: MIXED_WALL,
	},

	// ── Open / Air ──
	{
		id: 'air',
		label: 'Empty',
		pattern: { minBottomRatio: 0, maxBottomRatio: 0, minTopRatio: 0, maxTopRatio: 0 },
		topSocket: 'air',
		bottomSocket: 'air',
		sideSocket: 'open',
		weight: 1,
		requiresSupport: false,
		energy: OPEN_AIR,
	},

	// ── Transitional ──
	{
		id: 'step-up',
		label: 'Step Up',
		pattern: { minBottomRatio: 0.5, maxBottomRatio: 1, minTopRatio: 0.3, maxTopRatio: 0.7 },
		topSocket: 'floor',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 1,
		requiresSupport: true,
		energy: CONCRETE_WALL,
	},
	{
		id: 'balcony',
		label: 'Balcony',
		pattern: { minBottomRatio: 0.3, maxBottomRatio: 0.6, minTopRatio: 0, maxTopRatio: 0.3 },
		topSocket: 'air',
		bottomSocket: 'floor',
		sideSocket: 'open',
		weight: 1,
		requiresSupport: true,
		energy: MIXED_WALL,
	},
];
