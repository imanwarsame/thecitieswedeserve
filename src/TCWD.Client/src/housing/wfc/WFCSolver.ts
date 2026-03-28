import type { VoxelGrid } from '../VoxelGrid';
import type { OrganicGrid } from '../../grid/types';
import type { TileRegistry, TileDef } from '../tiles/TileRegistry';
import { socketsCompatible } from '../tiles/SocketTypes';
import type { MorphShape } from '../StackingRules';

export interface TileAssignment {
	cellIndex: number;
	layer: number;
	tile: TileDef;
	openEdges: number[];
	edgeBearings: number[];
}

export interface SolveResult {
	assignments: TileAssignment[];
	fallbackCount: number;
	contradictions: number;
	backtracks: number;
	iterations: number;
	converged: boolean;
}

function createRNG(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6D2B79F5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const MORPH_TILE_COMPAT: Partial<Record<MorphShape, string[]>> = {
	'foundation':     ['solid-cube', 'solid-ground'],
	'solid':          ['solid-cube', 'solid-ground'],
	'wall':           ['wall-full', 'solid-cube', 'solid-ground'],
	'wall-windowed':  ['wall-windowed', 'wall-full'],
	'corner':         ['wall-full', 'solid-cube'],
	'pillar':         ['solid-cube', 'solid-ground'],
	'roof-flat':      ['roof-flat'],
	'roof-peaked':    ['roof-peaked', 'roof-flat'],
	'arch':           ['arch'],
	'balcony':        ['balcony'],
	'stair':          ['step-up', 'wall-full'],
	'courtyard-wall': ['wall-windowed', 'wall-full'],
};

interface NbrCheck {
	nKey: string;
	getMySocket: (t: TileDef) => string;
	getNbrSocket: (t: TileDef) => string;
	horizontal?: boolean;
}

/**
 * Driven WFC solver:
 * - Seeded PRNG
 * - AC-3 worklist propagation (vertical + horizontal)
 * - Morph shape → tile constraints
 * - Shannon-entropy collapse ordering
 * - Lightweight backtracking on contradiction
 * - Edge bearing tracking for solar/wind analysis
 */
export class WFCSolver {
	private registry: TileRegistry;
	private voxelGrid: VoxelGrid;
	private grid: OrganicGrid;
	private rng: () => number;

	constructor(registry: TileRegistry, voxelGrid: VoxelGrid, grid: OrganicGrid, seed?: number) {
		this.registry = registry;
		this.voxelGrid = voxelGrid;
		this.grid = grid;
		this.rng = seed !== undefined ? createRNG(seed) : Math.random;
	}

	solve(affectedCells: Set<number>, morphHints?: Map<string, MorphShape>): SolveResult {
		let fallbackCount = 0;
		let contradictions = 0;
		let backtracks = 0;
		let iterations = 0;

		// ── Phase 1: candidate sets ──────────────────────
		const candidates = new Map<string, TileDef[]>();

		for (const cellIndex of affectedCells) {
			const column = this.voxelGrid.getColumn(cellIndex);
			if (!column) continue;
			const cell = column.cell;
			const vertCount = cell.vertices.length;

			for (const [layer, voxel] of column.voxels) {
				const mask = voxel.cornerMask;
				const bottomCount = this.countBits(mask, 0, vertCount);
				const topCount = this.countBits(mask, vertCount, vertCount);
				const hasSupport = layer === 0 || column.voxels.has(layer - 1);

				let valid = this.registry.getCandidates(bottomCount, topCount, vertCount, hasSupport);

				const key = `${cellIndex}:${layer}`;
				const morphShape = morphHints?.get(key);
				if (morphShape && MORPH_TILE_COMPAT[morphShape]) {
					const allowed = new Set(MORPH_TILE_COMPAT[morphShape]);
					const filtered = valid.filter(t => allowed.has(t.id));
					if (filtered.length > 0) valid = filtered;
				}

				if (valid.length === 0) { contradictions++; valid = [this.registry.get('air')!]; }
				candidates.set(key, valid);
			}
		}

		// ── Phase 2: AC-3 propagation ────────────────────
		iterations += this.propagateAll(candidates);

		// ── Phase 3: entropy-ordered collapse + backtracking ──
		const stack: { key: string; tile: TileDef; snap: Map<string, string[]> }[] = [];
		const MAX_BT = 50;

		while (true) {
			const target = this.pickMinEntropy(candidates);
			if (!target) break;

			const tiles = candidates.get(target)!;
			if (tiles.length === 0) {
				if (stack.length === 0 || backtracks >= MAX_BT) { contradictions++; fallbackCount++; break; }
				backtracks++;
				const prev = stack.pop()!;
				for (const [k, ids] of prev.snap) {
					const restored = ids.map(id => this.registry.get(id)).filter(Boolean) as TileDef[];
					candidates.set(k, restored.length > 0 ? restored : [this.registry.get('air')!]);
				}
				const rem = candidates.get(prev.key)?.filter(t => t.id !== prev.tile.id) ?? [];
				candidates.set(prev.key, rem.length > 0 ? rem : [this.registry.get('air')!]);
				continue;
			}

			const snap = this.snapshotNeighbors(target, candidates);
			const tile = this.weightedPick(tiles);
			stack.push({ key: target, tile, snap });
			candidates.set(target, [tile]);
			iterations += this.propagateFrom(target, candidates);
		}

		// ── Build assignments ────────────────────────────
		const assignments: TileAssignment[] = [];
		for (const [key, tiles] of candidates) {
			const [ci, li] = key.split(':').map(Number);
			const tile = tiles[0] ?? this.registry.get('air')!;
			const cell = this.grid.cells[ci];
			const openEdges = this.getOpenEdges(ci, li);
			const edgeBearings = cell ? openEdges.map(e => this.computeEdgeBearing(cell, e)) : [];
			assignments.push({ cellIndex: ci, layer: li, tile, openEdges, edgeBearings });
		}

		return {
			assignments, fallbackCount, contradictions, backtracks, iterations,
			converged: !this.pickMinEntropy(candidates),
		};
	}

	// ─── Propagation ─────────────────────────────────

	private propagateAll(candidates: Map<string, TileDef[]>): number {
		const wl = new Set(candidates.keys());
		let iters = 0;
		while (wl.size > 0 && iters < 200) {
			iters++;
			const k = wl.values().next().value!; wl.delete(k);
			if (this.prune(k, candidates)) {
				for (const nk of this.nbrKeys(k, candidates)) wl.add(nk);
			}
		}
		return iters;
	}

	private propagateFrom(key: string, candidates: Map<string, TileDef[]>): number {
		const wl = new Set(this.nbrKeys(key, candidates));
		let iters = 0;
		while (wl.size > 0 && iters < 100) {
			iters++;
			const k = wl.values().next().value!; wl.delete(k);
			if (this.prune(k, candidates)) {
				for (const nk of this.nbrKeys(k, candidates)) wl.add(nk);
			}
		}
		return iters;
	}

	private prune(key: string, candidates: Map<string, TileDef[]>): boolean {
		const tiles = candidates.get(key);
		if (!tiles || tiles.length <= 1) return false;

		const checks = this.nbrChecks(key, candidates);
		const filtered = tiles.filter(tile => {
			for (const { nKey, getMySocket, getNbrSocket, horizontal } of checks) {
				const nbrTiles = candidates.get(nKey)!;
				if (!nbrTiles.some(nt => socketsCompatible(getMySocket(tile), getNbrSocket(nt), horizontal)))
					return false;
			}
			return true;
		});

		if (filtered.length < tiles.length) {
			candidates.set(key, filtered.length > 0 ? filtered : [tiles[0]]);
			return true;
		}
		return false;
	}

	// ─── Entropy ─────────────────────────────────────

	private pickMinEntropy(candidates: Map<string, TileDef[]>): string | null {
		let best: string | null = null;
		let bestE = Infinity;
		for (const [key, tiles] of candidates) {
			if (tiles.length <= 1) continue;
			const e = this.entropy(tiles) - this.rng() * 0.001;
			if (e < bestE) { bestE = e; best = key; }
		}
		return best;
	}

	private entropy(tiles: TileDef[]): number {
		const tw = tiles.reduce((s, t) => s + t.weight, 0);
		if (tw === 0) return 0;
		let h = 0;
		for (const t of tiles) { const p = t.weight / tw; if (p > 0) h -= p * Math.log2(p); }
		return h;
	}

	// ─── Snapshot ────────────────────────────────────

	private snapshotNeighbors(key: string, candidates: Map<string, TileDef[]>): Map<string, string[]> {
		const snap = new Map<string, string[]>();
		for (const k of [key, ...this.nbrKeys(key, candidates)]) {
			const t = candidates.get(k);
			if (t) snap.set(k, t.map(x => x.id));
		}
		return snap;
	}

	// ─── Neighbor helpers ────────────────────────────

	private nbrKeys(key: string, candidates: Map<string, TileDef[]>): string[] {
		const [ci, li] = key.split(':').map(Number);
		const keys: string[] = [];
		const bk = `${ci}:${li - 1}`, ak = `${ci}:${li + 1}`;
		if (candidates.has(bk)) keys.push(bk);
		if (candidates.has(ak)) keys.push(ak);
		const cell = this.grid.cells[ci];
		if (cell) for (const ni of cell.neighbors) {
			const hk = `${ni}:${li}`;
			if (candidates.has(hk)) keys.push(hk);
		}
		return keys;
	}

	private nbrChecks(key: string, candidates: Map<string, TileDef[]>): NbrCheck[] {
		const [ci, li] = key.split(':').map(Number);
		const checks: NbrCheck[] = [];
		const bk = `${ci}:${li - 1}`, ak = `${ci}:${li + 1}`;
		if (candidates.has(bk))
			checks.push({ nKey: bk, getMySocket: t => t.bottomSocket, getNbrSocket: t => t.topSocket });
		if (candidates.has(ak))
			checks.push({ nKey: ak, getMySocket: t => t.topSocket, getNbrSocket: t => t.bottomSocket });
		const cell = this.grid.cells[ci];
		if (cell) for (const ni of cell.neighbors) {
			const hk = `${ni}:${li}`;
			if (candidates.has(hk))
				checks.push({ nKey: hk, getMySocket: t => t.sideSocket, getNbrSocket: t => t.sideSocket, horizontal: true });
		}
		return checks;
	}

	// ─── Edge geometry ───────────────────────────────

	private getOpenEdges(cellIndex: number, layer: number): number[] {
		const cell = this.grid.cells[cellIndex];
		if (!cell) return [];
		// Adaptive distance threshold based on cell edge length
		let totalLen = 0;
		for (let e = 0; e < cell.vertices.length; e++) {
			const v0 = cell.vertices[e], v1 = cell.vertices[(e + 1) % cell.vertices.length];
			totalLen += Math.hypot(v1.x - v0.x, v1.y - v0.y);
		}
		const thresh = (totalLen / cell.vertices.length) ** 2 * 4;

		const edges: number[] = [];
		for (let e = 0; e < cell.vertices.length; e++) {
			const v0 = cell.vertices[e], v1 = cell.vertices[(e + 1) % cell.vertices.length];
			const mx = (v0.x + v1.x) / 2, mz = (v0.y + v1.y) / 2;
			let empty = true;
			for (const ni of cell.neighbors) {
				const nc = this.grid.cells[ni];
				if ((nc.center.x - mx) ** 2 + (nc.center.y - mz) ** 2 < thresh && this.voxelGrid.getVoxel(ni, layer)) {
					empty = false; break;
				}
			}
			if (empty) edges.push(e);
		}
		return edges;
	}

	private computeEdgeBearing(cell: { vertices: { x: number; y: number }[] }, edgeIdx: number): number {
		const v0 = cell.vertices[edgeIdx], v1 = cell.vertices[(edgeIdx + 1) % cell.vertices.length];
		const rad = Math.atan2(-(v1.y - v0.y), v1.x - v0.x);
		return ((rad * 180 / Math.PI) + 360) % 360;
	}

	private countBits(mask: number, start: number, count: number): number {
		let t = 0;
		for (let i = 0; i < count; i++) if (mask & (1 << (start + i))) t++;
		return t;
	}

	private weightedPick(tiles: TileDef[]): TileDef {
		if (tiles.length === 1) return tiles[0];
		const tw = tiles.reduce((s, t) => s + t.weight, 0);
		let r = this.rng() * tw;
		for (const t of tiles) { r -= t.weight; if (r <= 0) return t; }
		return tiles[tiles.length - 1];
	}
}
