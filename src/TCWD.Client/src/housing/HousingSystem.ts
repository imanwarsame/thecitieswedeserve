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
import { BuildingAnalyzer, type Building, type EnergyExport } from './BuildingAnalyzer';
import { optimizeEnvelope, DEFAULT_TARGETS, type OptimizationTarget, type OptimizationResult } from './wfc/EnvelopeOptimizer';
import { type ClimateData, CLIMATES } from './energy/EnergyModel';
import { HousingConfig } from './HousingConfig';
import { GridConfig } from '../grid/GridConfig';

/**
 * Top-level orchestrator for the housing creation pipeline.
 * Owns VoxelGrid, MorphEvaluator, WFCSolver, HousingMeshGenerator, and BuildingAnalyzer.
 */
export class HousingSystem {
	private voxelGrid: VoxelGrid;
	private morphEvaluator: MorphEvaluator;
	private meshGenerator: HousingMeshGenerator;
	private buildingAnalyzer: BuildingAnalyzer;
	private solver: WFCSolver;
	private tileRegistry: TileRegistry;
	private grid: OrganicGrid;

	constructor(grid: OrganicGrid, registry: MaterialRegistry, parentGroup: THREE.Group, seed?: number) {
		this.grid = grid;
		this.voxelGrid = new VoxelGrid(grid);

		this.tileRegistry = new TileRegistry();
		for (const tile of HOUSING_TILES) this.tileRegistry.register(tile);

		const analyzer = new NeighborAnalyzer(grid, this.voxelGrid);
		this.solver = new WFCSolver(this.tileRegistry, this.voxelGrid, grid, seed ?? GridConfig.seed);
		this.morphEvaluator = new MorphEvaluator(this.voxelGrid, analyzer, this.solver, grid);
		this.meshGenerator = new HousingMeshGenerator(registry, grid, parentGroup);
		this.buildingAnalyzer = new BuildingAnalyzer(grid, this.voxelGrid);
	}

	/** Set the tint colour that will be applied to the next placed housing. */
	setHousingColor(cellIndex: number, color: number): void {
		this.meshGenerator.setCellColor(cellIndex, color);
	}

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

	removeHousing(cellIndex: number): number {
		if (this.voxelGrid.getHeight(cellIndex) <= 0) return 0;

		const updates = this.morphEvaluator.stackDown(cellIndex);
		this.meshGenerator.applyUpdates(updates);

		return this.voxelGrid.getHeight(cellIndex);
	}

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

	getHousingUnits(cellIndex: number): number {
		return this.voxelGrid.getHeight(cellIndex) * 250;
	}

	getVoxelGrid(): VoxelGrid {
		return this.voxelGrid;
	}

	/** Analyze all placed buildings — metrics, envelope, grouping. */
	analyzeBuildings(): Building[] {
		const affected = new Set(this.voxelGrid.getOccupiedCells());
		const solveResult = this.solver.solve(affected);
		return this.buildingAnalyzer.analyze(solveResult);
	}

	/** Export building data for energy simulation tools. */
	exportForEnergy(): EnergyExport {
		const buildings = this.analyzeBuildings();
		return this.buildingAnalyzer.export(buildings);
	}

	/**
	 * Explore multiple WFC solutions and pick the best for energy/daylight/carbon.
	 * Returns the best solution with scores. Does NOT apply meshes — call
	 * applyOptimizedResult() to commit.
	 */
	optimizeEnvelope(
		climate: ClimateData = CLIMATES.copenhagen,
		targets: OptimizationTarget = DEFAULT_TARGETS,
		iterations = 30,
	): OptimizationResult {
		const affected = new Set(this.voxelGrid.getOccupiedCells());
		return optimizeEnvelope(
			this.tileRegistry,
			this.voxelGrid,
			this.grid,
			affected,
			climate,
			targets,
			undefined,
			GridConfig.seed,
			iterations,
		);
	}

	dispose(): void {
		this.meshGenerator.dispose();
		this.voxelGrid.clear();
	}
}
