import type { OrganicGrid } from '../grid/types';
import type { Voxel, VoxelColumn } from './types';
import { CornerStore } from './CornerStore';
import { HousingConfig } from './HousingConfig';
import { events } from '../core/Events';

/**
 * Manages the 3D voxel grid built on top of the 2D Voronoi grid.
 * Each Voronoi cell becomes a column of voxels.
 */
export class VoxelGrid {
	private columns = new Map<number, VoxelColumn>();
	private cornerStore: CornerStore;
	private grid: OrganicGrid;

	constructor(grid: OrganicGrid) {
		this.grid = grid;
		this.cornerStore = new CornerStore(grid);
	}

	/**
	 * Place a block at (cellIndex, layer).
	 * If autoFillBelow is true, fills all layers from 0 up to the target.
	 * Sets all corners of the cell solid at the placed layers.
	 * Returns the set of cell indices whose corner masks changed.
	 */
	placeBlock(cellIndex: number, layer: number, buildingType?: string): Set<number> {
		const affected = new Set<number>();
		const cell = this.grid.cells[cellIndex];
		if (!cell) return affected;

		const startLayer = HousingConfig.autoFillBelow ? 0 : layer;

		for (let l = startLayer; l <= layer; l++) {
			this.ensureVoxel(cellIndex, l, buildingType);

			// Set all corners of this cell solid at this layer's top
			for (let v = 0; v < cell.vertices.length; v++) {
				const hash = this.cornerStore.getVertexHash(cellIndex, v);
				const affectedCells = this.cornerStore.set(hash, l + 1, true);
				affectedCells.forEach(c => affected.add(c));
			}

			// Also set bottom corners solid (layer's bottom = layer value)
			for (let v = 0; v < cell.vertices.length; v++) {
				const hash = this.cornerStore.getVertexHash(cellIndex, v);
				const affectedCells = this.cornerStore.set(hash, l, true);
				affectedCells.forEach(c => affected.add(c));
			}
		}

		// Recompute corner masks for all affected cells at all layers
		for (const ci of affected) {
			this.recomputeCornerMasks(ci);
		}

		events.emit('voxel:placed', { cellIndex, layer });
		return affected;
	}

	/**
	 * Remove a block at (cellIndex, layer).
	 * If collapseAbove is true, removes all layers above too.
	 * Clears corners that are no longer supported by any adjacent solid voxel.
	 */
	removeBlock(cellIndex: number, layer: number): Set<number> {
		const affected = new Set<number>();
		const column = this.columns.get(cellIndex);
		if (!column) return affected;

		const topLayer = HousingConfig.collapseAbove ? column.topLayer : layer;

		for (let l = layer; l <= topLayer; l++) {
			column.voxels.delete(l);
		}

		// Recalculate topLayer
		column.topLayer = -1;
		for (const [l] of column.voxels) {
			if (l > column.topLayer) column.topLayer = l;
		}

		// Recompute which corners should still be solid
		this.recomputeCornersForColumn(cellIndex, affected);

		for (const ci of affected) {
			this.recomputeCornerMasks(ci);
		}

		events.emit('voxel:removed', { cellIndex, layer });
		return affected;
	}

	/** Get a voxel at a specific cell and layer. */
	getVoxel(cellIndex: number, layer: number): Voxel | undefined {
		return this.columns.get(cellIndex)?.voxels.get(layer);
	}

	/** Get an entire column. */
	getColumn(cellIndex: number): VoxelColumn | undefined {
		return this.columns.get(cellIndex);
	}

	/** Get the corner bitmask for a voxel. */
	getCornerMask(cellIndex: number, layer: number): number {
		return this.cornerStore.getCornerMask(cellIndex, layer);
	}

	/** Get the CornerStore for direct access (used by mesh generation). */
	getCornerStore(): CornerStore {
		return this.cornerStore;
	}

	/** Check if a cell has any blocks placed. */
	hasBlocks(cellIndex: number): boolean {
		const col = this.columns.get(cellIndex);
		return col !== undefined && col.voxels.size > 0;
	}

	/** Get the height (number of layers) at a cell. */
	getHeight(cellIndex: number): number {
		const col = this.columns.get(cellIndex);
		return col ? col.topLayer + 1 : 0;
	}

	/** Get all non-empty cell indices. */
	getOccupiedCells(): number[] {
		return Array.from(this.columns.entries())
			.filter(([_, col]) => col.voxels.size > 0)
			.map(([idx]) => idx);
	}

	/** Clear everything. */
	clear(): void {
		this.columns.clear();
		this.cornerStore.clear();
	}

	private ensureVoxel(cellIndex: number, layer: number, buildingType?: string): Voxel {
		if (!this.columns.has(cellIndex)) {
			this.columns.set(cellIndex, {
				cellIndex,
				cell: this.grid.cells[cellIndex],
				voxels: new Map(),
				topLayer: -1,
			});
		}

		const column = this.columns.get(cellIndex)!;
		if (!column.voxels.has(layer)) {
			column.voxels.set(layer, {
				cellIndex,
				layer,
				solid: true,
				cornerMask: 0,
				buildingType,
			});
		}

		if (layer > column.topLayer) column.topLayer = layer;
		return column.voxels.get(layer)!;
	}

	private recomputeCornerMasks(cellIndex: number): void {
		const column = this.columns.get(cellIndex);
		if (!column) return;
		for (const [_, voxel] of column.voxels) {
			voxel.cornerMask = this.cornerStore.getCornerMask(cellIndex, voxel.layer);
		}
	}

	private recomputeCornersForColumn(cellIndex: number, affected: Set<number>): void {
		const cell = this.grid.cells[cellIndex];
		// For each vertex of this cell, check if any adjacent cell still has
		// a voxel at each layer. If not, clear the corner.
		for (let v = 0; v < cell.vertices.length; v++) {
			const hash = this.cornerStore.getVertexHash(cellIndex, v);
			const adjacentCells = this.cornerStore.getAffectedCells(hash);

			for (let l = 0; l <= HousingConfig.maxLayers; l++) {
				const anyAdjSolid = adjacentCells.some(ci => {
					const col = this.columns.get(ci);
					return col?.voxels.has(l) || col?.voxels.has(l - 1);
				});

				if (!anyAdjSolid) {
					const affCells = this.cornerStore.set(hash, l, false);
					affCells.forEach(c => affected.add(c));
				}
			}
		}
	}
}
