import { Delaunay } from 'd3-delaunay';
import type { GridPoint, VoronoiCell } from './types';
import { GridConfig } from './GridConfig';

export function extractVoronoiCells(
	delaunay: Delaunay<GridPoint>,
	points: GridPoint[],
	realPointCount: number
): VoronoiCell[] {
	const halfSize = GridConfig.size / 2;

	// Compute Voronoi with explicit bounds (clips infinite edge cells)
	const voronoi = delaunay.voronoi([
		-halfSize - 5,
		-halfSize - 5,
		halfSize + 5,
		halfSize + 5,
	]);

	const cells: VoronoiCell[] = [];

	// Only extract cells for real points (skip boundary padding)
	for (let i = 0; i < realPointCount; i++) {
		const polygon = voronoi.cellPolygon(i);
		if (!polygon) continue;

		// cellPolygon returns [[x,y], ...] with first === last (closed)
		// Remove the closing duplicate
		const vertices: GridPoint[] = polygon.slice(0, -1).map(([x, y]) => ({ x, y }));

		// Get neighbors via Delaunay adjacency
		const neighbors: number[] = [];
		for (const n of delaunay.neighbors(i)) {
			if (n < realPointCount) {
				neighbors.push(n);
			}
		}

		cells.push({
			index: i,
			center: points[i],
			vertices,
			neighbors,
		});
	}

	return cells;
}
