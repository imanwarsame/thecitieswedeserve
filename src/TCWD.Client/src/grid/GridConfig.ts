export const GridConfig = {
	/** World-space size of the grid (square side for voronoi, hex diameter for town). */
	size: 2000,

	/** Random seed for deterministic generation. Same seed = same grid. */
	seed: 42,

	/** Grid generation mode: 'voronoi' (Lloyd-relaxed) or 'town' (Townscaper hex pipeline). */
	gridType: 'town' as 'voronoi' | 'town',

	metersPerUnit: 1,

	/* ── Voronoi mode ──────────────────────────────────────────────── */
	density: 20,
	jitter: 0.5,
	relaxIterations: 6,
	relaxWeight: 0.6,

	/* ── Town mode (Townscaper pipeline) ───────────────────────────── */

	/**
	 * Circumradius of the flat-topped hex boundary (metres).
	 * 1000 → hex width 2000m, covers most of the Forma city (4352m × 1784m).
	 */
	townHexRadius: 1000,

	/**
	 * Triangle edge length for the base lattice (metres).
	 * 20 → cells ~20m across (building-footprint scale).
	 * Forma buildings: 8-25m footprint → buildings span 1-2 cells.
	 */
	townTriEdge: 20,

	/**
	 * Global Laplacian relaxation iterations (smoothing).
	 */
	townRelaxIterations: 5,
};
