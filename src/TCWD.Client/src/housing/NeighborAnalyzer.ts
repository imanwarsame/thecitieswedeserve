import type { VoxelGrid } from './VoxelGrid';
import type { OrganicGrid } from '../grid/types';

export interface NeighborContext {
	cellIndex: number;
	layer: number;

	solidNeighbors: number[];
	emptyNeighbors: number[];

	hasAbove: boolean;
	hasBelow: boolean;

	sharedSolidVertices: number;
	totalVertices: number;

	contiguousSolidRun: number;

	isTop: boolean;
	isGround: boolean;

	columnHeight: number;
	maxNeighborHeight: number;
}

export class NeighborAnalyzer {
	private grid: OrganicGrid;
	private voxelGrid: VoxelGrid;

	constructor(grid: OrganicGrid, voxelGrid: VoxelGrid) {
		this.grid = grid;
		this.voxelGrid = voxelGrid;
	}

	analyze(cellIndex: number, layer: number): NeighborContext {
		const cell = this.grid.cells[cellIndex];
		const column = this.voxelGrid.getColumn(cellIndex);
		const columnHeight = column ? column.topLayer + 1 : 0;

		const solidNeighbors: number[] = [];
		const emptyNeighbors: number[] = [];
		let maxNeighborHeight = 0;

		for (const ni of cell.neighbors) {
			if (this.voxelGrid.getVoxel(ni, layer)) {
				solidNeighbors.push(ni);
			} else {
				emptyNeighbors.push(ni);
			}
			const nh = this.voxelGrid.getHeight(ni);
			if (nh > maxNeighborHeight) maxNeighborHeight = nh;
		}

		// Count shared solid vertices
		const cornerStore = this.voxelGrid.getCornerStore();
		let sharedSolidVertices = 0;
		for (let v = 0; v < cell.vertices.length; v++) {
			const hash = cornerStore.getVertexHash(cellIndex, v);
			if (cornerStore.get(hash, layer) || cornerStore.get(hash, layer + 1)) {
				sharedSolidVertices++;
			}
		}

		const contiguousSolidRun = this.longestSolidRun(cell.neighbors, layer);

		return {
			cellIndex,
			layer,
			solidNeighbors,
			emptyNeighbors,
			hasAbove: !!this.voxelGrid.getVoxel(cellIndex, layer + 1),
			hasBelow: layer === 0 || !!this.voxelGrid.getVoxel(cellIndex, layer - 1),
			sharedSolidVertices,
			totalVertices: cell.vertices.length,
			contiguousSolidRun,
			isTop: column ? layer === column.topLayer : true,
			isGround: layer === 0,
			columnHeight,
			maxNeighborHeight,
		};
	}

	private longestSolidRun(neighbors: number[], layer: number): number {
		if (neighbors.length === 0) return 0;
		let maxRun = 0;
		let currentRun = 0;
		// Wrap around: doubled array handles circular runs
		const doubled = [...neighbors, ...neighbors];
		for (const ni of doubled) {
			if (this.voxelGrid.getVoxel(ni, layer)) {
				currentRun++;
				if (currentRun > maxRun) maxRun = currentRun;
			} else {
				currentRun = 0;
			}
		}
		return Math.min(maxRun, neighbors.length);
	}
}
