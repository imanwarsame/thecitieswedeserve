import type { OrganicGrid, VoronoiCell } from '../grid/types';
import type { VoxelGrid } from './VoxelGrid';
import type { TileAssignment, SolveResult } from './wfc/WFCSolver';
import type { EnergyProperties } from './tiles/TileRegistry';
import { HousingConfig } from './HousingConfig';
import { cellArea } from '../grid/GridQuery';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type FaceExposure = 'exterior' | 'interior' | 'ground' | 'adiabatic';

export interface EnvelopeFace {
	cellIndex: number;
	layer: number;
	edgeIndex: number;
	direction: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'up' | 'down';
	exposure: FaceExposure;
	area: number;
	energy: EnergyProperties;
	bearing: number;
}

export interface BuildingMetrics {
	grossFloorArea: number;       // m² — sum of cell areas × floor count
	conditionedVolume: number;    // m³ — floor area × layer height
	envelopeArea: number;         // m² — total exterior-facing surface
	glazingArea: number;          // m² — glazed exterior faces
	glazingRatio: number;         // glazingArea / total facade area
	floorCount: number;
	footprint: number;            // m² — ground floor area
	avgUValue: number;            // area-weighted average U-value of envelope
	totalEmbodiedCarbon: number;  // kgCO₂e total
}

export interface Building {
	id: string;
	buildingType: string;
	voxelKeys: Set<string>;
	footprintCells: number[];
	metrics: BuildingMetrics;
	envelope: EnvelopeFace[];
}

export interface EnergyExport {
	buildings: {
		id: string;
		type: string;
		floorCount: number;
		totalFloorArea: number;
		totalVolume: number;
		envelopeArea: number;
		glazingRatio: number;
		avgUValue: number;
		embodiedCarbon: number;
		floors: {
			level: number;
			area: number;
			height: number;
			cells: {
				cellIndex: number;
				tileId: string;
				faces: {
					direction: string;
					exposure: FaceExposure;
					area: number;
					uValue: number;
					shgc?: number;
					materialClass: string;
				}[];
			}[];
		}[];
	}[];
}

// ═══════════════════════════════════════════════════════
// BuildingAnalyzer
// ═══════════════════════════════════════════════════════

/**
 * Post-WFC analyzer that groups voxels into buildings,
 * tags face exposures, computes metrics, and produces
 * energy export data.
 */
export class BuildingAnalyzer {
	private grid: OrganicGrid;
	private voxelGrid: VoxelGrid;

	constructor(grid: OrganicGrid, voxelGrid: VoxelGrid) {
		this.grid = grid;
		this.voxelGrid = voxelGrid;
	}

	/**
	 * Run the full analysis pipeline on a set of tile assignments.
	 * Returns identified buildings with metrics and envelope data.
	 */
	analyze(solveResult: SolveResult): Building[] {
		const assignmentMap = new Map<string, TileAssignment>();
		for (const a of solveResult.assignments) {
			assignmentMap.set(`${a.cellIndex}:${a.layer}`, a);
		}

		// 1. Group voxels into connected buildings
		const buildings = this.findConnectedBuildings(assignmentMap);

		// 2. For each building, compute envelope + metrics
		for (const building of buildings) {
			building.envelope = this.computeEnvelope(building, assignmentMap);
			building.metrics = this.computeMetrics(building);
		}

		return buildings;
	}

	/** Export all buildings in energy-tool-compatible format. */
	export(buildings: Building[]): EnergyExport {
		return {
			buildings: buildings.map(b => this.exportBuilding(b)),
		};
	}

	// ─── Connected Components ──────────────────────────

	private findConnectedBuildings(assignments: Map<string, TileAssignment>): Building[] {
		const visited = new Set<string>();
		const buildings: Building[] = [];
		let buildingCounter = 0;

		for (const [key, assignment] of assignments) {
			if (visited.has(key)) continue;
			if (assignment.tile.id === 'air') continue;

			// BFS flood fill from this voxel
			const voxelKeys = new Set<string>();
			const footprintCells = new Set<number>();
			const queue = [key];
			const buildingType = this.voxelGrid.getVoxel(
				assignment.cellIndex, assignment.layer
			)?.buildingType ?? 'housing';

			while (queue.length > 0) {
				const current = queue.shift()!;
				if (visited.has(current)) continue;
				visited.add(current);

				const a = assignments.get(current);
				if (!a || a.tile.id === 'air') continue;

				voxelKeys.add(current);
				if (a.layer === 0) footprintCells.add(a.cellIndex);

				// Expand to vertical neighbors
				const above = `${a.cellIndex}:${a.layer + 1}`;
				const below = `${a.cellIndex}:${a.layer - 1}`;
				if (assignments.has(above) && !visited.has(above)) queue.push(above);
				if (assignments.has(below) && !visited.has(below)) queue.push(below);

				// Expand to horizontal neighbors
				const cell = this.grid.cells[a.cellIndex];
				if (cell) {
					for (const ni of cell.neighbors) {
						const nKey = `${ni}:${a.layer}`;
						if (assignments.has(nKey) && !visited.has(nKey)) queue.push(nKey);
					}
				}
			}

			if (voxelKeys.size > 0) {
				buildings.push({
					id: `building_${buildingCounter++}`,
					buildingType,
					voxelKeys,
					footprintCells: [...footprintCells],
					metrics: null!,   // filled after envelope computation
					envelope: [],
				});
			}
		}

		return buildings;
	}

	// ─── Envelope / Face Exposure ──────────────────────

	private computeEnvelope(
		building: Building,
		assignments: Map<string, TileAssignment>,
	): EnvelopeFace[] {
		const faces: EnvelopeFace[] = [];
		const h = HousingConfig.layerHeight;

		for (const key of building.voxelKeys) {
			const assignment = assignments.get(key);
			if (!assignment) continue;

			const { cellIndex, layer, tile } = assignment;
			const cell = this.grid.cells[cellIndex];
			if (!cell) continue;

			const area = cellArea(cell);

			// Top face
			const aboveKey = `${cellIndex}:${layer + 1}`;
			const topExposure: FaceExposure = building.voxelKeys.has(aboveKey) ? 'adiabatic' : 'exterior';
			faces.push({
				cellIndex, layer, edgeIndex: -1,
				direction: 'up',
				exposure: topExposure,
				area,
				energy: tile.energy,
				bearing: -1,
			});

			// Bottom face
			const belowKey = `${cellIndex}:${layer - 1}`;
			const bottomExposure: FaceExposure = layer === 0
				? 'ground'
				: building.voxelKeys.has(belowKey) ? 'adiabatic' : 'exterior';
			faces.push({
				cellIndex, layer, edgeIndex: -1,
				direction: 'down',
				exposure: bottomExposure,
				area,
				energy: tile.energy,
				bearing: -1,
			});

			// Side faces (per edge)
			for (let e = 0; e < cell.vertices.length; e++) {
				const v0 = cell.vertices[e];
				const v1 = cell.vertices[(e + 1) % cell.vertices.length];
				const edgeLen = Math.hypot(v1.x - v0.x, v1.y - v0.y);
				const faceArea = edgeLen * h;

				// Check if any neighbor across this edge is in the same building
				const bearing = assignment.edgeBearings[assignment.openEdges.indexOf(e)] ?? this.computeBearing(cell, e);
				const dir = bearingToCardinal(bearing);

				// Find which neighbor this edge faces
				const neighborIdx = this.findNeighborForEdge(cell, e);
				const nKey = neighborIdx >= 0 ? `${neighborIdx}:${layer}` : '';
				const exposure: FaceExposure = building.voxelKeys.has(nKey) ? 'interior' : 'exterior';

				faces.push({
					cellIndex, layer, edgeIndex: e,
					direction: dir,
					exposure,
					area: faceArea,
					energy: tile.energy,
					bearing,
				});
			}
		}

		return faces;
	}

	// ─── Metrics ───────────────────────────────────────

	private computeMetrics(building: Building): BuildingMetrics {
		const h = HousingConfig.layerHeight;
		const exteriorFaces = building.envelope.filter(f => f.exposure === 'exterior');
		const sideFaces = exteriorFaces.filter(f => f.direction !== 'up' && f.direction !== 'down');
		const glazedFaces = sideFaces.filter(f => f.energy.materialClass === 'glazed');

		// Footprint area
		let footprint = 0;
		for (const ci of building.footprintCells) {
			footprint += cellArea(this.grid.cells[ci]);
		}

		// All layers (deduplicate cellIndex per layer for floor area)
		const layerCells = new Map<number, Set<number>>();
		for (const key of building.voxelKeys) {
			const [ci, li] = key.split(':').map(Number);
			if (!layerCells.has(li)) layerCells.set(li, new Set());
			layerCells.get(li)!.add(ci);
		}

		let grossFloorArea = 0;
		for (const [_, cells] of layerCells) {
			for (const ci of cells) {
				grossFloorArea += cellArea(this.grid.cells[ci]);
			}
		}

		const floorCount = layerCells.size;
		const conditionedVolume = grossFloorArea * h;
		const envelopeArea = exteriorFaces.reduce((s, f) => s + f.area, 0);
		const glazingArea = glazedFaces.reduce((s, f) => s + f.area, 0);
		const totalFacadeArea = sideFaces.reduce((s, f) => s + f.area, 0);
		const glazingRatio = totalFacadeArea > 0 ? glazingArea / totalFacadeArea : 0;

		// Area-weighted average U-value of exterior envelope
		let uValueSum = 0;
		for (const f of exteriorFaces) {
			uValueSum += f.energy.uValue * f.area;
		}
		const avgUValue = envelopeArea > 0 ? uValueSum / envelopeArea : 0;

		// Embodied carbon
		let totalEmbodiedCarbon = 0;
		for (const f of building.envelope) {
			totalEmbodiedCarbon += (f.energy.embodiedCarbon ?? 0) * f.area;
		}

		return {
			grossFloorArea,
			conditionedVolume,
			envelopeArea,
			glazingArea,
			glazingRatio,
			floorCount,
			footprint,
			avgUValue,
			totalEmbodiedCarbon,
		};
	}

	// ─── Export ─────────────────────────────────────────

	private exportBuilding(b: Building): EnergyExport['buildings'][0] {
		const h = HousingConfig.layerHeight;

		// Group faces by layer
		const layerMap = new Map<number, { cellIndex: number; tileId: string; faces: EnvelopeFace[] }[]>();
		for (const face of b.envelope) {
			if (!layerMap.has(face.layer)) layerMap.set(face.layer, []);
			const layerCells = layerMap.get(face.layer)!;
			let cellEntry = layerCells.find(c => c.cellIndex === face.cellIndex);
			if (!cellEntry) {
				cellEntry = { cellIndex: face.cellIndex, tileId: '', faces: [] };
				layerCells.push(cellEntry);
			}
			cellEntry.faces.push(face);
		}

		const floors = [...layerMap.entries()].sort((a, b) => a[0] - b[0]).map(([level, cells]) => ({
			level,
			area: cells.reduce((s, c) => s + cellArea(this.grid.cells[c.cellIndex]), 0),
			height: h,
			cells: cells.map(c => ({
				cellIndex: c.cellIndex,
				tileId: c.tileId,
				faces: c.faces.map(f => ({
					direction: f.direction,
					exposure: f.exposure,
					area: f.area,
					uValue: f.energy.uValue,
					shgc: f.energy.shgc,
					materialClass: f.energy.materialClass,
				})),
			})),
		}));

		return {
			id: b.id,
			type: b.buildingType,
			floorCount: b.metrics.floorCount,
			totalFloorArea: b.metrics.grossFloorArea,
			totalVolume: b.metrics.conditionedVolume,
			envelopeArea: b.metrics.envelopeArea,
			glazingRatio: b.metrics.glazingRatio,
			avgUValue: b.metrics.avgUValue,
			embodiedCarbon: b.metrics.totalEmbodiedCarbon,
			floors,
		};
	}

	// ─── Helpers ────────────────────────────────────────

	private findNeighborForEdge(cell: VoronoiCell, edgeIdx: number): number {
		const v0 = cell.vertices[edgeIdx];
		const v1 = cell.vertices[(edgeIdx + 1) % cell.vertices.length];
		const mx = (v0.x + v1.x) / 2;
		const mz = (v0.y + v1.y) / 2;

		let best = -1;
		let bestDist = Infinity;
		for (const ni of cell.neighbors) {
			const nc = this.grid.cells[ni];
			const dist = (nc.center.x - mx) ** 2 + (nc.center.y - mz) ** 2;
			if (dist < bestDist) {
				bestDist = dist;
				best = ni;
			}
		}
		return best;
	}

	private computeBearing(cell: VoronoiCell, edgeIdx: number): number {
		const v0 = cell.vertices[edgeIdx];
		const v1 = cell.vertices[(edgeIdx + 1) % cell.vertices.length];
		const dx = v1.x - v0.x;
		const dz = v1.y - v0.y;
		const rad = Math.atan2(-dz, dx);
		return ((rad * 180 / Math.PI) + 360) % 360;
	}
}

function bearingToCardinal(bearing: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
	const dirs: ('N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW')[] =
		['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	const idx = Math.round(bearing / 45) % 8;
	return dirs[idx];
}
