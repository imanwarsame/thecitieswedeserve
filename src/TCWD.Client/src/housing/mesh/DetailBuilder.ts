import * as THREE from 'three';
import type { GridPoint } from '../../grid/types';
import type { MaterialRegistry } from '../../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../../rendering/RadialFog';
import { HousingConfig } from '../HousingConfig';

/**
 * Add a window recess to a wall edge.
 * Single dark recessed quad at edge midpoint.
 */
export function addWindowToWall(
	v0: GridPoint, v1: GridPoint,
	layer: number,
	registry: MaterialRegistry,
	_overrideMat?: THREE.Material,
): THREE.Mesh {
	const h = HousingConfig.layerHeight;
	const baseY = layer * h;

	const windowWidth = 0.2;
	const windowHeight = h * 0.4;
	const windowY = baseY + h * 0.45;

	const mx = (v0.x + v1.x) / 2;
	const mz = (v0.y + v1.y) / 2;

	const dx = v1.x - v0.x;
	const dz = v1.y - v0.y;
	const len = Math.sqrt(dx * dx + dz * dz);
	const nx = -dz / len;
	const nz = dx / len;

	const recess = 0.03;
	const geo = new THREE.PlaneGeometry(windowWidth, windowHeight);
	const mat = registry.get('detail').clone();
	mat.side = THREE.DoubleSide;
	mat.color.multiplyScalar(0.35);
	patchMaterialUniforms(mat);

	const win = new THREE.Mesh(geo, mat);
	win.position.set(mx - nx * recess, windowY, mz - nz * recess);
	win.rotation.y = Math.atan2(nx, nz);
	win.name = 'window';
	return win;
}

/**
 * Build an arch opening in a wall panel.
 */
export function buildArchWall(
	v0: GridPoint, v1: GridPoint,
	layer: number,
	registry: MaterialRegistry,
	_overrideMat?: THREE.Material,
): THREE.Group {
	const group = new THREE.Group();
	const h = HousingConfig.layerHeight;
	const baseY = layer * h;
	const archHeight = h * 0.6;

	const dx = v1.x - v0.x;
	const dz = v1.y - v0.y;
	const edgeLen = Math.sqrt(dx * dx + dz * dz);
	const lintelHeight = h - archHeight;

	const pillarWidth = edgeLen * 0.2;
	const pillarDepth = 0.05;

	const leftGeo = new THREE.BoxGeometry(pillarWidth, archHeight, pillarDepth);
	const leftMat = registry.get('structure').clone();
	patchMaterialUniforms(leftMat);
	const leftPillar = new THREE.Mesh(leftGeo, leftMat);
	leftPillar.position.set(v0.x + dx * 0.1, baseY + archHeight / 2, v0.y + dz * 0.1);
	leftPillar.rotation.y = -Math.atan2(dz, dx);
	leftPillar.castShadow = true;

	const rightGeo = new THREE.BoxGeometry(pillarWidth, archHeight, pillarDepth);
	const rightMat = registry.get('structure').clone();
	patchMaterialUniforms(rightMat);
	const rightPillar = new THREE.Mesh(rightGeo, rightMat);
	rightPillar.position.set(v0.x + dx * 0.9, baseY + archHeight / 2, v0.y + dz * 0.9);
	rightPillar.rotation.y = -Math.atan2(dz, dx);
	rightPillar.castShadow = true;

	const lintelGeo = new THREE.BoxGeometry(edgeLen, lintelHeight, pillarDepth);
	const lintelMat = registry.get('structure').clone();
	patchMaterialUniforms(lintelMat);
	const lintel = new THREE.Mesh(lintelGeo, lintelMat);
	lintel.position.set((v0.x + v1.x) / 2, baseY + archHeight + lintelHeight / 2, (v0.y + v1.y) / 2);
	lintel.rotation.y = -Math.atan2(dz, dx);
	lintel.castShadow = true;

	group.add(leftPillar, rightPillar, lintel);
	group.name = 'arch';
	return group;
}
