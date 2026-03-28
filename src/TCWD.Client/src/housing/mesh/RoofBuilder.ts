import * as THREE from 'three';
import type { VoronoiCell } from '../../grid/types';
import type { MaterialRegistry } from '../../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../../rendering/RadialFog';
import { HousingConfig } from '../HousingConfig';
import { buildFloor } from './FloorBuilder';

/** Flat roof: cap at top of voxel + low parapet walls. */
export function buildFlatRoof(
	cell: VoronoiCell,
	layer: number,
	registry: MaterialRegistry,
): THREE.Group {
	const group = new THREE.Group();
	const topY = (layer + 1) * HousingConfig.layerHeight;

	// Roof cap
	const cap = buildFloor(cell, topY, registry, 'detail', true);
	cap.name = 'roof_cap';
	group.add(cap);

	// Low parapet walls along edges
	const parapetHeight = 0.06;
	const parapetThickness = 0.03;
	const verts = cell.vertices;

	for (let i = 0; i < verts.length; i++) {
		const v0 = verts[i];
		const v1 = verts[(i + 1) % verts.length];
		const dx = v1.x - v0.x;
		const dz = v1.y - v0.y;
		const edgeLen = Math.sqrt(dx * dx + dz * dz);

		const geo = new THREE.BoxGeometry(edgeLen, parapetHeight, parapetThickness);
		const mat = registry.get('accent').clone();
		patchMaterialUniforms(mat);

		const parapet = new THREE.Mesh(geo, mat);
		parapet.position.set(
			(v0.x + v1.x) / 2,
			topY + parapetHeight / 2,
			(v0.y + v1.y) / 2,
		);
		parapet.rotation.y = -Math.atan2(dz, dx);
		parapet.castShadow = true;
		parapet.name = `parapet_${i}`;
		group.add(parapet);
	}

	group.name = `roof_flat_${cell.index}_${layer}`;
	return group;
}

/** Peaked roof: raised centroid forming a pyramidal shape. */
export function buildPeakedRoof(
	cell: VoronoiCell,
	layer: number,
	registry: MaterialRegistry,
): THREE.Group {
	const group = new THREE.Group();
	const topY = (layer + 1) * HousingConfig.layerHeight;
	const peakHeight = HousingConfig.layerHeight * 0.5;
	const cx = cell.center.x;
	const cz = cell.center.y;
	const verts = cell.vertices;

	// Triangular faces from each edge to the peak
	const positions: number[] = [];
	const indices: number[] = [];

	// Peak vertex at index 0
	positions.push(cx, topY + peakHeight, cz);

	// Perimeter vertices
	for (const v of verts) {
		positions.push(v.x, topY, v.y);
	}

	// Triangles: peak -> edge pairs
	for (let i = 0; i < verts.length; i++) {
		const next = (i + 1) % verts.length;
		indices.push(0, i + 1, next + 1);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();

	const mat = registry.get('detail').clone();
	patchMaterialUniforms(mat);

	const mesh = new THREE.Mesh(geometry, mat);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = 'roof_peak';
	group.add(mesh);

	// Ceiling cap (bottom of roof)
	const ceiling = buildFloor(cell, topY, registry, 'accent', false);
	ceiling.name = 'ceiling';
	group.add(ceiling);

	group.name = `roof_peaked_${cell.index}_${layer}`;
	return group;
}
