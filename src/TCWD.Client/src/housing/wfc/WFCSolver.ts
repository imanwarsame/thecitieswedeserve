import type { VoxelGrid } from '../VoxelGrid';
import type { TileRegistry, TileDef } from '../tiles/TileRegistry';
import { socketsCompatible } from '../tiles/SocketTypes';

/** Resolved tile assignment for a voxel. */
export interface TileAssignment {
	cellIndex: number;
	layer: number;
	tile: TileDef;
}

/**
 * Driven WFC solver.
 *
 * The player provides hard constraints (corner solidity from Sprint 01),
 * and this solver fills in the visual tile selection within those constraints.
 * Propagation is vertical only (above/below) for MVP.
 */
export class WFCSolver {
	private registry: TileRegistry;
	private voxelGrid: VoxelGrid;

	constructor(registry: TileRegistry, voxelGrid: VoxelGrid) {
		this.registry = registry;
		this.voxelGrid = voxelGrid;
	}

	/**
	 * Solve for a set of affected cells.
	 * Called after placeBlock/removeBlock with the affected cell set.
	 * Returns a tile assignment per voxel.
	 */
	solve(affectedCells: Set<number>): TileAssignment[] {
		const assignments: TileAssignment[] = [];

		// Phase 1: Build candidate sets per voxel
		const candidates = new Map<string, TileDef[]>();

		for (const cellIndex of affectedCells) {
			const column = this.voxelGrid.getColumn(cellIndex);
			if (!column) continue;

			const cell = column.cell;
			const vertCount = cell.vertices.length;

			for (const [layer, voxel] of column.voxels) {
				const mask = voxel.cornerMask;
				const bottomCount = this.countBits(mask, 0, vertCount);
				const topCount = this.countBits(mask, vertCount, vertCount);
				const hasSupport = layer === 0 || column.voxels.has(layer - 1);

				const valid = this.registry.getCandidates(bottomCount, topCount, vertCount, hasSupport);
				const key = `${cellIndex}:${layer}`;
				candidates.set(key, valid.length > 0 ? valid : [this.registry.get('air')!]);
			}
		}

		// Phase 2: Propagate vertical socket constraints
		let changed = true;
		let iterations = 0;
		const MAX_ITERATIONS = 50;

		while (changed && iterations < MAX_ITERATIONS) {
			changed = false;
			iterations++;

			for (const [key, tiles] of candidates) {
				if (tiles.length <= 1) continue;

				const [ci, li] = key.split(':').map(Number);
				const column = this.voxelGrid.getColumn(ci);
				if (!column) continue;

				const belowKey = `${ci}:${li - 1}`;
				const aboveKey = `${ci}:${li + 1}`;
				const belowTiles = candidates.get(belowKey);
				const aboveTiles = candidates.get(aboveKey);

				const filtered = tiles.filter(tile => {
					if (belowTiles && belowTiles.length === 1) {
						if (!socketsCompatible(tile.bottomSocket, belowTiles[0].topSocket)) return false;
					}
					if (aboveTiles && aboveTiles.length === 1) {
						if (!socketsCompatible(tile.topSocket, aboveTiles[0].bottomSocket)) return false;
					}
					return true;
				});

				if (filtered.length < tiles.length) {
					candidates.set(key, filtered.length > 0 ? filtered : [tiles[0]]);
					changed = true;
				}
			}
		}

		// Phase 3: Collapse — pick one tile per voxel
		for (const [key, tiles] of candidates) {
			const [ci, li] = key.split(':').map(Number);
			const tile = this.weightedPick(tiles);
			assignments.push({ cellIndex: ci, layer: li, tile });
		}

		return assignments;
	}

	/** Count set bits in a range of a bitmask. */
	private countBits(mask: number, startBit: number, count: number): number {
		let total = 0;
		for (let i = 0; i < count; i++) {
			if (mask & (1 << (startBit + i))) total++;
		}
		return total;
	}

	/** Weighted random pick from tile candidates. */
	private weightedPick(tiles: TileDef[]): TileDef {
		if (tiles.length === 1) return tiles[0];
		const totalWeight = tiles.reduce((sum, t) => sum + t.weight, 0);
		let r = Math.random() * totalWeight;
		for (const tile of tiles) {
			r -= tile.weight;
			if (r <= 0) return tile;
		}
		return tiles[tiles.length - 1];
	}
}
