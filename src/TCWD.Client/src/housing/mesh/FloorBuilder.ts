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

	// Center vertex (index 0)
	positions.push(cx, y, cz);

	// Perimeter vertices
	for (const v of verts) {
		positions.push(v.x, y, v.y);
	}

	// Fan triangles — use both winding orders tested against face direction
	for (let i = 0; i < verts.length; i++) {
		const next = (i + 1) % verts.length;
		if (faceUp) {
			// CCW when viewed from above (+Y)
			indices.push(0, next + 1, i + 1);
		} else {
			// CW when viewed from above = CCW from below
			indices.push(0, i + 1, next + 1);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();

	const mat = registry.get(materialKey).clone();
	mat.side = THREE.DoubleSide;
	patchMaterialUniforms(mat);

	const mesh = new THREE.Mesh(geometry, mat);
	mesh.receiveShadow = true;
	mesh.castShadow = true;
	mesh.name = `floor_${cell.index}`;
	return mesh;
}
