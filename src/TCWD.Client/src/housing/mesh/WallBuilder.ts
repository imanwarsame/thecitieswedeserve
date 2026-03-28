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
	const cx = cell.center.x;
	const cz = cell.center.y;

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
			// Normal points toward center — flip it
			nx = -nx;
			nz = -nz;
		}

		// Build quad with correct winding for outward normal
		const positions = new Float32Array([
			v0.x, baseY,     v0.y,
			v1.x, baseY,     v1.y,
			v1.x, baseY + h, v1.y,
			v0.x, baseY + h, v0.y,
		]);

		// Use dot product to pick correct winding
		const testNx = -(v1.y - v0.y);
		const testNz = (v1.x - v0.x);
		const dot = testNx * nx + testNz * nz;

		let indices: Uint16Array;
		if (dot > 0) {
			indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
		} else {
			indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
		}

		const normals = new Float32Array([
			nx, 0, nz,
			nx, 0, nz,
			nx, 0, nz,
			nx, 0, nz,
		]);

		const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));
		geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

		const mat = registry.get(materialKey).clone();
		mat.side = THREE.DoubleSide;
		patchMaterialUniforms(mat);

		const mesh = new THREE.Mesh(geometry, mat);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.name = `wall_${edgeIdx}`;

		group.add(mesh);
	}

	return group;
}
