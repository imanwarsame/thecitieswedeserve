import { Delaunay } from 'd3-delaunay';
import { generateSeedPoints, addBoundaryPoints } from './PointGenerator';
import { extractVoronoiCells } from './VoronoiBuilder';
import { relax } from './Relaxation';
import { extractTriangles } from './DelaunayHelper';
import { GridConfig } from './GridConfig';
import type { OrganicGrid } from './types';

export function buildGrid(): OrganicGrid {
	// Step 1: Generate seed points
	const seedPoints = generateSeedPoints();
	const realCount = seedPoints.length;

	// Step 2: Add boundary padding
	let points = addBoundaryPoints(seedPoints, GridConfig.size, 5);

	// Step 3: Relax
	points = relax(points, realCount, GridConfig.relaxIterations);

	// Step 4: Final Delaunay triangulation
	const delaunay = Delaunay.from(points, p => p.x, p => p.y);

	// Step 5: Extract Voronoi cells
	const cells = extractVoronoiCells(delaunay, points, realCount);

	// Step 6: Extract Delaunay triangles (only those connecting real points)
	const allTriangles = extractTriangles(delaunay);
	const triangles = allTriangles.filter(
		t => t.a < realCount && t.b < realCount && t.c < realCount
	);

	// Step 7: Extract final real points
	const finalPoints = points.slice(0, realCount);

	const halfSize = GridConfig.size / 2;

	console.log(`[GridBuilder] Built organic grid:`);
	console.log(`  Points: ${finalPoints.length}`);
	console.log(`  Cells: ${cells.length}`);
	console.log(`  Triangles: ${triangles.length}`);
	console.log(`  Relaxation: ${GridConfig.relaxIterations} iters (weight ${GridConfig.relaxWeight})`);

	return {
		points: finalPoints,
		triangles,
		cells,
		bounds: {
			minX: -halfSize, maxX: halfSize,
			minY: -halfSize, maxY: halfSize,
		},
	};
}

/** Rebuild the grid with optional config overrides (for debug panel). */
export function regenerateGrid(overrides?: Partial<typeof GridConfig>): OrganicGrid {
	if (overrides) {
		Object.assign(GridConfig, overrides);
	}
	return buildGrid();
}
