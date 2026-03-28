import * as THREE from 'three';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../rendering/RadialFog';
import type { VoronoiCell } from '../grid/types';
import type { ExtrudeParams } from './types';

export function extrudeFromCell(
	cell: VoronoiCell,
	height: number,
	registry: MaterialRegistry,
	options?: Partial<ExtrudeParams>,
): THREE.Group {
	const group = new THREE.Group();
	group.name = `building_cell_${cell.index}`;

	const wallKey = options?.wallMaterial ?? 'structure';
	const roofKey = options?.roofMaterial ?? 'detail';

	// Build shape from cell vertices (XZ plane mapped to Shape's XY)
	const shape = new THREE.Shape();
	const verts = cell.vertices;

	shape.moveTo(verts[0].x, verts[0].y);
	for (let i = 1; i < verts.length; i++) {
		shape.lineTo(verts[i].x, verts[i].y);
	}
	shape.closePath();

	const extrudeSettings: THREE.ExtrudeGeometryOptions = {
		depth: height,
		bevelEnabled: false,
	};

	const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

	// ExtrudeGeometry extrudes along Z — rotate to extrude along Y
	geometry.rotateX(-Math.PI / 2);

	// Material groups: index 0 = side faces (walls), index 1 = cap faces (roof/floor)
	const wallMat = registry.get(wallKey).clone();
	const roofMat = registry.get(roofKey).clone();
	patchMaterialUniforms(wallMat);
	patchMaterialUniforms(roofMat);

	const mesh = new THREE.Mesh(geometry, [wallMat, roofMat]);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = 'extrusion';

	group.add(mesh);

	return group;
}
