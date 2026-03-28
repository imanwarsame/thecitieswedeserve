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
	 * 40 → cells ~40m across (city-block scale).
	 * With hexRadius 1000: ~2100 cells.
	 */
	townTriEdge: 40,

	/**
	 * Global Laplacian relaxation iterations (smoothing).
	 */
	townRelaxIterations: 5,
};
