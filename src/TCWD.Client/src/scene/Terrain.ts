import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { GridRenderer } from '../grid/GridRenderer';
import { patchMaterialUniforms } from '../rendering/RadialFog';
import type { OrganicGrid } from '../grid/types';

export class Terrain {
	private gridRenderer = new GridRenderer();
	private groundPlane: THREE.Mesh | null = null;

	init(graph: SceneGraph, grid: OrganicGrid): void {
		// Large shadow-receiving ground plane (sits just below grid lines)
		const groundGeo = new THREE.PlaneGeometry(50000, 50000);
		groundGeo.rotateX(-Math.PI / 2);
		const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
		patchMaterialUniforms(groundMat);
		this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
		this.groundPlane.position.y = -0.01; // just below grid lines to avoid z-fight
		this.groundPlane.receiveShadow = true;
		this.groundPlane.name = 'shadowGround';
		graph.addToGroup('terrain', this.groundPlane);

		// Grid edge lines
		const edgeLines = this.gridRenderer.buildEdgeLines(grid);
		graph.addToGroup('terrain', edgeLines);

		// Debug overlays
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
		if (this.groundPlane) {
			this.groundPlane.geometry.dispose();
			(this.groundPlane.material as THREE.Material).dispose();
		}
		this.gridRenderer.dispose();
	}
}
