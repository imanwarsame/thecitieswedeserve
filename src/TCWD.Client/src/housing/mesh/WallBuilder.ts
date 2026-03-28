import * as THREE from 'three';
import type { VoronoiCell } from '../../grid/types';
import type { MaterialRegistry } from '../../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../../rendering/RadialFog';
import { HousingConfig } from '../HousingConfig';

/**
 * Build wall geometry for a single voxel.
 * Only edges at the given indices get walls.
 */
export function buildWalls(
	cell: VoronoiCell,
	layer: number,
	openEdges: number[],
	registry: MaterialRegistry,
	materialKey = 'structure',
): THREE.Group {
	const group = new THREE.Group();
	group.name = `walls_${cell.index}_${layer}`;

	const h = HousingConfig.layerHeight;
	const baseY = layer * h;
	const verts = cell.vertices;

	for (const edgeIdx of openEdges) {
		const v0 = verts[edgeIdx];
		const v1 = verts[(edgeIdx + 1) % verts.length];

		const geometry = new THREE.BufferGeometry();

		const positions = new Float32Array([
			v0.x, baseY,     v0.y,
			v1.x, baseY,     v1.y,
			v1.x, baseY + h, v1.y,
			v0.x, baseY + h, v0.y,
		]);

		const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

		const dx = v1.x - v0.x;
		const dz = v1.y - v0.y;
		const len = Math.sqrt(dx * dx + dz * dz);
		const nx = -dz / len;
		const nz = dx / len;

		const normals = new Float32Array([
			nx, 0, nz,
			nx, 0, nz,
			nx, 0, nz,
			nx, 0, nz,
		]);

		const uvs = new Float32Array([
			0, 0,
			1, 0,
			1, 1,
			0, 1,
		]);

		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));
		geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

		const mat = registry.get(materialKey).clone();
		patchMaterialUniforms(mat);

		const mesh = new THREE.Mesh(geometry, mat);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.name = `wall_${edgeIdx}`;

		group.add(mesh);
	}

	return group;
}
