import * as THREE from 'three';
import type { VoronoiCell } from '../../grid/types';
import type { MaterialRegistry } from '../../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../../rendering/RadialFog';
import { HousingConfig } from '../HousingConfig';

/**
 * Build wall geometry for a single voxel.
 * Only edges at the given indices get walls.
 * All quads are merged into a single geometry to minimise draw calls.
 */
export function buildWalls(
	cell: VoronoiCell,
	layer: number,
	openEdges: number[],
	registry: MaterialRegistry,
	materialKey = 'structure',
	sharedMaterial?: THREE.MeshStandardMaterial,
): THREE.Mesh {
	const h = HousingConfig.layerHeight;
	const baseY = layer * h;
	const verts = cell.vertices;
	const cx = cell.center.x;
	const cz = cell.center.y;

	// Pre-allocate arrays for merged geometry
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	let vertexOffset = 0;

	for (const edgeIdx of openEdges) {
		const v0 = verts[edgeIdx];
		const v1 = verts[(edgeIdx + 1) % verts.length];

		// Edge midpoint
		const mx = (v0.x + v1.x) / 2;
		const mz = (v0.y + v1.y) / 2;

		// Edge perpendicular candidates
		const dx = v1.x - v0.x;
		const dz = v1.y - v0.y;
		const len = Math.sqrt(dx * dx + dz * dz);
		let nx = -dz / len;
		let nz = dx / len;

		// Ensure normal points AWAY from cell center
		const toCenterX = cx - mx;
		const toCenterZ = cz - mz;
		if (nx * toCenterX + nz * toCenterZ > 0) {
			nx = -nx;
			nz = -nz;
		}

		// Quad vertices
		positions.push(
			v0.x, baseY,     v0.y,
			v1.x, baseY,     v1.y,
			v1.x, baseY + h, v1.y,
			v0.x, baseY + h, v0.y,
		);

		// Use dot product to pick correct winding
		const testNx = -(v1.y - v0.y);
		const testNz = (v1.x - v0.x);
		const dot = testNx * nx + testNz * nz;

		if (dot > 0) {
			indices.push(
				vertexOffset, vertexOffset + 1, vertexOffset + 2,
				vertexOffset, vertexOffset + 2, vertexOffset + 3,
			);
		} else {
			indices.push(
				vertexOffset, vertexOffset + 2, vertexOffset + 1,
				vertexOffset, vertexOffset + 3, vertexOffset + 2,
			);
		}

		normals.push(
			nx, 0, nz,
			nx, 0, nz,
			nx, 0, nz,
			nx, 0, nz,
		);

		uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

		vertexOffset += 4;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

	let mat: THREE.MeshStandardMaterial;
	if (sharedMaterial) {
		mat = sharedMaterial;
	} else {
		mat = registry.get(materialKey).clone();
		mat.side = THREE.DoubleSide;
		patchMaterialUniforms(mat);
	}

	const mesh = new THREE.Mesh(geometry, mat);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = `walls_${cell.index}_${layer}`;

	return mesh;
}
