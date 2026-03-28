import { Delaunay } from 'd3-delaunay';
import type { OrganicGrid, VoronoiCell, GridPoint } from './types';

export class GridQuery {
	private grid: OrganicGrid;
	private delaunay: Delaunay<GridPoint>;

	constructor(grid: OrganicGrid) {
		this.grid = grid;
		this.delaunay = Delaunay.from(grid.points, p => p.x, p => p.y);
	}

	findCell(worldX: number, worldZ: number): number {
		const { bounds } = this.grid;
		if (worldX < bounds.minX || worldX > bounds.maxX ||
			worldZ < bounds.minY || worldZ > bounds.maxY) {
			return -1;
		}
		return this.delaunay.find(worldX, worldZ);
	}

	getCell(index: number): VoronoiCell | null {
		return this.grid.cells[index] ?? null;
	}

	getCellAt(worldX: number, worldZ: number): VoronoiCell | null {
		const index = this.findCell(worldX, worldZ);
		if (index === -1) return null;
		return this.getCell(index);
	}

	getNeighbors(cellIndex: number): VoronoiCell[] {
		const cell = this.grid.cells[cellIndex];
		if (!cell) return [];
		return cell.neighbors
			.map(i => this.grid.cells[i])
			.filter(Boolean);
	}

	findNearestCells(worldX: number, worldZ: number, count: number): VoronoiCell[] {
		const startIndex = this.findCell(worldX, worldZ);
		if (startIndex === -1) return [];

		const visited = new Set<number>();
		const queue: number[] = [startIndex];
		const result: VoronoiCell[] = [];
		visited.add(startIndex);

		while (queue.length > 0 && result.length < count * 2) {
			const current = queue.shift()!;
			const cell = this.grid.cells[current];
			if (!cell) continue;

			result.push(cell);

			for (const neighbor of cell.neighbors) {
				if (!visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}

		result.sort((a, b) => {
			const distA = (a.center.x - worldX) ** 2 + (a.center.y - worldZ) ** 2;
			const distB = (b.center.x - worldX) ** 2 + (b.center.y - worldZ) ** 2;
			return distA - distB;
		});

		return result.slice(0, count);
	}

	getCellsInRadius(worldX: number, worldZ: number, radius: number): VoronoiCell[] {
		const radiusSq = radius * radius;
		const startIndex = this.findCell(worldX, worldZ);
		if (startIndex === -1) return [];

		const visited = new Set<number>();
		const queue: number[] = [startIndex];
		const result: VoronoiCell[] = [];
		visited.add(startIndex);

		while (queue.length > 0) {
			const current = queue.shift()!;
			const cell = this.grid.cells[current];
			if (!cell) continue;

			const distSq = (cell.center.x - worldX) ** 2 + (cell.center.y - worldZ) ** 2;
			if (distSq > radiusSq) continue;

			result.push(cell);

			for (const neighbor of cell.neighbors) {
				if (!visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}

		return result;
	}
}

/** Compute the area of a Voronoi cell (shoelace formula). */
export function cellArea(cell: VoronoiCell): number {
	const verts = cell.vertices;
	let area = 0;
	for (let i = 0; i < verts.length; i++) {
		const a = verts[i];
		const b = verts[(i + 1) % verts.length];
		area += a.x * b.y - b.x * a.y;
	}
	return Math.abs(area) * 0.5;
}

/** Regularity score (0 = irregular, 1 = circle). Regular hexagon ~ 0.907. */
export function cellRegularity(cell: VoronoiCell): number {
	const area = cellArea(cell);
	let perimeter = 0;
	const verts = cell.vertices;
	for (let i = 0; i < verts.length; i++) {
		const a = verts[i];
		const b = verts[(i + 1) % verts.length];
		perimeter += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return (4 * Math.PI * area) / (perimeter * perimeter);
}

/** Number of edges (sides) of a cell. */
export function cellEdgeCount(cell: VoronoiCell): number {
	return cell.vertices.length;
}
