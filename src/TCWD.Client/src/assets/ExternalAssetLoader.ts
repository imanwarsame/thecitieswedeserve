import * as THREE from 'three';
import { AssetManager } from './AssetManager';
import { ModelFactory, type AnimatedModel } from './ModelFactory';
import { AssetCatalog, type ModelEntry, type ModelCategory } from './AssetCatalog';
import { events } from '../core/Events';

// ---------------------------------------------------------------------------
// ExternalAssetLoader
// ---------------------------------------------------------------------------
//
// High-level helper for loading GLB assets exported from Rhino / Blender
// and placing them into the game scene with full interaction support.
//
// Usage:
//   const loader = new ExternalAssetLoader(assetManager, modelFactory);
//
//   // Register a new model at runtime (e.g. from a file picker)
//   loader.register({
//       id:       'my-road-segment',
//       path:     '/models/roads/my-road.glb',
//       label:    'Custom Road Segment',
//       category: 'roads',
//       scale:    1,
//       materialPreset: 'road',
//   });
//
//   // Load and place it in the scene
//   const mesh = await loader.loadAndCreate('my-road-segment');
//   mesh.position.set(x, 0, z);
//   entityGroup.add(mesh);   // ← adds to the entity group → gets raycasting
// ---------------------------------------------------------------------------

export class ExternalAssetLoader {
	private assetManager: AssetManager;
	private modelFactory: ModelFactory;
	private dynamicEntries: ModelEntry[] = [];

	constructor(assetManager: AssetManager, modelFactory: ModelFactory) {
		this.assetManager = assetManager;
		this.modelFactory = modelFactory;
	}

	// -----------------------------------------------------------------------
	// Register a new model entry at runtime
	// -----------------------------------------------------------------------

	/**
	 * Register a single model entry and make it available for loading.
	 * Call this when the user drops a new GLB into the project,
	 * or when you want to add models programmatically.
	 */
	register(entry: ModelEntry): void {
		// Avoid duplicates
		if (AssetCatalog.find(e => e.id === entry.id)) {
			console.warn(`[ExternalAssetLoader] "${entry.id}" already in catalog.`);
			return;
		}

		// Add to the live catalog array so getCatalogEntry() works
		AssetCatalog.push(entry);
		this.dynamicEntries.push(entry);

		// Register with AssetManager for loading
		this.assetManager.register(entry.id, entry.path, 'model');

		console.log(`[ExternalAssetLoader] Registered "${entry.id}" → ${entry.path}`);
	}

	/**
	 * Register multiple entries at once.
	 */
	registerBatch(entries: ModelEntry[]): void {
		for (const entry of entries) {
			this.register(entry);
		}
	}

	// -----------------------------------------------------------------------
	// Load + Create helpers
	// -----------------------------------------------------------------------

	/**
	 * Preload a registered model (downloads the GLB and caches it).
	 */
	async preload(id: string): Promise<void> {
		await this.assetManager.preload([id]);
	}

	/**
	 * Preload all dynamically registered models.
	 */
	async preloadAll(): Promise<void> {
		const ids = this.dynamicEntries.map(e => e.id);
		if (ids.length === 0) return;
		await this.assetManager.preload(ids);
	}

	/**
	 * Load a model (if not cached), create a clone, and return it
	 * ready to be placed in the scene.
	 *
	 * The returned Object3D has shadows enabled, materials applied,
	 * and correct scale/rotation from the catalog entry.
	 */
	async loadAndCreate(id: string, options?: {
		scale?: number;
		rotationY?: number;
		materialPreset?: string;
	}): Promise<THREE.Object3D> {
		// Ensure it's loaded
		if (!this.assetManager.has(id)) {
			await this.preload(id);
		}

		return this.modelFactory.create(id, options);
	}

	/**
	 * Same as loadAndCreate but also returns an AnimationMixer
	 * for models with embedded animations (e.g. animated water, wind turbines).
	 */
	async loadAndCreateAnimated(id: string, options?: {
		scale?: number;
		rotationY?: number;
		materialPreset?: string;
	}): Promise<AnimatedModel> {
		if (!this.assetManager.has(id)) {
			await this.preload(id);
		}

		return this.modelFactory.createAnimated(id, options);
	}

	// -----------------------------------------------------------------------
	// Convenience: place into entity group with interaction
	// -----------------------------------------------------------------------

	/**
	 * Load, create, position, and add a model to the entity group so it
	 * automatically gets raycasting (hover outline + click selection).
	 *
	 * @param id        Catalog id of the model
	 * @param position  World position (x, y, z)
	 * @param entityGroup  The scene's entity THREE.Group
	 * @param options   Optional overrides
	 * @returns The placed Object3D
	 */
	async placeInScene(
		id: string,
		position: THREE.Vector3 | { x: number; y: number; z: number },
		entityGroup: THREE.Group,
		options?: {
			scale?: number;
			rotationY?: number;
			materialPreset?: string;
		},
	): Promise<THREE.Object3D> {
		const mesh = await this.loadAndCreate(id, options);
		mesh.position.set(position.x, position.y, position.z);

		// Add to entity group → SelectionManager raycasts against this group
		entityGroup.add(mesh);

		events.emit('external:placed', { id, mesh });
		return mesh;
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	/** Get all dynamically registered entries. */
	getDynamicEntries(): readonly ModelEntry[] {
		return this.dynamicEntries;
	}

	/** Get entries filtered by category. */
	getByCategory(category: ModelCategory): ModelEntry[] {
		return this.dynamicEntries.filter(e => e.category === category);
	}
}
