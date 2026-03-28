import * as THREE from 'three';
import type { VoronoiCell } from './types';
import type { BuiltGrid } from './GridBuilder';

export class GridPlacement {
	private grid: BuiltGrid;
	private occupied = new Set<number>();

	constructor(grid: BuiltGrid) {
		this.grid = grid;
	}

	isCellFree(cellIndex: number): boolean {
		return !this.occupied.has(cellIndex);
	}

	occupyCell(cellIndex: number): void {
		this.occupied.add(cellIndex);
	}

	freeCell(cellIndex: number): void {
		this.occupied.delete(cellIndex);
	}

	getCell(cellIndex: number): VoronoiCell | null {
		return this.grid.cells[cellIndex] ?? null;
	}

	getCellWorldPosition(cellIndex: number, height = 0): THREE.Vector3 | null {
		const cell = this.grid.cells[cellIndex];
		if (!cell) return null;
		return new THREE.Vector3(cell.center.x, height, cell.center.y);
	}

	findFreeCellNear(worldX: number, worldZ: number): VoronoiCell | null {
		const nearby = this.grid.query.findNearestCells(worldX, worldZ, 10);
		for (const cell of nearby) {
			if (this.isCellFree(cell.index)) {
				return cell;
			}
		}
		return null;
	}

	getOccupiedCells(): number[] {
		return [...this.occupied];
	}

	clearAll(): void {
		this.occupied.clear();
	}
}
