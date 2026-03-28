import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type { GLTF };

// ---------------------------------------------------------------------------
// Shared loader instances (reused across all loadModel calls)
// ---------------------------------------------------------------------------

const dracoLoader = new DRACOLoader();
// Draco decoder wasm lives in the Three.js package — Vite serves it from here
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
dracoLoader.setDecoderConfig({ type: 'js' }); // fallback if wasm unavailable

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// ---------------------------------------------------------------------------
// Load function
// ---------------------------------------------------------------------------

/**
 * Load a GLB/GLTF model.
 *
 * - Supports Draco-compressed meshes automatically.
 * - Enables shadow cast/receive on all meshes.
 * - Logs progress for large files.
 */
export function loadModel(
	path: string,
	onProgress?: (event: ProgressEvent) => void,
): Promise<GLTF> {
	return new Promise((resolve, reject) => {
		loader.load(
			path,
			(gltf) => {
				gltf.scene.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						child.castShadow = true;
						child.receiveShadow = true;
					}
				});
				console.log(`[ModelLoader] Loaded "${path}" (${countMeshes(gltf.scene)} meshes)`);
				resolve(gltf);
			},
			onProgress,
			(err) => {
				console.warn(`[ModelLoader] Failed to load "${path}":`, err);
				reject(err);
			},
		);
	});
}

/**
 * Dispose the shared Draco loader when the engine shuts down.
 * Call this from Engine.stop() if you want to free wasm memory.
 */
export function disposeDracoLoader(): void {
	dracoLoader.dispose();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMeshes(root: THREE.Object3D): number {
	let count = 0;
	root.traverse((child) => {
		if (child instanceof THREE.Mesh) count++;
	});
	return count;
}
