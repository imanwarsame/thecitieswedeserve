import type { NeighborContext } from './NeighborAnalyzer';
import type { OrganicGrid } from '../grid/types';

export type MorphShape =
	| 'solid'
	| 'wall'
	| 'wall-windowed'
	| 'corner'
	| 'pillar'
	| 'arch'
	| 'roof-flat'
	| 'roof-peaked'
	| 'balcony'
	| 'stair'
	| 'foundation'
	| 'courtyard-wall'
	| 'air';

export interface MorphResult {
	shape: MorphShape;
	/** Edge indices (0..N-1 into cell.vertices) that face empty space. */
	openEdges: number[];
	/** Edge indices that face solid neighbors. */
	walledEdges: number[];
	heightDelta: number;
	enclosed: boolean;
}

/**
 * Map neighbor cell indices to edge indices.
 * For each neighbor, find which edge of the cell faces that neighbor
 * by checking which edge midpoint is closest to the neighbor's center.
 */
function mapNeighborsToEdges(
	cellIndex: number,
	neighborIndices: number[],
	grid: OrganicGrid,
): number[] {
	const cell = grid.cells[cellIndex];
	const verts = cell.vertices;
	const edges: number[] = [];

	for (const ni of neighborIndices) {
		const neighbor = grid.cells[ni];
		if (!neighbor) continue;

		const ncx = neighbor.center.x;
		const ncz = neighbor.center.y;

		// Find the edge whose midpoint is closest to the neighbor center
		let bestEdge = 0;
		let bestDist = Infinity;
		for (let e = 0; e < verts.length; e++) {
			const v0 = verts[e];
			const v1 = verts[(e + 1) % verts.length];
			const mx = (v0.x + v1.x) / 2;
			const mz = (v0.y + v1.y) / 2;
			const dist = (mx - ncx) ** 2 + (mz - ncz) ** 2;
			if (dist < bestDist) {
				bestDist = dist;
				bestEdge = e;
			}
		}
		edges.push(bestEdge);
	}

	return edges;
}

/**
 * Get all edge indices NOT in the given set.
 */
function complementEdges(usedEdges: number[], totalEdges: number): number[] {
	const used = new Set(usedEdges);
	const result: number[] = [];
	for (let i = 0; i < totalEdges; i++) {
		if (!used.has(i)) result.push(i);
	}
	return result;
}

/**
 * Evaluate what shape a voxel should take based on its spatial context.
 *
 * Rule priority:
 * 1. Foundation — single ground block, no above, no neighbors
 * 2. Pillar — no solid neighbors at this layer
 * 3. Roof — top of column with something below
 * 4. Solid — fully enclosed
 * 5. Courtyard wall — enclosed, top layer
 * 6. Stair — large height delta
 * 7. Corner — two non-adjacent solid neighbors
 * 8. Wall-windowed — has above + below, some open
 * 9. Wall — default
 */
export function evaluateMorphShape(ctx: NeighborContext, grid?: OrganicGrid): MorphResult {
	const allNeighborCount = ctx.solidNeighbors.length + ctx.emptyNeighbors.length;
	const heightDelta = ctx.maxNeighborHeight - ctx.columnHeight;
	const enclosed = ctx.emptyNeighbors.length === 0 && ctx.solidNeighbors.length > 0;

	// Map neighbor cell indices → edge indices
	let walledEdges: number[] = [];
	let openEdges: number[] = [];
	const cell = grid?.cells[ctx.cellIndex];

	if (grid && cell) {
		walledEdges = mapNeighborsToEdges(ctx.cellIndex, ctx.solidNeighbors, grid);
		openEdges = complementEdges(walledEdges, cell.vertices.length);
	}

	const result = (shape: MorphShape): MorphResult =>
		({ shape, openEdges, walledEdges, heightDelta, enclosed });

	// Foundation: single ground block, no neighbors, no above
	if (ctx.isGround && !ctx.hasAbove && ctx.solidNeighbors.length === 0) {
		return result('foundation');
	}

	// Pillar: no solid neighbors at this layer (but might have above/below)
	if (ctx.solidNeighbors.length === 0 && ctx.hasAbove && !ctx.isTop) {
		return result('pillar');
	}

	// Roof: top of column, nothing above, has below
	if (ctx.isTop && !ctx.hasAbove && ctx.hasBelow) {
		return result(
			ctx.solidNeighbors.length >= allNeighborCount * 0.5
				? 'roof-flat'
				: 'roof-peaked'
		);
	}

	// Solid: fully enclosed with blocks above and below
	if (enclosed && ctx.hasAbove && ctx.hasBelow) {
		return result('solid');
	}

	// Courtyard wall: enclosed but is the top layer
	if (enclosed && ctx.isTop) {
		return result('courtyard-wall');
	}

	// Stair: significant height delta at top
	if (Math.abs(heightDelta) >= 2 && ctx.isTop) {
		return result('stair');
	}

	// Corner: exactly 2 solid neighbors that are NOT adjacent
	if (ctx.solidNeighbors.length === 2 && ctx.contiguousSolidRun === 1) {
		return result('corner');
	}

	// Wall with windows: interior floors (has above and below, some faces open)
	if (ctx.hasAbove && ctx.hasBelow && ctx.emptyNeighbors.length > 0) {
		return result('wall-windowed');
	}

	// Default wall
	return result('wall');
}
