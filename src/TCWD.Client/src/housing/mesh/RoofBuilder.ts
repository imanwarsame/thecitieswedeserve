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
	sharedDetailMat?: THREE.MeshStandardMaterial,
	sharedAccentMat?: THREE.MeshStandardMaterial,
): THREE.Group {
	const group = new THREE.Group();
	const topY = (layer + 1) * HousingConfig.layerHeight;

	const cap = buildFloor(cell, topY, registry, 'detail', true, sharedDetailMat);
	cap.name = 'roof_cap';
	group.add(cap);

	// Parapet: proportional to layer height
	const parapetH = 0.08;
	const parapetThick = 0.04;
	const verts = cell.vertices;

	const positions: number[] = [];
	const indices: number[] = [];
	let vertOffset = 0;

	for (let i = 0; i < verts.length; i++) {
		const v0 = verts[i];
		const v1 = verts[(i + 1) % verts.length];
		const dx = v1.x - v0.x;
		const dz = v1.y - v0.y;
		const len = Math.hypot(dx, dz);
		if (len < 0.001) continue;

		// Direction along the edge
		const dirX = dx / len;
		const dirZ = dz / len;
		// Perpendicular (thickness direction)
		const perpX = -dirZ * (parapetThick / 2);
		const perpZ = dirX * (parapetThick / 2);

		const mx = (v0.x + v1.x) / 2;
		const mz = (v0.y + v1.y) / 2;
		const halfLen = len / 2;

		// 8 vertices for a box
		const by = topY;
		const ty = topY + parapetH;
		const corners = [
			// bottom face
			mx - dirX * halfLen - perpX, by, mz - dirZ * halfLen - perpZ,
			mx + dirX * halfLen - perpX, by, mz + dirZ * halfLen - perpZ,
			mx + dirX * halfLen + perpX, by, mz + dirZ * halfLen + perpZ,
			mx - dirX * halfLen + perpX, by, mz - dirZ * halfLen + perpZ,
			// top face
			mx - dirX * halfLen - perpX, ty, mz - dirZ * halfLen - perpZ,
			mx + dirX * halfLen - perpX, ty, mz + dirZ * halfLen - perpZ,
			mx + dirX * halfLen + perpX, ty, mz + dirZ * halfLen + perpZ,
			mx - dirX * halfLen + perpX, ty, mz - dirZ * halfLen + perpZ,
		];
		positions.push(...corners);

		// 6 faces × 2 triangles = 12 triangles
		const o = vertOffset;
		indices.push(
			// bottom
			o, o+2, o+1, o, o+3, o+2,
			// top
			o+4, o+5, o+6, o+4, o+6, o+7,
			// front
			o, o+1, o+5, o, o+5, o+4,
			// back
			o+2, o+3, o+7, o+2, o+7, o+6,
			// left
			o, o+4, o+7, o, o+7, o+3,
			// right
			o+1, o+2, o+6, o+1, o+6, o+5,
		);
		vertOffset += 8;
	}

	if (positions.length > 0) {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geo.setIndex(indices);
		geo.computeVertexNormals();

		let mat: THREE.MeshStandardMaterial;
		if (sharedAccentMat) {
			mat = sharedAccentMat;
		} else {
			mat = registry.get('accent').clone();
			patchMaterialUniforms(mat);
		}

		const parapet = new THREE.Mesh(geo, mat);
		parapet.castShadow = true;
		group.add(parapet);
	}

	group.name = `roof_flat_${cell.index}_${layer}`;
	return group;
}

/**
 * Modern shed roof (mono-pitch).
 * Simple clean slope: one side at topY, opposite side raised by slopeHeight.
 * Uses ear-clipping on perimeter vertices only — no center vertex, no fan artifacts.
 */
export function buildPeakedRoof(
	cell: VoronoiCell,
	layer: number,
	registry: MaterialRegistry,
	sharedDetailMat?: THREE.MeshStandardMaterial,
	sharedAccentMat?: THREE.MeshStandardMaterial,
): THREE.Group {
	const group = new THREE.Group();
	const topY = (layer + 1) * HousingConfig.layerHeight;
	const slopeHeight = HousingConfig.layerHeight * 0.18;
	const verts = cell.vertices;
	const cx = cell.center.x;
	const cz = cell.center.y;

	// Slope direction: from cell center toward the longest edge's midpoint
	let longestLen = 0;
	let slopeDirX = 0;
	let slopeDirZ = 0;
	for (let i = 0; i < verts.length; i++) {
		const v0 = verts[i];
		const v1 = verts[(i + 1) % verts.length];
		const len = Math.hypot(v1.x - v0.x, v1.y - v0.y);
		if (len > longestLen) {
			longestLen = len;
			const mx = (v0.x + v1.x) / 2 - cx;
			const mz = (v0.y + v1.y) / 2 - cz;
			const d = Math.hypot(mx, mz) || 1;
			slopeDirX = mx / d;
			slopeDirZ = mz / d;
		}
	}

	// Project each vertex onto slope direction to get height
	const projections: number[] = [];
	let minProj = Infinity;
	let maxProj = -Infinity;
	for (const v of verts) {
		const p = (v.x - cx) * slopeDirX + (v.y - cz) * slopeDirZ;
		projections.push(p);
		if (p < minProj) minProj = p;
		if (p > maxProj) maxProj = p;
	}
	const range = maxProj - minProj || 1;

	// Build sloped roof as a simple polygon with per-vertex Y
	const positions: number[] = [];
	for (let i = 0; i < verts.length; i++) {
		const t = (projections[i] - minProj) / range; // 0=low, 1=high
		positions.push(verts[i].x, topY + t * slopeHeight, verts[i].y);
	}

	// Ear-clip triangulate the polygon (convex Voronoi cells → simple fan from vertex 0)
	const indices: number[] = [];
	for (let i = 1; i < verts.length - 1; i++) {
		indices.push(0, i, i + 1);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();

	let mat: THREE.MeshStandardMaterial;
	if (sharedDetailMat) {
		mat = sharedDetailMat;
	} else {
		mat = registry.get('detail').clone();
		mat.side = THREE.DoubleSide;
		patchMaterialUniforms(mat);
	}

	const mesh = new THREE.Mesh(geometry, mat);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = 'roof_slope';
	group.add(mesh);

	// Flat ceiling underneath
	const ceiling = buildFloor(cell, topY, registry, 'accent', false, sharedAccentMat);
	ceiling.name = 'ceiling';
	group.add(ceiling);

	group.name = `roof_modern_${cell.index}_${layer}`;
	return group;
}
