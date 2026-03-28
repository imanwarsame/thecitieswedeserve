import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { createGroundMaterial } from '../rendering/Materials';
import { GridRenderer } from '../grid/GridRenderer';
import { GridConfig } from '../grid/GridConfig';
import type { OrganicGrid } from '../grid/types';

export class Terrain {
	private gridRenderer = new GridRenderer();

	init(graph: SceneGraph, grid: OrganicGrid): void {
		const size = GridConfig.size;

		// Ground plane
		const geometry = new THREE.PlaneGeometry(size, size);
		const material = createGroundMaterial();
		const plane = new THREE.Mesh(geometry, material);
		plane.rotation.x = -Math.PI / 2;
		plane.receiveShadow = true;
		plane.name = 'groundPlane';
		graph.addToGroup('terrain', plane);

		// Organic grid edges (replaces GridHelper)
		const edgeLines = this.gridRenderer.buildEdgeLines(grid);
		graph.addToGroup('terrain', edgeLines);

		// Debug overlays (hidden by default)
		const delaunayDebug = this.gridRenderer.buildDelaunayDebug(grid);
		graph.addToGroup('debug', delaunayDebug);

		const centerPoints = this.gridRenderer.buildCenterPoints(grid);
		graph.addToGroup('debug', centerPoints);

		console.log('[Terrain] Initialized with organic grid.');
	}

	getGridRenderer(): GridRenderer {
		return this.gridRenderer;
	}

	dispose(): void {
		this.gridRenderer.dispose();
	}
}
