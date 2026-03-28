import type { VoxelGrid } from './VoxelGrid';
import { NeighborAnalyzer, type NeighborContext } from './NeighborAnalyzer';
import { evaluateMorphShape, type MorphResult } from './StackingRules';
import type { WFCSolver, TileAssignment } from './wfc/WFCSolver';
import { events } from '../core/Events';

export interface MorphUpdate {
	cellIndex: number;
	layer: number;
	context: NeighborContext;
	morph: MorphResult;
	tile: TileAssignment | null;
}

/**
 * Coordinates the full morph cascade:
 * 1. VoxelGrid updates corner solidity
 * 2. NeighborAnalyzer builds spatial context for each affected voxel
 * 3. StackingRules determines the shape
 * 4. WFCSolver picks the specific tile variant
 * 5. Returns a list of voxels that need mesh rebuilds
 */
export class MorphEvaluator {
	private voxelGrid: VoxelGrid;
	private analyzer: NeighborAnalyzer;
	private solver: WFCSolver;

	constructor(voxelGrid: VoxelGrid, analyzer: NeighborAnalyzer, solver: WFCSolver) {
		this.voxelGrid = voxelGrid;
		this.analyzer = analyzer;
		this.solver = solver;
	}

	/** Place a block and compute the full morph cascade. */
	place(cellIndex: number, layer: number, buildingType?: string): MorphUpdate[] {
		const affected = this.voxelGrid.placeBlock(cellIndex, layer, buildingType);
		const expanded = this.expandAffected(affected);
		const updates = this.evaluateAll(expanded);

		events.emit('housing:morphed', { updates, action: 'place', cellIndex, layer });
		return updates;
	}

	/** Remove a block and compute the morph cascade. */
	remove(cellIndex: number, layer: number): MorphUpdate[] {
		const affected = this.voxelGrid.removeBlock(cellIndex, layer);
		const expanded = this.expandAffected(affected);
		const updates = this.evaluateAll(expanded);

		events.emit('housing:morphed', { updates, action: 'remove', cellIndex, layer });
		return updates;
	}

	/** Add a layer on top of an existing column. */
	stackUp(cellIndex: number, buildingType?: string): MorphUpdate[] {
		const currentHeight = this.voxelGrid.getHeight(cellIndex);
		return this.place(cellIndex, Math.max(0, currentHeight), buildingType);
	}

	/** Remove the top layer of a column. */
	stackDown(cellIndex: number): MorphUpdate[] {
		const currentHeight = this.voxelGrid.getHeight(cellIndex);
		if (currentHeight <= 0) return [];
		return this.remove(cellIndex, currentHeight - 1);
	}

	/** Expand affected set to include all layers per column + roof layer. */
	private expandAffected(cells: Set<number>): Map<number, number[]> {
		const expanded = new Map<number, number[]>();

		for (const cellIndex of cells) {
			const column = this.voxelGrid.getColumn(cellIndex);
			if (!column) continue;

			const layers: number[] = [];
			for (const [layer] of column.voxels) {
				layers.push(layer);
			}
			// Include layer above topLayer for roof evaluation
			if (column.topLayer >= 0) {
				layers.push(column.topLayer + 1);
			}

			expanded.set(cellIndex, [...new Set(layers)].sort((a, b) => a - b));
		}

		return expanded;
	}

	private evaluateAll(cellLayers: Map<number, number[]>): MorphUpdate[] {
		const updates: MorphUpdate[] = [];

		// Evaluate morph shapes
		for (const [cellIndex, layers] of cellLayers) {
			for (const layer of layers) {
				const voxel = this.voxelGrid.getVoxel(cellIndex, layer);
				if (!voxel) continue;

				const context = this.analyzer.analyze(cellIndex, layer);
				const morph = evaluateMorphShape(context);

				updates.push({
					cellIndex,
					layer,
					context,
					morph,
					tile: null,
				});
			}
		}

		// Run WFC on affected cells
		const affectedSet = new Set(cellLayers.keys());
		const assignments = this.solver.solve(affectedSet);
		const assignmentMap = new Map(
			assignments.map(a => [`${a.cellIndex}:${a.layer}`, a])
		);

		// Merge tile assignments into morph updates
		for (const update of updates) {
			const key = `${update.cellIndex}:${update.layer}`;
			update.tile = assignmentMap.get(key) ?? null;
		}

		return updates;
	}
}
