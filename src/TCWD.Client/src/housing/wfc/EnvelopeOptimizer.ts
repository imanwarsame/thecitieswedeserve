import type { OrganicGrid } from '../../grid/types';
import type { VoxelGrid } from '../VoxelGrid';
import type { TileRegistry } from '../tiles/TileRegistry';
import { WFCSolver, type SolveResult } from './WFCSolver';
import { BuildingAnalyzer, type Building } from '../BuildingAnalyzer';
import {
	estimateAnnualEnergy,
	estimateDaylight,
	type ClimateData,
	type AnnualEnergyEstimate,
} from '../energy/EnergyModel';
import type { MorphShape } from '../StackingRules';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface OptimizationTarget {
	/** Max energy use intensity kWh/m²/yr. */
	maxEUI: number;
	/** Target glazing ratio (0–1). */
	targetGlazingRatio: number;
	/** Max embodied carbon kgCO₂e/m². */
	maxEmbodiedCarbon: number;
	/** Min spatial daylight autonomy %. */
	minDaylightAutonomy: number;
}

export interface OptimizationResult {
	bestResult: SolveResult;
	bestBuildings: Building[];
	bestEnergy: AnnualEnergyEstimate[];
	bestScore: number;
	/** How many iterations were explored. */
	explored: number;
	/** Score breakdown per building. */
	scoreBreakdown: ScoreBreakdown[];
}

export interface ScoreBreakdown {
	buildingId: string;
	euiScore: number;
	glazingScore: number;
	carbonScore: number;
	daylightScore: number;
	convergenceScore: number;
	total: number;
}

// ═══════════════════════════════════════════════════════
// Default targets (EU nZEB-aligned)
// ═══════════════════════════════════════════════════════

export const DEFAULT_TARGETS: OptimizationTarget = {
	maxEUI: 50,                 // kWh/m²/yr (nZEB residential target)
	targetGlazingRatio: 0.35,   // 35% glazing
	maxEmbodiedCarbon: 500,     // kgCO₂e/m² (ambitious but achievable)
	minDaylightAutonomy: 55,    // % (LEED v4 daylight credit threshold)
};

// ═══════════════════════════════════════════════════════
// Optimizer
// ═══════════════════════════════════════════════════════

/**
 * Explores multiple WFC solutions with different seeds and picks the
 * one that best meets the energy/carbon/daylight targets.
 *
 * Each iteration creates a solver with a unique seed, solves the same
 * affected cells, analyzes the resulting buildings, and scores them.
 * The best-scoring solution is returned.
 *
 * Typical budget: 20–50 iterations (~50–200ms for a moderate building).
 */
export function optimizeEnvelope(
	registry: TileRegistry,
	voxelGrid: VoxelGrid,
	grid: OrganicGrid,
	affectedCells: Set<number>,
	climate: ClimateData,
	targets: OptimizationTarget = DEFAULT_TARGETS,
	morphHints?: Map<string, MorphShape>,
	baseSeed = 42,
	iterations = 30,
): OptimizationResult {
	const analyzer = new BuildingAnalyzer(grid, voxelGrid);

	let bestScore = -Infinity;
	let bestResult: SolveResult | null = null;
	let bestBuildings: Building[] = [];
	let bestEnergy: AnnualEnergyEstimate[] = [];
	let bestBreakdown: ScoreBreakdown[] = [];

	for (let i = 0; i < iterations; i++) {
		const solver = new WFCSolver(registry, voxelGrid, grid, baseSeed + i);
		const result = solver.solve(affectedCells, morphHints);
		const buildings = analyzer.analyze(result);

		let totalScore = 0;
		const breakdown: ScoreBreakdown[] = [];
		const energies: AnnualEnergyEstimate[] = [];

		for (const b of buildings) {
			const energy = estimateAnnualEnergy(b, climate);
			energies.push(energy);

			const scores = scoreBuilding(b, energy, result, targets);
			breakdown.push(scores);
			totalScore += scores.total;
		}

		if (totalScore > bestScore) {
			bestScore = totalScore;
			bestResult = result;
			bestBuildings = buildings;
			bestEnergy = energies;
			bestBreakdown = breakdown;
		}
	}

	return {
		bestResult: bestResult!,
		bestBuildings,
		bestEnergy,
		bestScore,
		explored: iterations,
		scoreBreakdown: bestBreakdown,
	};
}

// ═══════════════════════════════════════════════════════
// Scoring
// ═══════════════════════════════════════════════════════

function scoreBuilding(
	b: Building,
	energy: AnnualEnergyEstimate,
	result: SolveResult,
	targets: OptimizationTarget,
): ScoreBreakdown {
	// EUI penalty: each kWh/m²/yr over target costs 10 points
	const euiScore = -Math.max(0, energy.eui - targets.maxEUI) * 10;

	// Glazing: penalize distance from target (each 1% off costs 2 points)
	const glazingScore = -Math.abs(b.metrics.glazingRatio - targets.targetGlazingRatio) * 200;

	// Embodied carbon: penalty for exceeding target
	const embodiedPerM2 = b.metrics.grossFloorArea > 0
		? b.metrics.totalEmbodiedCarbon / b.metrics.grossFloorArea
		: 0;
	const carbonScore = -Math.max(0, embodiedPerM2 - targets.maxEmbodiedCarbon) * 5;

	// Daylight: sample a few voxels and check sDA
	let daylightScore = 0;
	const voxelKeys = [...b.voxelKeys];
	const sampleSize = Math.min(voxelKeys.length, 5);
	for (let i = 0; i < sampleSize; i++) {
		const [ci, li] = voxelKeys[i].split(':').map(Number);
		const dl = estimateDaylight(b, ci, li);
		if (dl.spatialDaylightAutonomy >= targets.minDaylightAutonomy) {
			daylightScore += 5; // bonus per compliant voxel
		} else {
			daylightScore -= 3; // penalty per non-compliant
		}
	}

	// Convergence bonus
	const convergenceScore = result.converged ? 10 : -20;
	const fallbackPenalty = -result.fallbackCount * 5;

	const total = euiScore + glazingScore + carbonScore + daylightScore + convergenceScore + fallbackPenalty;

	return {
		buildingId: b.id,
		euiScore,
		glazingScore,
		carbonScore,
		daylightScore,
		convergenceScore: convergenceScore + fallbackPenalty,
		total,
	};
}
