import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Palette } from '../rendering/Palette';
import { createGroundMaterial } from '../rendering/Materials';

export class Terrain {
	init(graph: SceneGraph): void {
		const size = 40;
		const geometry = new THREE.PlaneGeometry(size, size);
		const material = createGroundMaterial();

		const plane = new THREE.Mesh(geometry, material);
		plane.rotation.x = -Math.PI / 2;
		plane.receiveShadow = true;
		plane.name = 'groundPlane';

		graph.addToGroup('terrain', plane);

		this.addGrid(graph, size);

		console.log('[Terrain] Initialized.');
	}

	private addGrid(graph: SceneGraph, size: number): void {
		const grid = new THREE.GridHelper(size, size, Palette.detail, Palette.detail);
		grid.position.y = 0.01;
		(grid.material as THREE.Material).opacity = 0.15;
		(grid.material as THREE.Material).transparent = true;

		graph.addToGroup('terrain', grid);
	}
}
