import type { MaterialPreset } from '../rendering/MaterialRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelEntry {
	/** Unique identifier for this model (e.g. 'house-small', 'tree-oak'). */
	id: string;
	/** Path to the GLB/GLTF file, relative to public root (e.g. '/models/house.glb'). */
	path: string;
	/** Human-readable display name. */
	label: string;
	/** Category for grouping in UI (e.g. 'residential', 'nature', 'infrastructure'). */
	category: ModelCategory;
	/** Uniform scale applied after loading. Default 1. */
	scale?: number;
	/** Y-axis rotation offset in radians (align model to face forward). */
	rotationY?: number;
	/** Name of the MaterialPreset to apply. If omitted, all meshes get 'structure'. */
	materialPreset?: string;
	/** How many grid cells this occupies (1 = single cell). Default 1. */
	footprint?: number;
	/** If true, this model is preloaded at startup. Default false. */
	preload?: boolean;
	/** If true, the GLB contains animations that should be played. Default false. */
	animated?: boolean;
}

export type ModelCategory =
	| 'residential'
	| 'commercial'
	| 'industrial'
	| 'nature'
	| 'infrastructure'
	| 'decoration'
	| 'debug';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Central registry of all model assets available to the game.
 *
 * To add a new GLB/GLTF model:
 * 1. Place the file in `public/models/<category>/`
 * 2. Add an entry below
 * 3. (Optional) Define a MaterialPreset in MaterialPresets.ts
 *
 * Example:
 * ```ts
 * {
 *   id: 'house-small',
 *   path: '/models/residential/house-small.glb',
 *   label: 'Small House',
 *   category: 'residential',
 *   scale: 1,
 *   materialPreset: 'house-wooden',
 *   preload: true,
 * }
 * ```
 */
export const AssetCatalog: ModelEntry[] = [
	// ---- Infrastructure ----
	{
		id: 'wind-turbine',
		path: '/models/infrastructure/wind-turbine.glb',
		label: 'Wind Turbine',
		category: 'infrastructure',
		scale: 1,
		preload: true,
		animated: true,
	},
];

// ---------------------------------------------------------------------------
// Material presets for models
// ---------------------------------------------------------------------------

/**
 * Default material presets for common model types.
 * Each preset maps mesh name patterns to MaterialRegistry keys.
 * Register these with MaterialRegistry.definePreset() at init.
 */
export const DefaultMaterialPresets: MaterialPreset[] = [
	{
		name: 'building-generic',
		meshMaterials: {
			'wall': 'structure',
			'roof': 'detail',
			'window': 'glass',
			'door': 'detail',
			'trim': 'accent',
			'foundation': 'ground',
			'*': 'structure',
		},
	},
	{
		name: 'nature',
		meshMaterials: {
			'trunk': 'detail',
			'bark': 'detail',
			'leaves': 'foliage',
			'canopy': 'foliage',
			'rock': 'ground',
			'*': 'foliage',
		},
	},
	{
		name: 'infrastructure',
		meshMaterials: {
			'beam': 'metal',
			'rail': 'metal',
			'pole': 'metal',
			'base': 'ground',
			'surface': 'structure',
			'*': 'structure',
		},
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a catalog entry by id. */
export function getCatalogEntry(id: string): ModelEntry | undefined {
	return AssetCatalog.find(e => e.id === id);
}

/** Get all entries that should be preloaded. */
export function getPreloadEntries(): ModelEntry[] {
	return AssetCatalog.filter(e => e.preload);
}

/** Get entries filtered by category. */
export function getEntriesByCategory(category: ModelCategory): ModelEntry[] {
	return AssetCatalog.filter(e => e.category === category);
}
