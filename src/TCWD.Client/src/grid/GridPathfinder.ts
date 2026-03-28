import type { OrganicGrid } from './types';
import type { GridQuery } from './GridQuery';

export interface PathResult {
	path: number[];
	length: number;
	found: boolean;
}

export class GridPathfinder {
	private grid: OrganicGrid;

	constructor(grid: OrganicGrid) {
		this.grid = grid;
	}

	findPath(startCell: number, goalCell: number): PathResult {
		if (startCell === goalCell) {
			return { path: [startCell], length: 0, found: true };
		}

		const visited = new Set<number>();
		const parent = new Map<number, number>();
		const queue: number[] = [startCell];
		visited.add(startCell);

		while (queue.length > 0) {
			const current = queue.shift()!;

			if (current === goalCell) {
				const path: number[] = [];
				let node: number | undefined = goalCell;
				while (node !== undefined) {
					path.unshift(node);
					node = parent.get(node);
				}
				return { path, length: path.length - 1, found: true };
			}

			const cell = this.grid.cells[current];
			if (!cell) continue;

			for (const neighbor of cell.neighbors) {
				if (!visited.has(neighbor)) {
					visited.add(neighbor);
					parent.set(neighbor, current);
					queue.push(neighbor);
				}
			}
		}

		return { path: [], length: 0, found: false };
	}

	findPathBetweenPoints(
		query: GridQuery,
		startX: number, startZ: number,
		goalX: number, goalZ: number
	): PathResult {
		const start = query.findCell(startX, startZ);
		const goal = query.findCell(goalX, goalZ);
		if (start === -1 || goal === -1) {
			return { path: [], length: 0, found: false };
		}
		return this.findPath(start, goal);
	}
}
