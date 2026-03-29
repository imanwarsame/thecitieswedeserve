import * as THREE from 'three';
import { TREE_POSITIONS } from './TreePositions';
import { patchMaterialUniforms } from '../rendering/RadialFog';

// Tree dimensions in mm (matching Forma export coordinate space).
// Original GLB trees: ~6700 x 9600 x 6400 mm.
const TRUNK_HEIGHT = 2500;
const TRUNK_RADIUS_TOP = 120;
const TRUNK_RADIUS_BOT = 200;
const CANOPY_HEIGHT = 7000;
const CANOPY_RADIUS = 3000;

// Low-poly segment counts
const TRUNK_SEGMENTS = 5;
const CANOPY_SEGMENTS = 6;

/**
 * Renders all vegetation as two THREE.InstancedMesh objects (trunks + canopies).
 *
 * Positions are in raw mm coordinates from vegetation-points.xyz.
 * The parent group is expected to handle centering and scaling to fit the grid
 * (same transform as the Forma GLB models).
 *
 * 920 trees × 418 verts = 384 K verts + 920 draw calls in the original GLB.
 * Instanced: ~50 verts total, 2 draw calls.
 */
export class VegetationInstancer {
	private group: THREE.Group;
	private trunkMesh: THREE.InstancedMesh | null = null;
	private canopyMesh: THREE.InstancedMesh | null = null;

	constructor() {
		this.group = new THREE.Group();
		this.group.name = 'vegetation';
	}

	init(parent: THREE.Object3D): void {
		const count = TREE_POSITIONS.length / 2;

		// Materials — pastel green foliage with light bark
		const trunkMat = new THREE.MeshStandardMaterial({
			color: 0xc8beb4,
			roughness: 0.9,
			metalness: 0.0,
		});
		patchMaterialUniforms(trunkMat);

		const canopyMat = new THREE.MeshStandardMaterial({
			color: 0xb8d8b8,
			roughness: 0.95,
			metalness: 0.0,
		});
		patchMaterialUniforms(canopyMat);

		// Geometry (dimensions in mm to match Forma coordinate space)
		const trunkGeo = new THREE.CylinderGeometry(
			TRUNK_RADIUS_TOP, TRUNK_RADIUS_BOT, TRUNK_HEIGHT, TRUNK_SEGMENTS,
		);
		const canopyGeo = new THREE.ConeGeometry(
			CANOPY_RADIUS, CANOPY_HEIGHT, CANOPY_SEGMENTS,
		);

		// Instanced meshes
		this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
		this.canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, count);

		this.trunkMesh.castShadow = true;
		this.trunkMesh.receiveShadow = true;
		this.canopyMesh.castShadow = true;
		this.canopyMesh.receiveShadow = true;

		// Deterministic PRNG for size variation
		let seed = 12345;
		const rand = () => {
			seed = (seed * 16807 + 0) % 2147483647;
			return seed / 2147483647;
		};

		const mat = new THREE.Matrix4();
		const scale = new THREE.Vector3();
		const pos = new THREE.Vector3();
		const quat = new THREE.Quaternion();

		for (let i = 0; i < count; i++) {
			const x = TREE_POSITIONS[i * 2];
			const z = TREE_POSITIONS[i * 2 + 1];

			// Slight random scale variation: 0.7–1.3
			const s = 0.7 + rand() * 0.6;
			const trunkH = TRUNK_HEIGHT * s;
			const canopyH = CANOPY_HEIGHT * s;

			// Trunk (y=0 is ground plane)
			scale.set(s, s, s);
			pos.set(x, trunkH / 2, z);
			mat.compose(pos, quat, scale);
			this.trunkMesh.setMatrixAt(i, mat);

			// Canopy
			pos.set(x, trunkH + canopyH / 2, z);
			mat.compose(pos, quat, scale);
			this.canopyMesh.setMatrixAt(i, mat);
		}

		this.trunkMesh.instanceMatrix.needsUpdate = true;
		this.canopyMesh.instanceMatrix.needsUpdate = true;

		this.group.add(this.trunkMesh, this.canopyMesh);
		parent.add(this.group);

		console.log(`[Vegetation] Instanced ${count} trees (2 draw calls).`);
	}

	getGroup(): THREE.Group {
		return this.group;
	}

	dispose(): void {
		if (this.trunkMesh) {
			this.trunkMesh.geometry.dispose();
			(this.trunkMesh.material as THREE.Material).dispose();
		}
		if (this.canopyMesh) {
			this.canopyMesh.geometry.dispose();
			(this.canopyMesh.material as THREE.Material).dispose();
		}
		this.trunkMesh = null;
		this.canopyMesh = null;
	}
}
