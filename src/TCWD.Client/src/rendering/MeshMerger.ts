import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merge all meshes inside a model that share the same material reference
 * into single merged meshes. Dramatically reduces draw calls.
 *
 * Before: 1650 road meshes × 1 material = 1650 draw calls
 * After:  1 merged mesh × 1 material = 1 draw call
 *
 * Preserves the model's name and transform, replaces children in-place.
 */
export function mergeByMaterial(model: THREE.Object3D): void {
	// Collect all meshes grouped by their material object reference
	const buckets = new Map<THREE.Material, THREE.Mesh[]>();

	model.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) return;
		const mat = child.material as THREE.Material;
		let bucket = buckets.get(mat);
		if (!bucket) {
			bucket = [];
			buckets.set(mat, bucket);
		}
		bucket.push(child);
	});

	if (buckets.size === 0) return;

	const totalBefore = Array.from(buckets.values()).reduce((s, b) => s + b.length, 0);

	// For each bucket, merge geometries and replace the individual meshes
	for (const [material, meshes] of buckets) {
		if (meshes.length <= 1) continue; // nothing to merge

		// Bake each mesh's world matrix into its geometry so positions are correct
		const geometries: THREE.BufferGeometry[] = [];
		for (const mesh of meshes) {
			mesh.updateWorldMatrix(true, false);

			const geo = mesh.geometry.clone();

			// Compute the relative transform from mesh to model root
			const relativeMatrix = new THREE.Matrix4();
			relativeMatrix.copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
			geo.applyMatrix4(relativeMatrix);

			geometries.push(geo);
		}

		const merged = mergeGeometries(geometries, false);
		if (!merged) {
			// mergeGeometries can return null if attributes don't match
			for (const g of geometries) g.dispose();
			continue;
		}

		// Dispose cloned temp geometries
		for (const g of geometries) g.dispose();

		const mergedMesh = new THREE.Mesh(merged, material);
		mergedMesh.castShadow = meshes[0].castShadow;
		mergedMesh.receiveShadow = meshes[0].receiveShadow;
		mergedMesh.name = `merged_${material.name || 'mat'}_${meshes.length}`;

		// Remove original meshes from their parents
		for (const mesh of meshes) {
			mesh.geometry.dispose();
			mesh.parent?.remove(mesh);
		}

		// Add merged mesh directly to the model root
		model.add(mergedMesh);
	}

	const totalAfter = model.children.filter(c => c instanceof THREE.Mesh).length;
	// Count nested meshes too
	let nestedCount = 0;
	model.traverse(c => { if (c instanceof THREE.Mesh) nestedCount++; });

	console.log(`[MeshMerger] ${model.name}: ${totalBefore} meshes → ${nestedCount} (${buckets.size} materials)`);
}
