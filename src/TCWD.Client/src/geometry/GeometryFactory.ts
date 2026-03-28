import * as THREE from 'three';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';
import { patchMaterialUniforms } from '../rendering/RadialFog';
import type { VoronoiCell } from '../grid/types';
import { PrimitiveBuilder } from './PrimitiveBuilder';
import { extrudeFromCell } from './ExtrudedCell';
import type { BoxParams, CylinderParams, WallParams, ExtrudeParams } from './types';

export class GeometryFactory {
	private registry: MaterialRegistry;
	private primitives: PrimitiveBuilder;

	constructor(registry: MaterialRegistry) {
		this.registry = registry;
		this.primitives = new PrimitiveBuilder(registry);
	}

	/** Create a box mesh with origin at bottom center. */
	box(params: BoxParams): THREE.Mesh {
		return this.primitives.box(params);
	}

	/** Create a cylinder with origin at bottom center. */
	cylinder(params: CylinderParams): THREE.Mesh {
		return this.primitives.cylinder(params);
	}

	/** Create a wall segment between two XZ points. */
	wall(params: WallParams): THREE.Mesh {
		return this.primitives.wall(params);
	}

	/** Extrude a Voronoi cell into a building shape. */
	buildingFromCell(
		cell: VoronoiCell,
		height: number,
		options?: Partial<ExtrudeParams>,
	): THREE.Group {
		return extrudeFromCell(cell, height, this.registry, options);
	}

	/** Create a flat surface from a cell polygon (road, plaza, etc.) */
	flatFromCell(cell: VoronoiCell, materialKey?: string): THREE.Mesh {
		const shape = new THREE.Shape();
		const v = cell.vertices;
		shape.moveTo(v[0].x, v[0].y);
		for (let i = 1; i < v.length; i++) shape.lineTo(v[i].x, v[i].y);
		shape.closePath();

		const geo = new THREE.ShapeGeometry(shape);
		geo.rotateX(-Math.PI / 2);
		geo.translate(0, 0.01, 0); // slight offset above ground to prevent z-fighting

		const mat = this.registry.get(materialKey ?? 'ground').clone();
		patchMaterialUniforms(mat);

		const mesh = new THREE.Mesh(geo, mat);
		mesh.receiveShadow = true;
		mesh.name = `flat_cell_${cell.index}`;
		return mesh;
	}
}
