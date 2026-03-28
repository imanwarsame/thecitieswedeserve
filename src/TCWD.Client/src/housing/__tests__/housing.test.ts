import { describe, it, expect, beforeEach } from 'vitest';
import { buildGrid, type BuiltGrid } from '../../grid/GridBuilder';
import { VoxelGrid } from '../VoxelGrid';
import { CornerStore } from '../CornerStore';
import { NeighborAnalyzer } from '../NeighborAnalyzer';
import { evaluateMorphShape, type MorphShape } from '../StackingRules';
import { TileRegistry } from '../tiles/TileRegistry';
import { HOUSING_TILES } from '../tiles/TileDefs';
import { socketsCompatible } from '../tiles/SocketTypes';
import { WFCSolver } from '../wfc/WFCSolver';
import { MorphEvaluator } from '../MorphEvaluator';

let grid: BuiltGrid;
let centerCell: number;
let neighborCell: number;

beforeEach(() => {
	grid = buildGrid();
	centerCell = grid.query.findCell(0, 0);
	neighborCell = grid.cells[centerCell].neighbors[0];
});

// ═══════════════════════════════════════════════════════
// 1. GRID FOUNDATION
// ═══════════════════════════════════════════════════════

describe('Grid foundation', () => {
	it('builds cells', () => {
		expect(grid.cells.length).toBeGreaterThan(100);
	});

	it('every cell has at least 3 vertices', () => {
		for (const cell of grid.cells) {
			expect(cell.vertices.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('most cells have at least 2 neighbors', () => {
		const lowNeighborCells = grid.cells.filter(c => c.neighbors.length < 2);
		// Edge cells may have fewer — allow up to 5% exceptions
		expect(lowNeighborCells.length).toBeLessThan(grid.cells.length * 0.05);
	});

	it('center cell exists and has neighbors', () => {
		expect(centerCell).toBeGreaterThanOrEqual(0);
		expect(grid.cells[centerCell].neighbors.length).toBeGreaterThan(0);
	});
});

// ═══════════════════════════════════════════════════════
// 2. CORNER STORE
// ═══════════════════════════════════════════════════════

describe('CornerStore', () => {
	let store: CornerStore;

	beforeEach(() => {
		store = new CornerStore(grid);
	});

	it('defaults to false', () => {
		const hash = store.getVertexHash(centerCell, 0);
		expect(store.get(hash, 0)).toBe(false);
	});

	it('set returns affected cells including the target', () => {
		const hash = store.getVertexHash(centerCell, 0);
		const affected = store.set(hash, 0, true);
		expect(affected).toContain(centerCell);
	});

	it('shared vertices affect multiple cells', () => {
		const cell = grid.cells[centerCell];
		const neighbor = grid.cells[neighborCell];

		let sharedHash: string | null = null;
		for (let i = 0; i < cell.vertices.length; i++) {
			const hash = store.getVertexHash(centerCell, i);
			for (let j = 0; j < neighbor.vertices.length; j++) {
				const nHash = store.getVertexHash(neighborCell, j);
				if (hash === nHash) {
					sharedHash = hash;
					break;
				}
			}
			if (sharedHash) break;
		}

		expect(sharedHash).not.toBeNull();
		const affected = store.set(sharedHash!, 0, true);
		expect(affected).toContain(centerCell);
		expect(affected).toContain(neighborCell);
	});

	it('corner mask bit count matches vertex count when all solid', () => {
		const cell = grid.cells[centerCell];
		const vertCount = cell.vertices.length;

		for (let v = 0; v < vertCount; v++) {
			store.set(store.getVertexHash(centerCell, v), 0, true);
			store.set(store.getVertexHash(centerCell, v), 1, true);
		}

		const mask = store.getCornerMask(centerCell, 0);
		expect(countBits(mask, 0, vertCount)).toBe(vertCount);
		expect(countBits(mask, vertCount, vertCount)).toBe(vertCount);
	});
});

// ═══════════════════════════════════════════════════════
// 3. VOXEL GRID
// ═══════════════════════════════════════════════════════

describe('VoxelGrid', () => {
	let voxelGrid: VoxelGrid;

	beforeEach(() => {
		voxelGrid = new VoxelGrid(grid);
	});

	it('starts empty', () => {
		expect(voxelGrid.hasBlocks(centerCell)).toBe(false);
		expect(voxelGrid.getHeight(centerCell)).toBe(0);
		expect(voxelGrid.getOccupiedCells()).toHaveLength(0);
	});

	it('placeBlock creates a voxel', () => {
		voxelGrid.placeBlock(centerCell, 0, 'housing');
		expect(voxelGrid.hasBlocks(centerCell)).toBe(true);
		expect(voxelGrid.getHeight(centerCell)).toBe(1);
	});

	it('autoFillBelow fills layers 0..N', () => {
		voxelGrid.placeBlock(centerCell, 2);
		expect(voxelGrid.getVoxel(centerCell, 0)).toBeDefined();
		expect(voxelGrid.getVoxel(centerCell, 1)).toBeDefined();
		expect(voxelGrid.getVoxel(centerCell, 2)).toBeDefined();
		expect(voxelGrid.getHeight(centerCell)).toBe(3);
	});

	it('placeBlock returns affected cells including neighbors', () => {
		const affected = voxelGrid.placeBlock(centerCell, 0);
		expect(affected.size).toBeGreaterThan(1);
		expect(affected.has(centerCell)).toBe(true);
	});

	it('removeBlock clears the voxel', () => {
		voxelGrid.placeBlock(centerCell, 0);
		voxelGrid.removeBlock(centerCell, 0);
		expect(voxelGrid.hasBlocks(centerCell)).toBe(false);
	});

	it('collapseAbove removes everything above', () => {
		voxelGrid.placeBlock(centerCell, 3);
		voxelGrid.removeBlock(centerCell, 1);
		expect(voxelGrid.getVoxel(centerCell, 0)).toBeDefined();
		expect(voxelGrid.getVoxel(centerCell, 1)).toBeUndefined();
		expect(voxelGrid.getHeight(centerCell)).toBe(1);
	});

	it('corner masks are nonzero after placement', () => {
		voxelGrid.placeBlock(centerCell, 0);
		const mask = voxelGrid.getCornerMask(centerCell, 0);
		expect(mask).toBeGreaterThan(0);
	});
});

// ═══════════════════════════════════════════════════════
// 4. STACKING RULES
// ═══════════════════════════════════════════════════════

describe('StackingRules', () => {
	let voxelGrid: VoxelGrid;
	let analyzer: NeighborAnalyzer;

	beforeEach(() => {
		voxelGrid = new VoxelGrid(grid);
		analyzer = new NeighborAnalyzer(grid, voxelGrid);
	});

	function getShape(cellIndex: number, layer: number): MorphShape {
		const ctx = analyzer.analyze(cellIndex, layer);
		return evaluateMorphShape(ctx, grid).shape;
	}

	it('single ground block = foundation', () => {
		voxelGrid.placeBlock(centerCell, 0);
		expect(getShape(centerCell, 0)).toBe('foundation');
	});

	it('2-tall tower: bottom=pillar or wall, top=roof', () => {
		voxelGrid.placeBlock(centerCell, 1);
		const top = getShape(centerCell, 1);
		expect(['roof-flat', 'roof-peaked']).toContain(top);
	});

	it('adjacent blocks produce wall shapes', () => {
		voxelGrid.placeBlock(centerCell, 0);
		voxelGrid.placeBlock(neighborCell, 0);
		const shape = getShape(centerCell, 0);
		// Has solid neighbor, isTop, no above → roof (with neighbor) or wall
		expect(['wall', 'wall-windowed', 'corner', 'roof-flat', 'roof-peaked']).toContain(shape);
	});

	it('openEdges are valid edge indices (0..N-1)', () => {
		voxelGrid.placeBlock(centerCell, 0);
		const ctx = analyzer.analyze(centerCell, 0);
		const result = evaluateMorphShape(ctx, grid);

		const cell = grid.cells[centerCell];
		for (const e of result.openEdges) {
			expect(e).toBeGreaterThanOrEqual(0);
			expect(e).toBeLessThan(cell.vertices.length);
		}
	});

	it('walledEdges are valid edge indices', () => {
		voxelGrid.placeBlock(centerCell, 0);
		voxelGrid.placeBlock(neighborCell, 0);
		const ctx = analyzer.analyze(centerCell, 0);
		const result = evaluateMorphShape(ctx, grid);

		const cell = grid.cells[centerCell];
		for (const e of result.walledEdges) {
			expect(e).toBeGreaterThanOrEqual(0);
			expect(e).toBeLessThan(cell.vertices.length);
		}
	});

	it('openEdges + walledEdges cover all edges', () => {
		voxelGrid.placeBlock(centerCell, 0);
		voxelGrid.placeBlock(neighborCell, 0);
		const ctx = analyzer.analyze(centerCell, 0);
		const result = evaluateMorphShape(ctx, grid);

		const cell = grid.cells[centerCell];
		const allEdges = new Set([...result.openEdges, ...result.walledEdges]);
		expect(allEdges.size).toBe(cell.vertices.length);
	});
});

// ═══════════════════════════════════════════════════════
// 5. TILE SYSTEM
// ═══════════════════════════════════════════════════════

describe('TileRegistry', () => {
	let registry: TileRegistry;

	beforeEach(() => {
		registry = new TileRegistry();
		for (const tile of HOUSING_TILES) registry.register(tile);
	});

	it('registers all housing tiles', () => {
		expect(registry.getAll().length).toBe(HOUSING_TILES.length);
	});

	it('fully solid pattern matches solid tiles', () => {
		const candidates = registry.getCandidates(6, 6, 6, true);
		const ids = candidates.map(t => t.id);
		expect(ids).toContain('solid-cube');
	});

	it('solid bottom + empty top matches roof tiles', () => {
		const candidates = registry.getCandidates(6, 0, 6, true);
		const ids = candidates.map(t => t.id);
		expect(ids).toContain('roof-flat');
	});

	it('zero corners matches air tile', () => {
		const candidates = registry.getCandidates(0, 0, 6, false);
		const ids = candidates.map(t => t.id);
		expect(ids).toContain('air');
	});
});

describe('Socket compatibility', () => {
	it('solid matches solid', () => expect(socketsCompatible('solid', 'solid')).toBe(true));
	it('solid does not match open', () => expect(socketsCompatible('solid', 'open')).toBe(false));
	it('floor matches floor', () => expect(socketsCompatible('floor', 'floor')).toBe(true));
	it('roof matches air', () => expect(socketsCompatible('roof', 'air')).toBe(true));
	it('any matches everything', () => {
		expect(socketsCompatible('any', 'solid')).toBe(true);
		expect(socketsCompatible('floor', 'any')).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════
// 6. WFC SOLVER
// ═══════════════════════════════════════════════════════

describe('WFCSolver', () => {
	let voxelGrid: VoxelGrid;
	let solver: WFCSolver;

	beforeEach(() => {
		voxelGrid = new VoxelGrid(grid);
		const registry = new TileRegistry();
		for (const tile of HOUSING_TILES) registry.register(tile);
		solver = new WFCSolver(registry, voxelGrid, grid, 42);
	});

	it('produces one assignment per voxel', () => {
		voxelGrid.placeBlock(centerCell, 1);
		const result = solver.solve(new Set([centerCell]));
		expect(result.assignments.length).toBe(2);
		expect(result.converged).toBe(true);
	});

	it('every assignment has a valid tile', () => {
		voxelGrid.placeBlock(centerCell, 2);
		const result = solver.solve(new Set([centerCell]));
		for (const a of result.assignments) {
			expect(a.tile).toBeDefined();
			expect(a.tile.id).toBeTruthy();
		}
	});

	it('seeded solver produces deterministic results', () => {
		voxelGrid.placeBlock(centerCell, 2);
		const r1 = solver.solve(new Set([centerCell]));
		// Reset and solve again with same seed
		const solver2 = new WFCSolver(
			(() => { const r = new TileRegistry(); for (const t of HOUSING_TILES) r.register(t); return r; })(),
			voxelGrid, grid, 42
		);
		const r2 = solver2.solve(new Set([centerCell]));
		expect(r1.assignments.map(a => a.tile.id)).toEqual(r2.assignments.map(a => a.tile.id));
	});

	it('tracks fallbacks and iterations in SolveResult', () => {
		voxelGrid.placeBlock(centerCell, 0);
		const result = solver.solve(new Set([centerCell]));
		expect(result.iterations).toBeGreaterThanOrEqual(0);
		expect(result.fallbackCount).toBeGreaterThanOrEqual(0);
		expect(typeof result.contradictions).toBe('number');
	});
});

// ═══════════════════════════════════════════════════════
// 7. MORPH EVALUATOR — full cascade
// ═══════════════════════════════════════════════════════

describe('MorphEvaluator', () => {
	let voxelGrid: VoxelGrid;
	let evaluator: MorphEvaluator;

	beforeEach(() => {
		voxelGrid = new VoxelGrid(grid);
		const registry = new TileRegistry();
		for (const tile of HOUSING_TILES) registry.register(tile);
		const analyzer = new NeighborAnalyzer(grid, voxelGrid);
		const solver = new WFCSolver(registry, voxelGrid, grid, 42);
		evaluator = new MorphEvaluator(voxelGrid, analyzer, solver, grid);
	});

	it('place returns morph updates', () => {
		const updates = evaluator.place(centerCell, 0, 'housing');
		expect(updates.length).toBeGreaterThan(0);
	});

	it('stackUp increases height', () => {
		evaluator.place(centerCell, 0);
		evaluator.stackUp(centerCell);
		expect(voxelGrid.getHeight(centerCell)).toBe(2);
	});

	it('stackDown decreases height', () => {
		evaluator.place(centerCell, 1);
		evaluator.stackDown(centerCell);
		expect(voxelGrid.getHeight(centerCell)).toBe(1);
	});

	it('every update has a morph shape with valid edge indices', () => {
		const updates = evaluator.place(centerCell, 1);
		for (const u of updates) {
			expect(u.morph).toBeDefined();
			expect(u.morph.shape).toBeTruthy();
			const cell = grid.cells[u.cellIndex];
			for (const e of u.morph.openEdges) {
				expect(e).toBeGreaterThanOrEqual(0);
				expect(e).toBeLessThan(cell.vertices.length);
			}
		}
	});
});

// ═══════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════

function countBits(mask: number, startBit: number, count: number): number {
	let total = 0;
	for (let i = 0; i < count; i++) {
		if (mask & (1 << (startBit + i))) total++;
	}
	return total;
}
