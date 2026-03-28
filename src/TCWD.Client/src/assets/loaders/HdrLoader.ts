import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';

const rgbeLoader = new RGBELoader();
const ultraHdrLoader = new UltraHDRLoader();
ultraHdrLoader.setDataType(THREE.HalfFloatType);

/**
 * Load an equirectangular HDR environment texture.
 * Supports .hdr (RGBE) and .hdr.jpg (UltraHDR) formats.
 */
export function loadHdr(path: string): Promise<THREE.Texture> {
	const isUltraHdr = path.endsWith('.hdr.jpg') || path.endsWith('.hdr.jpeg');

	const loader = isUltraHdr ? ultraHdrLoader : rgbeLoader;

	return new Promise((resolve, reject) => {
		loader.load(
			path,
			(texture) => {
				texture.mapping = THREE.EquirectangularReflectionMapping;
				resolve(texture);
			},
			undefined,
			(err) => {
				console.warn(`[HdrLoader] Failed to load "${path}":`, err);
				reject(err);
			}
		);
	});
}
