export const HousingConfig = {
	/** Maximum number of stacked layers. */
	maxLayers: 30,

	/** World-space height of each layer. Matched to cell scale (~2-3 unit cells). */
	layerHeight: 1.0,

	/**
	 * Whether placing a block on an empty cell auto-fills ground (layer 0).
	 * If true, clicking at layer 3 fills 0, 1, 2, 3.
	 * If false, only fills the clicked layer (floating blocks allowed).
	 */
	autoFillBelow: true,

	/**
	 * Whether removing a block at layer N also removes everything above.
	 * If true, removing layer 2 of a 5-tall tower clears 2, 3, 4.
	 */
	collapseAbove: true,

	/**
	 * Corner sharing mode.
	 * 'shared': corners are shared between adjacent cells (Townscaper-style).
	 * 'independent': each cell has its own corners (simpler, less emergent).
	 */
	cornerMode: 'shared' as 'shared' | 'independent',
};
