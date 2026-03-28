import * as THREE from 'three';
import { Palette } from './Palette';
import { patchMaterialUniforms } from './RadialFog';

function withFog<T extends THREE.Material>(material: T): T {
	patchMaterialUniforms(material);
	return material;
}

export function createGroundMaterial(): THREE.MeshLambertMaterial {
	return withFog(new THREE.MeshLambertMaterial({
		color: Palette.ground,
	}));
}

export function createStructureMaterial(): THREE.MeshStandardMaterial {
	return withFog(new THREE.MeshStandardMaterial({
		color: Palette.structure,
		roughness: 0.9,
		metalness: 0.0,
	}));
}

export function createDetailMaterial(): THREE.MeshStandardMaterial {
	return withFog(new THREE.MeshStandardMaterial({
		color: Palette.detail,
		roughness: 0.85,
		metalness: 0.0,
	}));
}

export function createAccentMaterial(): THREE.MeshLambertMaterial {
	return withFog(new THREE.MeshLambertMaterial({
		color: Palette.accent,
	}));
}

export const MaterialPresets = {
	ground: createGroundMaterial,
	structure: createStructureMaterial,
	detail: createDetailMaterial,
	accent: createAccentMaterial,
	debugWireframe: () => new THREE.MeshBasicMaterial({
		color: 0x888888,
		wireframe: true,
	}),
};

/** Replace all materials on a model with monochrome structure material */
export function applyMonochromeMaterials(object: THREE.Object3D): void {
	object.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.material = createStructureMaterial();
		}
	});
}
