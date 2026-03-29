import type { MaterialPreset } from '../rendering/MaterialRegistry';
import type { BuildingType } from '../simulation/bridge/BuildingFactory';

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
	/** Maps this model to a simulation BuildingType so its meshes register as sim entities. */
	simulationType?: BuildingType;
}

export type ModelCategory =
	| 'residential'
	| 'commercial'
	| 'industrial'
	| 'nature'
	| 'infrastructure'
	| 'decoration'
	| 'roads'
	| 'water'
	| 'buildings'
	| 'environment'
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
		scale: 5,
		rotationY: Math.PI / 4,
		preload: true,
		animated: true,
	},

	// ---- Roads (Forma / Rhino export – 546 meshes, material: FormaRoads) ----
	{
		id: 'roads',
		path: '/models/roads/roads.glb',
		label: 'Roads Network',
		category: 'roads',
		scale: 1,
		materialPreset: 'forma-roads',
		preload: true,
	},

	// ---- Water (Rhino/Blender export – 8 meshes, blue rgba) ----
	{
		id: 'water',
		path: '/models/water/water.glb',
		label: 'Water Bodies',
		category: 'water',
		scale: 1,
		materialPreset: 'forma-water',
		preload: true,
	},

	// ---- Buildings (Forma / Rhino export – material: FormaBuildings) ----
	{
		id: 'buildings',
		path: '/models/buildings/buildings.glb',
		label: 'Buildings',
		category: 'buildings',
		scale: 1,
		materialPreset: 'forma-buildings',
		preload: true,
		simulationType: 'office',
	},
	{
		id: 'comercial',
		path: '/models/buildings/comercial.glb',
		label: 'Commercial Buildings',
		category: 'buildings',
		scale: 1,
		materialPreset: 'forma-buildings',
		preload: true,
		simulationType: 'commercial',
	},
	{
		id: 'housing',
		path: '/models/buildings/housing.glb',
		label: 'Housing',
		category: 'buildings',
		scale: 1,
		materialPreset: 'forma-buildings',
		preload: true,
		simulationType: 'housing',
	},
	{
		id: 'leasure',
		path: '/models/buildings/leasure.glb',
		label: 'Leisure',
		category: 'buildings',
		scale: 1,
		materialPreset: 'forma-buildings',
		preload: true,
		simulationType: 'leisure',
	},
	{
		id: 'school',
		path: '/models/buildings/school.glb',
		label: 'School',
		category: 'buildings',
		scale: 1,
		materialPreset: 'forma-buildings',
		preload: true,
		simulationType: 'school',
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
	// ---- Forma-specific presets (matched to actual GLB material names) ----
	{
		name: 'forma-roads',
		meshMaterials: {
			'FormaRoads': 'ground',
			'*': 'ground',
		},
	},
	{
		name: 'forma-water',
		meshMaterials: {
			'*': 'water',
		},
	},
	{
		name: 'forma-buildings',
		meshMaterials: {
			'FormaBuildings': 'structure',
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