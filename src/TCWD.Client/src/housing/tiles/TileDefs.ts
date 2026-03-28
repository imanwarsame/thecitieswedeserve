import type { TileDef } from './TileRegistry';

/**
 * Housing tile definitions.
 * Abstract building shapes — Sprint 04 maps each tile id to geometry.
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
	},

	// ── Roofs (solid below, empty above) ──
	{
		id: 'roof-flat',
		label: 'Flat Roof',
		pattern: { minBottomRatio: 1, maxBottomRatio: 1, minTopRatio: 0, maxTopRatio: 0 },
		topSocket: 'roof',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 3,
		requiresSupport: true,
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
	},

	// ── Walls (partial side solidity) ──
	{
		id: 'wall-full',
		label: 'Full Wall',
		pattern: { minBottomRatio: 0.5, maxBottomRatio: 1, minTopRatio: 0.5, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'floor',
		sideSocket: 'solid',
		weight: 4,
		requiresSupport: false,
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
	},

	// ── Arches (bottom partially open) ──
	{
		id: 'arch',
		label: 'Archway',
		pattern: { minBottomRatio: 0.3, maxBottomRatio: 0.7, minTopRatio: 0.8, maxTopRatio: 1 },
		topSocket: 'floor',
		bottomSocket: 'arch-t',
		sideSocket: 'arch-t',
		weight: 1,
		requiresSupport: true,
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
	},
];
