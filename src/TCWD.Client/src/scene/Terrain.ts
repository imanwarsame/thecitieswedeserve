import { SceneGraph } from './SceneGraph';
import { GridRenderer } from '../grid/GridRenderer';
import type { OrganicGrid } from '../grid/types';

export class Terrain {
	private gridRenderer = new GridRenderer();

	init(graph: SceneGraph, grid: OrganicGrid): void {
		// Grid edge lines only — no solid ground surface
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
		this.gridRenderer.dispose();
	}
}
