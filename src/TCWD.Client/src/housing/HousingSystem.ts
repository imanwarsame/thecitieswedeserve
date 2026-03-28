import * as THREE from 'three';
import type { OrganicGrid } from '../grid/types';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';
import { VoxelGrid } from './VoxelGrid';
import { NeighborAnalyzer } from './NeighborAnalyzer';
import { MorphEvaluator } from './MorphEvaluator';
import { WFCSolver } from './wfc/WFCSolver';
import { TileRegistry } from './tiles/TileRegistry';
import { HOUSING_TILES } from './tiles/TileDefs';
import { HousingMeshGenerator } from './mesh/HousingMeshGenerator';
import { HousingConfig } from './HousingConfig';

/**
 * Top-level orchestrator for the housing creation pipeline.
 * Owns VoxelGrid, MorphEvaluator, WFCSolver, and HousingMeshGenerator.
 */
export class HousingSystem {
	private voxelGrid: VoxelGrid;
	private morphEvaluator: MorphEvaluator;
	private meshGenerator: HousingMeshGenerator;

	constructor(grid: OrganicGrid, registry: MaterialRegistry, parentGroup: THREE.Group) {
		this.voxelGrid = new VoxelGrid(grid);

		const tileRegistry = new TileRegistry();
		for (const tile of HOUSING_TILES) tileRegistry.register(tile);

		const analyzer = new NeighborAnalyzer(grid, this.voxelGrid);
		const solver = new WFCSolver(tileRegistry, this.voxelGrid);
		this.morphEvaluator = new MorphEvaluator(this.voxelGrid, analyzer, solver, grid);
		this.meshGenerator = new HousingMeshGenerator(registry, grid, parentGroup);
	}

	/**
	 * Place housing at a cell. Stacks on top if blocks exist.
	 * Returns the new column height.
	 */
	placeHousing(cellIndex: number): number {
		const currentHeight = this.voxelGrid.getHeight(cellIndex);

		if (currentHeight >= HousingConfig.maxLayers) {
			console.warn(`[HousingSystem] Max height reached at cell ${cellIndex}.`);
			return currentHeight;
		}

		const targetLayer = Math.max(0, currentHeight);
		const updates = this.morphEvaluator.place(cellIndex, targetLayer, 'housing');
		this.meshGenerator.applyUpdates(updates);

		return this.voxelGrid.getHeight(cellIndex);
	}

	/** Remove the top layer. Returns the new height (0 if fully removed). */
	removeHousing(cellIndex: number): number {
		if (this.voxelGrid.getHeight(cellIndex) <= 0) return 0;

		const updates = this.morphEvaluator.stackDown(cellIndex);
		this.meshGenerator.applyUpdates(updates);

		return this.voxelGrid.getHeight(cellIndex);
	}

	/** Demolish entire column. */
	demolish(cellIndex: number): void {
		if (this.voxelGrid.getHeight(cellIndex) <= 0) return;

		const updates = this.morphEvaluator.remove(cellIndex, 0);
		this.meshGenerator.applyUpdates(updates);
		this.meshGenerator.clearCell(cellIndex);
	}

	getHeight(cellIndex: number): number {
		return this.voxelGrid.getHeight(cellIndex);
	}

	hasHousing(cellIndex: number): boolean {
		return this.voxelGrid.hasBlocks(cellIndex);
	}

	getOccupiedCells(): number[] {
		return this.voxelGrid.getOccupiedCells();
	}

	/** Housing units for simulation (each floor ≈ 250 households). */
	getHousingUnits(cellIndex: number): number {
		return this.voxelGrid.getHeight(cellIndex) * 250;
	}

	dispose(): void {
		this.meshGenerator.dispose();
		this.voxelGrid.clear();
	}
}
