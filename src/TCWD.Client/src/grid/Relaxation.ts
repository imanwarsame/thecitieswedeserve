import { Delaunay } from 'd3-delaunay';
import type { GridPoint } from './types';
import { GridConfig } from './GridConfig';

/**
 * Compute the centroid (geometric center) of a polygon.
 * Uses the standard signed-area centroid formula.
 */
function polygonCentroid(vertices: [number, number][]): GridPoint {
	let cx = 0, cy = 0, area = 0;
	const n = vertices.length;

	for (let i = 0; i < n; i++) {
		const [x0, y0] = vertices[i];
		const [x1, y1] = vertices[(i + 1) % n];
		const cross = x0 * y1 - x1 * y0;
		area += cross;
		cx += (x0 + x1) * cross;
		cy += (y0 + y1) * cross;
	}

	area *= 0.5;
	if (Math.abs(area) < 1e-10) {
		// Degenerate polygon — fall back to simple average
		const avgX = vertices.reduce((s, v) => s + v[0], 0) / n;
		const avgY = vertices.reduce((s, v) => s + v[1], 0) / n;
		return { x: avgX, y: avgY };
	}

	cx /= (6 * area);
	cy /= (6 * area);
	return { x: cx, y: cy };
}

/**
 * Run one iteration of Lloyd relaxation.
 * Moves each real point toward the centroid of its Voronoi cell.
 * Boundary points are unchanged.
 */
export function relaxOnce(
	points: GridPoint[],
	realPointCount: number
): GridPoint[] {
	const halfSize = GridConfig.size / 2;
	const weight = GridConfig.relaxWeight;
	const bounds: [number, number, number, number] = [
		-halfSize - 5, -halfSize - 5,
		halfSize + 5, halfSize + 5,
	];

	const delaunay = Delaunay.from(points, p => p.x, p => p.y);
	const voronoi = delaunay.voronoi(bounds);

	const relaxed = [...points];

	for (let i = 0; i < realPointCount; i++) {
		const polygon = voronoi.cellPolygon(i);
		if (!polygon) continue;

		const centroid = polygonCentroid(polygon.slice(0, -1) as [number, number][]);

		// Weighted move toward centroid (1.0 = full Lloyd, <1.0 = partial)
		const nx = points[i].x + (centroid.x - points[i].x) * weight;
		const ny = points[i].y + (centroid.y - points[i].y) * weight;

		// Clamp to grid bounds so points don't drift outside
		relaxed[i] = {
			x: Math.max(-halfSize, Math.min(halfSize, nx)),
			y: Math.max(-halfSize, Math.min(halfSize, ny)),
		};
	}

	return relaxed;
}

/**
 * Run multiple iterations of Lloyd relaxation.
 */
export function relax(
	points: GridPoint[],
	realPointCount: number,
	iterations: number
): GridPoint[] {
	let current = points;
	for (let i = 0; i < iterations; i++) {
		current = relaxOnce(current, realPointCount);
	}
	return current;
}
