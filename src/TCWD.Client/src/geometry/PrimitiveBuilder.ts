import * as THREE from 'three';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../rendering/RadialFog';
import type { BoxParams, CylinderParams, WallParams } from './types';

export class PrimitiveBuilder {
	private registry: MaterialRegistry;

	constructor(registry: MaterialRegistry) {
		this.registry = registry;
	}

	box(params: BoxParams): THREE.Mesh {
		const geo = new THREE.BoxGeometry(params.width, params.height, params.depth);
		const mat = this.registry.get(params.material ?? 'structure').clone();
		patchMaterialUniforms(mat);

		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.y = params.height / 2;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	}

	cylinder(params: CylinderParams): THREE.Mesh {
		const geo = new THREE.CylinderGeometry(
			params.radiusTop,
			params.radiusBottom,
			params.height,
			params.segments ?? 12,
		);
		const mat = this.registry.get(params.material ?? 'structure').clone();
		patchMaterialUniforms(mat);

		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.y = params.height / 2;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	}

	wall(params: WallParams): THREE.Mesh {
		const dx = params.to.x - params.from.x;
		const dy = params.to.y - params.from.y;
		const length = Math.sqrt(dx * dx + dy * dy);
		const angle = Math.atan2(dy, dx);

		const geo = new THREE.BoxGeometry(length, params.height, params.thickness);
		const mat = this.registry.get(params.material ?? 'structure').clone();
		patchMaterialUniforms(mat);

		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.set(
			(params.from.x + params.to.x) / 2,
			params.height / 2,
			(params.from.y + params.to.y) / 2,
		);
		mesh.rotation.y = -angle;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	}
}
