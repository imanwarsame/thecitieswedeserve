import { GridConfig } from './GridConfig';

/**
 * Simple 2D value-noise terrain height.
 * Returns a gentle Y elevation for any (x, z) world coordinate.
 *
 * Uses two octaves of smoothed value noise for organic rolling hills,
 * with amplitude scaled to the hex radius so the terrain looks proportional.
 */

const SEED = GridConfig.seed;

/* ── seeded hash → [0,1) ────────────────────────────────────────── */

function hash2(ix: number, iy: number): number {
	let h = (ix * 374761393 + iy * 668265263 + SEED * 1274126177) | 0;
	h = Math.imul(h ^ (h >>> 13), 1103515245);
	h = h ^ (h >>> 16);
	return ((h & 0x7fffffff) / 0x7fffffff);
}

/* ── quintic interpolation for C2 continuity ────────────────────── */

function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/* ── single octave value noise ──────────────────────────────────── */

function noise2(x: number, y: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = fade(x - ix);
	const fy = fade(y - iy);

	const n00 = hash2(ix, iy);
	const n10 = hash2(ix + 1, iy);
	const n01 = hash2(ix, iy + 1);
	const n11 = hash2(ix + 1, iy + 1);

	return lerp(
		lerp(n00, n10, fx),
		lerp(n01, n11, fx),
		fy,
	);
}

/* ── public API ─────────────────────────────────────────────────── */

/** Max terrain height (world units). Gentle — about 3% of hex radius. */
const AMPLITUDE = GridConfig.townHexRadius * 0.03;

/** Wavelength of the primary noise octave. */
const SCALE1 = GridConfig.townHexRadius * 0.6;
const SCALE2 = GridConfig.townHexRadius * 0.25;

/** Cliff depth below y=0 for the boundary sides. */
export const CLIFF_DEPTH = AMPLITUDE * 4;

/**
 * Get terrain height at world position (x, z).
 * Returns a value in roughly [0, AMPLITUDE].
 */
export function terrainHeight(x: number, z: number): number {
	const n1 = noise2(x / SCALE1 + 100, z / SCALE1 + 100);       // broad hills
	const n2 = noise2(x / SCALE2 + 200, z / SCALE2 + 200) * 0.3; // fine detail
	return (n1 + n2) * AMPLITUDE;
}
