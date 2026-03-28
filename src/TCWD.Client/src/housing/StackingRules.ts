import type { NeighborContext } from './NeighborAnalyzer';

/**
 * Morphing shape — the high-level visual identity assigned to a voxel.
 * Maps to specific tiles and mesh generation strategies in Sprint 04.
 */
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
	/** Indices of neighbors that are empty at this layer (open faces). */
	openFaces: number[];
	/** Indices of neighbors that are solid at this layer (walled faces). */
	walledFaces: number[];
	/** Height differential with tallest neighbor. */
	heightDelta: number;
	/** Whether all neighbors are solid (enclosed). */
	enclosed: boolean;
}

/**
 * Evaluate what shape a voxel should take based on its spatial context.
 *
 * Rule priority (highest first):
 * 1. Roof — top layer, nothing above
 * 2. Foundation — ground layer, isolated
 * 3. Pillar — no solid neighbors
 * 4. Solid — fully enclosed
 * 5. Courtyard wall — enclosed, top layer
 * 6. Stair — large height delta at top
 * 7. Corner — two non-adjacent solid neighbors
 * 8. Wall-windowed — interior floor (above + below, some faces open)
 * 9. Wall — default
 */
export function evaluateMorphShape(ctx: NeighborContext): MorphResult {
	const allNeighborCount = ctx.solidNeighbors.length + ctx.emptyNeighbors.length;
	const heightDelta = ctx.maxNeighborHeight - ctx.columnHeight;
	const enclosed = ctx.emptyNeighbors.length === 0 && ctx.solidNeighbors.length > 0;

	const openFaces = ctx.emptyNeighbors;
	const walledFaces = ctx.solidNeighbors;

	const result = (shape: MorphShape): MorphResult =>
		({ shape, openFaces, walledFaces, heightDelta, enclosed });

	// Roof: top of column, nothing above
	if (ctx.isTop && !ctx.hasAbove && ctx.hasBelow) {
		return result(
			ctx.solidNeighbors.length >= allNeighborCount * 0.5
				? 'roof-flat'
				: 'roof-peaked'
		);
	}

	// Foundation: ground layer, isolated single block
	if (ctx.isGround && !ctx.hasAbove && ctx.solidNeighbors.length === 0) {
		return result('foundation');
	}

	// Pillar: no solid neighbors at this layer
	if (ctx.solidNeighbors.length === 0) {
		return result('pillar');
	}

	// Solid: fully enclosed with blocks above and below
	if (enclosed && ctx.hasAbove && ctx.hasBelow) {
		return result('solid');
	}

	// Courtyard wall: enclosed but is the top layer
	if (enclosed && ctx.isTop) {
		return result('courtyard-wall');
	}

	// Stair: significant height delta with a neighbor at top
	if (Math.abs(heightDelta) >= 2 && ctx.isTop) {
		return result('stair');
	}

	// Corner: exactly 2 solid neighbors that are NOT adjacent to each other
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
