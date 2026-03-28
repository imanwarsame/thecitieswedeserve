import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from './loaders/ModelLoader';
import type { AssetManager } from './AssetManager';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';
import { getCatalogEntry, type ModelEntry } from './AssetCatalog';

export interface AnimatedModel {
	root: THREE.Object3D;
	mixer: THREE.AnimationMixer | null;
}

// ---------------------------------------------------------------------------
// ModelFactory
// ---------------------------------------------------------------------------

/**
 * Creates ready-to-use Three.js Object3D instances from catalog entries.
 *
 * Responsibilities:
 * - Clone the cached GLTF scene (so each placement is independent)
 * - Apply monochrome materials via MaterialRegistry
 * - Apply scale and rotation offsets from the catalog entry
 * - Set up shadow casting/receiving
 *
 * Usage:
 * ```ts
 * const factory = new ModelFactory(assetManager, materialRegistry);
 * const house = factory.create('house-small');
 * scene.add(house);
 * ```
 */
export class ModelFactory {
	private assetManager: AssetManager;
	private materialRegistry: MaterialRegistry;

	constructor(assetManager: AssetManager, materialRegistry: MaterialRegistry) {
		this.assetManager = assetManager;
		this.materialRegistry = materialRegistry;
	}

	/**
	 * Register all catalog entries with the AssetManager so they can be
	 * preloaded. Call this once during engine init, before preload().
	 */
	registerCatalog(entries: ModelEntry[]): void {
		for (const entry of entries) {
			this.assetManager.register(entry.id, entry.path, 'model');
		}
	}

	/**
	 * Create a new Object3D instance from a catalog entry.
	 *
	 * @param id - The catalog entry id (e.g. 'house-small')
	 * @param options - Override scale, rotation, or material preset
	 * @returns A cloned, material-overridden, ready-to-add Object3D
	 */
	create(id: string, options?: {
		scale?: number;
		rotationY?: number;
		materialPreset?: string;
	}): THREE.Object3D {
		const entry = getCatalogEntry(id);
		if (!entry) {
			throw new Error(`[ModelFactory] No catalog entry for "${id}".`);
		}

		const gltf = this.assetManager.get<GLTF>(id);
		const root = gltf.scene.clone(true);

		// Apply material override
		const presetName = options?.materialPreset ?? entry.materialPreset;
		this.materialRegistry.applyToModel(root, presetName);

		// Apply scale
		const scale = options?.scale ?? entry.scale ?? 1;
		root.scale.setScalar(scale);

		// Apply rotation offset
		const rotY = options?.rotationY ?? entry.rotationY ?? 0;
		if (rotY !== 0) {
			root.rotation.y = rotY;
		}

		// Ensure shadow settings propagate
		root.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});

		root.name = `model_${id}`;
		return root;
	}

	/**
	 * Create a model with its AnimationMixer if the catalog entry is animated.
	 */
	createAnimated(id: string, options?: {
		scale?: number;
		rotationY?: number;
		materialPreset?: string;
	}): AnimatedModel {
		const entry = getCatalogEntry(id);
		if (!entry) {
			throw new Error(`[ModelFactory] No catalog entry for "${id}".`);
		}

		const gltf = this.assetManager.get<GLTF>(id);
		// SkeletonUtils.clone properly remaps skeleton bone references,
		// so each instance has an independent skeleton and can be
		// positioned / animated independently.
		const root = cloneSkeleton(gltf.scene);

		const presetName = options?.materialPreset ?? entry.materialPreset;
		if (presetName) {
			this.materialRegistry.applyToModel(root, presetName);
		}

		const scale = options?.scale ?? entry.scale ?? 1;
		root.scale.setScalar(scale);

		const rotY = options?.rotationY ?? entry.rotationY ?? 0;
		if (rotY !== 0) {
			root.rotation.y = rotY;
		}

		root.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});

		root.name = `model_${id}`;

		let mixer: THREE.AnimationMixer | null = null;
		if (entry.animated && gltf.animations.length > 0) {
			mixer = new THREE.AnimationMixer(root);
			for (const clip of gltf.animations) {
				// Clone each clip so property bindings are unique per instance
				mixer.clipAction(clip.clone()).play();
			}
		}

		return { root, mixer };
	}

	/**
	 * Create from a raw GLTF that isn't in the catalog (e.g. user-imported).
	 * Applies monochrome materials and returns a cloned scene root.
	 */
	createFromGLTF(gltf: GLTF, options?: {
		name?: string;
		scale?: number;
		rotationY?: number;
		materialPreset?: string;
	}): THREE.Object3D {
		const root = gltf.scene.clone(true);

		this.materialRegistry.applyToModel(root, options?.materialPreset);

		const scale = options?.scale ?? 1;
		root.scale.setScalar(scale);

		if (options?.rotationY) {
			root.rotation.y = options.rotationY;
		}

		root.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});

		root.name = options?.name ?? 'model_imported';
		return root;
	}
}
