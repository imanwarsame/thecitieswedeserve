/**
 * Clean milky-white palette — nearly neutral with the slightest cool undertone.
 * Colour comes from housing tints and time-of-day lighting, not base surfaces.
 */
export const Palette = {
	// Surfaces — clean white and grays
	background: 0xf5f5f5,   // off-white
	ground: 0xeeeeee,       // light gray
	road: 0xa0a0a0,         // medium gray — visible against ground
	water: 0xc8dce8,        // pastel blue
	structure: 0xe0e0e0,    // mid-light gray
	detail: 0xd5d5d5,       // medium gray
	accent: 0xf0f0f0,       // near-white
	shadow: 0xb0b0b0,       // mid gray

	// Atmosphere
	fog: 0xf3f3f3,          // light gray haze
	ambient: 0xf5f5f5,      // bright gray
	sun: 0xffffff,          // pure white

	// Selection
	selectGlow: 0xffffff,
} as const;

/** Player-selectable housing tint colours. */
export const HOUSING_COLORS: readonly { name: string; hex: number; css: string }[] = [
	{ name: 'Silver',    hex: 0xd8d8d8, css: '#D8D8D8' },
	{ name: 'Chalk',     hex: 0xf0f0f0, css: '#F0F0F0' },
	{ name: 'Ash',       hex: 0xc0c0c0, css: '#C0C0C0' },
	{ name: 'Smoke',     hex: 0xa8a8a8, css: '#A8A8A8' },
	{ name: 'Slate',     hex: 0x909090, css: '#909090' },
] as const;
