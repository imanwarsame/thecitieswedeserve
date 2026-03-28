import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export function loadTexture(path: string): Promise<THREE.Texture> {
	return new Promise((resolve, reject) => {
		loader.load(
			path,
			(texture) => {
				texture.colorSpace = THREE.SRGBColorSpace;
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
				texture.minFilter = THREE.LinearMipmapLinearFilter;
				texture.magFilter = THREE.LinearFilter;
				resolve(texture);
			},
			undefined,
			(err) => {
				console.warn(`[TextureLoader] Failed to load "${path}":`, err);
				reject(err);
			}
		);
	});
}
