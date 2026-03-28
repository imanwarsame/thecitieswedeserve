import type { VoronoiCell } from '../grid/types';

/** Identifies a specific corner in the 3D voxel grid. */
export interface CornerId {
	/** Index of the Voronoi cell vertex (position in cell.vertices[]). */
	vertexIndex: number;
	/** Height layer (0 = ground, 1 = first story, etc). */
	layer: number;
}

/** Serializable string key for a corner: "vIdx:layer" */
export type CornerKey = string;

/** A single voxel — one cell at one height layer. */
export interface Voxel {
	/** Which Voronoi cell this voxel belongs to. */
	cellIndex: number;
	/** Height layer. */
	layer: number;
	/** Whether this voxel is "filled" (has a block placed in it). */
	solid: boolean;
	/** Cached bitmask of corner solidity for this voxel. Updated when corners change. */
	cornerMask: number;
	/** BuildingType occupying this voxel (if any). */
	buildingType?: string;
}

/** The corner solidity state for a single voxel (bottom + top corners). */
export interface VoxelCorners {
	/** Bottom corners (at this voxel's layer). One per cell vertex. */
	bottom: boolean[];
	/** Top corners (at this voxel's layer + 1). One per cell vertex. */
	top: boolean[];
}

/** A column — all voxels stacked at one cell index. */
export interface VoxelColumn {
	cellIndex: number;
	cell: VoronoiCell;
	/** Voxels indexed by layer. Sparse — only filled layers exist. */
	voxels: Map<number, Voxel>;
	/** Highest occupied layer (-1 if empty). */
	topLayer: number;
}

/** Events emitted by the voxel grid. */
export type VoxelEvent =
	| { type: 'voxel:placed'; cellIndex: number; layer: number }
	| { type: 'voxel:removed'; cellIndex: number; layer: number }
	| { type: 'corner:changed'; cornerKey: CornerKey; solid: boolean }
	| { type: 'column:changed'; cellIndex: number };
