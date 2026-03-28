import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { createGroundMaterial } from '../rendering/Materials';
import { GridRenderer } from '../grid/GridRenderer';
import { GridConfig } from '../grid/GridConfig';
import type { OrganicGrid } from '../grid/types';

/**
 * Create a flat-topped hexagonal ground plane geometry in the XZ plane.
 * Vertices at angles 0°, 60°, 120°, … from +X axis.
 */
function createHexGroundGeometry(R: number): THREE.BufferGeometry {
	const positions: number[] = [];
	const hexVerts: [number, number][] = [];

	for (let k = 0; k < 6; k++) {
		const angle = k * Math.PI / 3; // 0°, 60°, 120°, …
		hexVerts.push([R * Math.cos(angle), R * Math.sin(angle)]);
	}

	// Fan triangulation (CW from above for upward normals in Three.js)
	for (let i = 0; i < 6; i++) {
		const [x1, z1] = hexVerts[i];
		const [x2, z2] = hexVerts[(i + 1) % 6];
		positions.push(0, 0, 0);
		positions.push(x2, 0, z2);
		positions.push(x1, 0, z1);
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geo.computeVertexNormals();
	return geo;
}

export class Terrain {
	private gridRenderer = new GridRenderer();

	init(graph: SceneGraph, grid: OrganicGrid): void {
		const isTown = GridConfig.gridType === 'town';

		// Ground plane — hex for town mode, square for voronoi
		const geometry = isTown
			? createHexGroundGeometry(GridConfig.townHexRadius)
			: new THREE.PlaneGeometry(GridConfig.size, GridConfig.size);
		const material = createGroundMaterial();
		const plane = new THREE.Mesh(geometry, material);
		if (!isTown) plane.rotation.x = -Math.PI / 2;
		plane.receiveShadow = true;
		plane.name = 'groundPlane';
		graph.addToGroup('terrain', plane);

		// Organic grid edges
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
