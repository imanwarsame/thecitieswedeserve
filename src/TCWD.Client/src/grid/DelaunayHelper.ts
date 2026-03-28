import { Delaunay } from 'd3-delaunay';
import type { GridPoint, Triangle } from './types';

export function computeDelaunay(points: GridPoint[]): Delaunay<GridPoint> {
	return Delaunay.from(points, p => p.x, p => p.y);
}

export function extractTriangles(delaunay: Delaunay<GridPoint>): Triangle[] {
	const tris: Triangle[] = [];
	for (let i = 0; i < delaunay.triangles.length; i += 3) {
		tris.push({
			a: delaunay.triangles[i],
			b: delaunay.triangles[i + 1],
			c: delaunay.triangles[i + 2],
		});
	}
	return tris;
}
