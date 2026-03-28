import { GridConfig } from './GridConfig';
import type { GridPoint } from './types';

/**
 * Simple seeded PRNG (mulberry32).
 * Deterministic: same seed always produces same sequence.
 */
function createRNG(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6D2B79F5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function generateSeedPoints(): GridPoint[] {
	const { size, density, jitter, seed } = GridConfig;
	const rng = createRNG(seed);
	const points: GridPoint[] = [];

	const halfSize = size / 2;
	const cellSize = size / density;
	const maxOffset = cellSize * jitter * 0.5;

	for (let row = 0; row < density; row++) {
		for (let col = 0; col < density; col++) {
			// Base grid position (centered at origin)
			const baseX = -halfSize + (col + 0.5) * cellSize;
			const baseY = -halfSize + (row + 0.5) * cellSize;

			// Random jitter offset
			const offsetX = (rng() - 0.5) * 2 * maxOffset;
			const offsetY = (rng() - 0.5) * 2 * maxOffset;

			points.push({
				x: baseX + offsetX,
				y: baseY + offsetY,
			});
		}
	}

	return points;
}

export function addBoundaryPoints(points: GridPoint[], size: number, padding: number): GridPoint[] {
	const padded = [...points];
	const extent = size / 2 + padding;
	const step = padding;

	// Add points along each edge, outside the grid
	for (let t = -extent; t <= extent; t += step) {
		padded.push({ x: t, y: -extent });  // bottom
		padded.push({ x: t, y: extent });   // top
		padded.push({ x: -extent, y: t });  // left
		padded.push({ x: extent, y: t });   // right
	}

	return padded;
}
