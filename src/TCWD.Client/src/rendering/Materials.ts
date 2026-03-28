import * as THREE from 'three';

interface StandardMaterialOptions {
	color?: THREE.ColorRepresentation;
	roughness?: number;
	metalness?: number;
	map?: THREE.Texture;
}

interface BasicMaterialOptions {
	color?: THREE.ColorRepresentation;
	wireframe?: boolean;
	transparent?: boolean;
	opacity?: number;
}

export function createStandardMaterial(options: StandardMaterialOptions = {}): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		color: options.color ?? 0x888888,
		roughness: options.roughness ?? 0.8,
		metalness: options.metalness ?? 0.0,
		map: options.map,
	});
}

export function createBasicMaterial(options: BasicMaterialOptions = {}): THREE.MeshBasicMaterial {
	return new THREE.MeshBasicMaterial({
		color: options.color ?? 0x888888,
		wireframe: options.wireframe ?? false,
		transparent: options.transparent ?? false,
		opacity: options.opacity ?? 1.0,
	});
}

export const MaterialPresets = {
	default: () => createStandardMaterial(),
	terrain: () => createStandardMaterial({ color: 0x2d5a27, roughness: 0.9 }),
	debugWireframe: () => createBasicMaterial({ color: 0x00ff00, wireframe: true }),
};
