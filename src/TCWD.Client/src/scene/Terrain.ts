import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';

export class Terrain {
	init(graph: SceneGraph): void {
		const size = 40;
		const geometry = new THREE.PlaneGeometry(size, size);
		const material = new THREE.MeshStandardMaterial({
			color: 0x2d5a27,
			roughness: 0.9,
			metalness: 0.0,
		});

		const plane = new THREE.Mesh(geometry, material);
		plane.rotation.x = -Math.PI / 2;
		plane.receiveShadow = true;
		plane.name = 'groundPlane';

		graph.addToGroup('terrain', plane);

		this.addGrid(graph, size);

		console.log('[Terrain] Initialized.');
	}

	private addGrid(graph: SceneGraph, size: number): void {
		const grid = new THREE.GridHelper(size, size, 0x3a7a33, 0x3a7a33);
		grid.position.y = 0.01;
		(grid.material as THREE.Material).opacity = 0.3;
		(grid.material as THREE.Material).transparent = true;

		graph.addToGroup('terrain', grid);
	}
}
