export const GridConfig = {
	/** World-space size of the grid (square, centered at origin) */
	size: 40,

	/**
	 * Approximate number of cells per axis.
	 * Total seed points ~ density².
	 * 20 -> ~400 cells. 30 -> ~900 cells. 40 -> ~1600 cells.
	 */
	density: 20,

	/**
	 * How much each seed point is randomly offset from its grid position.
	 * 0.0 = perfect grid (no jitter). 1.0 = maximum jitter (point can move
	 * up to half the cell spacing in any direction).
	 * Recommended: 0.4-0.7 for organic feel without extreme distortion.
	 */
	jitter: 0.5,

	/**
	 * Number of Lloyd relaxation iterations.
	 * 0 = raw jittered grid. 3-5 = slightly smoothed. 8-12 = very organic.
	 * More iterations = more uniform cell sizes but diminishing returns past ~10.
	 */
	relaxIterations: 6,

	/** Relaxation weight per step. 1.0 = full Lloyd, 0.5 = half-step (more irregular). */
	relaxWeight: 0.6,

	/** Random seed for deterministic generation. Same seed = same grid. */
	seed: 42,
};
