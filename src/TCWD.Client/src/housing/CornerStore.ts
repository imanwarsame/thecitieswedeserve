import type { CornerKey } from './types';
import type { OrganicGrid, GridPoint } from '../grid/types';

/**
 * The hidden data layer. Maps every corner (vertex + height layer) to a
 * solidity boolean. This is what the player actually edits. The mesh is
 * a downstream view of this data.
 *
 * Corners are shared between adjacent cells — toggling one corner affects
 * every cell that shares that vertex. This creates emergent morphing behavior.
 */
export class CornerStore {
	private corners = new Map<CornerKey, boolean>();

	/** Reverse lookup: vertexHash -> Set<cellIndex>. */
	private vertexToCells = new Map<string, Set<number>>();

	private grid: OrganicGrid;

	constructor(grid: OrganicGrid) {
		this.grid = grid;
		this.buildVertexIndex();
	}

	/** Set a corner's solidity. Returns the set of affected cell indices. */
	set(vertexHash: string, layer: number, solid: boolean): number[] {
		const key = `${vertexHash}:${layer}`;
		this.corners.set(key, solid);
		return this.getAffectedCells(vertexHash);
	}

	/** Get a corner's solidity. */
	get(vertexHash: string, layer: number): boolean {
		return this.corners.get(`${vertexHash}:${layer}`) ?? false;
	}

	/** Get the vertex hash for a cell's vertex by index. */
	getVertexHash(cellIndex: number, vertexIdx: number): string {
		const cell = this.grid.cells[cellIndex];
		const v = cell.vertices[vertexIdx];
		return this.hashPosition(v);
	}

	/** Get all cell indices that share a vertex. */
	getAffectedCells(vertexHash: string): number[] {
		return Array.from(this.vertexToCells.get(vertexHash) ?? []);
	}

	/** Get the corner bitmask for a voxel (cellIndex + layer). */
	getCornerMask(cellIndex: number, layer: number): number {
		const cell = this.grid.cells[cellIndex];
		let mask = 0;
		const vertCount = cell.vertices.length;

		// Bottom corners (bit 0..N-1)
		for (let i = 0; i < vertCount; i++) {
			const hash = this.getVertexHash(cellIndex, i);
			if (this.get(hash, layer)) {
				mask |= (1 << i);
			}
		}

		// Top corners (bit N..2N-1)
		for (let i = 0; i < vertCount; i++) {
			const hash = this.getVertexHash(cellIndex, i);
			if (this.get(hash, layer + 1)) {
				mask |= (1 << (vertCount + i));
			}
		}

		return mask;
	}

	/** Clear all corner data. */
	clear(): void {
		this.corners.clear();
	}

	private buildVertexIndex(): void {
		for (const cell of this.grid.cells) {
			for (const vertex of cell.vertices) {
				const hash = this.hashPosition(vertex);
				if (!this.vertexToCells.has(hash)) {
					this.vertexToCells.set(hash, new Set());
				}
				this.vertexToCells.get(hash)!.add(cell.index);
			}
		}
	}

	/**
	 * Hash a 2D position to a string key. Positions within epsilon are
	 * considered the same vertex (handles floating-point from Voronoi).
	 */
	private hashPosition(p: GridPoint): string {
		const precision = 100; // 0.01 unit resolution
		const x = Math.round(p.x * precision);
		const y = Math.round(p.y * precision);
		return `${x},${y}`;
	}
}
