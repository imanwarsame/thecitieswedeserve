import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export type { GLTF };

export function loadModel(path: string): Promise<GLTF> {
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
				resolve(gltf);
			},
			undefined,
			(err) => {
				console.warn(`[ModelLoader] Failed to load "${path}":`, err);
				reject(err);
			}
		);
	});
}
