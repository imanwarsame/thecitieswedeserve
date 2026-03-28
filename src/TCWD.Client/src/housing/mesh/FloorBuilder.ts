import * as THREE from 'three';
import type { VoronoiCell } from '../../grid/types';
import type { MaterialRegistry } from '../../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../../rendering/RadialFog';

/**
 * Build a floor or ceiling cap from a Voronoi cell polygon.
 * Uses fan triangulation from centroid.
 */
export function buildFloor(
	cell: VoronoiCell,
	y: number,
	registry: MaterialRegistry,
	materialKey = 'detail',
	faceUp = true,
): THREE.Mesh {
	const verts = cell.vertices;
	const cx = cell.center.x;
	const cz = cell.center.y;

	const positions: number[] = [];
	const indices: number[] = [];
	const normals: number[] = [];

	// Center vertex (index 0)
	positions.push(cx, y, cz);
	normals.push(0, faceUp ? 1 : -1, 0);

	// Perimeter vertices
	for (const v of verts) {
		positions.push(v.x, y, v.y);
		normals.push(0, faceUp ? 1 : -1, 0);
	}

	// Fan triangles
	for (let i = 0; i < verts.length; i++) {
		const next = (i + 1) % verts.length;
		if (faceUp) {
			indices.push(0, i + 1, next + 1);
		} else {
			indices.push(0, next + 1, i + 1);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

	const mat = registry.get(materialKey).clone();
	patchMaterialUniforms(mat);

	const mesh = new THREE.Mesh(geometry, mat);
	mesh.receiveShadow = true;
	mesh.name = `floor_${cell.index}`;
	return mesh;
}
