import { TransportMode } from './types';
import type { TransportEdge, EdgeWeight } from './types';
import type { VoronoiCell } from '../../grid/types';

// ── Mode speeds (km/h) ─────────────────────────────────────

const MODE_SPEED: Record<TransportMode, number> = {
	[TransportMode.Road]: 35,
	[TransportMode.Cycle]: 15,
	[TransportMode.Metro]: 45,
	[TransportMode.Train]: 80,
};

const MODE_COST_PER_KM: Record<TransportMode, number> = {
	[TransportMode.Road]: 0.15,
	[TransportMode.Cycle]: 0,
	[TransportMode.Metro]: 0.08,
	[TransportMode.Train]: 0.12,
};

// ── Transport Network ───────────────────────────────────────
//
// Multi-modal weighted graph on the Voronoi cell adjacency.
// No modes are available by default — the player must place roads,
// metro, or train infrastructure to enable transport on each edge.

export class TransportNetwork {
	/** Adjacency list: cellIndex → Map<neighborIndex, TransportEdge> */
	private edges = new Map<number, Map<number, TransportEdge>>();
	/** Cells that have metro infrastructure */
	private metroCells = new Set<number>();
	/** Cells that have train infrastructure */
	private trainCells = new Set<number>();
	/** Player-placed road segments — only edges with explicit roads get Road+Cycle weights. */
	private explicitRoads = new Set<string>();

	/** Initialise the graph from a set of Voronoi cells.
	 *  Edges are created with adjacency/distance info but NO mode weights.
	 *  Modes are added when infrastructure is placed.
	 */
	init(cells: readonly VoronoiCell[]): void {
		this.edges.clear();
		this.metroCells.clear();
		this.trainCells.clear();
		this.explicitRoads.clear();

		for (const cell of cells) {
			if (!this.edges.has(cell.index)) {
				this.edges.set(cell.index, new Map());
			}
			for (const nIdx of cell.neighbors) {
				const neighbor = cells[nIdx];
				if (!neighbor) continue;
				this.ensureEdge(cell, neighbor);
			}
		}
	}

	/** Place an explicit road between two adjacent cells (enables Road+Cycle modes). */
	addRoad(fromCell: number, toCell: number): void {
		const key = edgeKey(fromCell, toCell);
		if (this.explicitRoads.has(key)) return;
		this.explicitRoads.add(key);
		// Rebuild weights so Road+Cycle become available on this edge
		this.rebuildEdgeWeights(fromCell, toCell);
	}

	/** Add metro infrastructure at a cell (all edges touching this cell gain Metro mode). */
	addMetro(cellIndex: number): void {
		if (this.metroCells.has(cellIndex)) return;
		this.metroCells.add(cellIndex);
		this.rebuildModesForCell(cellIndex);
	}

	/** Add train infrastructure at a cell. */
	addTrain(cellIndex: number): void {
		if (this.trainCells.has(cellIndex)) return;
		this.trainCells.add(cellIndex);
		this.rebuildModesForCell(cellIndex);
	}

	/** Get all edges from a cell. */
	getEdges(cellIndex: number): ReadonlyMap<number, TransportEdge> | undefined {
		return this.edges.get(cellIndex);
	}

	/** Get a specific edge. */
	getEdge(from: number, to: number): TransportEdge | undefined {
		return this.edges.get(from)?.get(to);
	}

	/** Whether an explicit road has been placed. */
	hasExplicitRoad(a: number, b: number): boolean {
		return this.explicitRoads.has(edgeKey(a, b));
	}

	hasMetro(cellIndex: number): boolean {
		return this.metroCells.has(cellIndex);
	}

	hasTrain(cellIndex: number): boolean {
		return this.trainCells.has(cellIndex);
	}

	/** All cell indices in the graph. */
	getCellIndices(): number[] {
		return [...this.edges.keys()];
	}

	/** All explicit road edge keys (for rendering). */
	getExplicitRoads(): ReadonlySet<string> {
		return this.explicitRoads;
	}

	// ── Internal ────────────────────────────────────────────

	private ensureEdge(a: VoronoiCell, b: VoronoiCell): void {
		const aMap = this.edges.get(a.index) ?? new Map();
		if (aMap.has(b.index)) return;

		const distM = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y);
		const weights = this.buildWeights(a.index, b.index, distM);

		const edge: TransportEdge = { from: a.index, to: b.index, distanceM: distM, weights };
		aMap.set(b.index, edge);
		this.edges.set(a.index, aMap);

		// Symmetric edge
		const bMap = this.edges.get(b.index) ?? new Map();
		if (!bMap.has(a.index)) {
			const rev: TransportEdge = { from: b.index, to: a.index, distanceM: distM, weights };
			bMap.set(a.index, rev);
			this.edges.set(b.index, bMap);
		}
	}

	private buildWeights(from: number, to: number, distM: number): Partial<Record<TransportMode, EdgeWeight>> {
		const distKm = distM / 1000;
		const w: Partial<Record<TransportMode, EdgeWeight>> = {};

		// Road + Cycle only available on explicit player-placed roads
		if (this.explicitRoads.has(edgeKey(from, to))) {
			w[TransportMode.Road] = {
				timeMins: (distKm / MODE_SPEED[TransportMode.Road]) * 60,
				cost: distKm * MODE_COST_PER_KM[TransportMode.Road],
			};
			w[TransportMode.Cycle] = {
				timeMins: (distKm / MODE_SPEED[TransportMode.Cycle]) * 60,
				cost: 0,
			};
		}

		// Metro available if both endpoints have metro
		if (this.metroCells.has(from) && this.metroCells.has(to)) {
			w[TransportMode.Metro] = {
				timeMins: (distKm / MODE_SPEED[TransportMode.Metro]) * 60,
				cost: distKm * MODE_COST_PER_KM[TransportMode.Metro],
			};
		}

		// Train available if both endpoints have train
		if (this.trainCells.has(from) && this.trainCells.has(to)) {
			w[TransportMode.Train] = {
				timeMins: (distKm / MODE_SPEED[TransportMode.Train]) * 60,
				cost: distKm * MODE_COST_PER_KM[TransportMode.Train],
			};
		}

		return w;
	}

	/** Rebuild weights for all edges touching a cell (after infrastructure change). */
	private rebuildModesForCell(cellIndex: number): void {
		const cellEdges = this.edges.get(cellIndex);
		if (!cellEdges) return;

		for (const [neighbor, edge] of cellEdges) {
			const newWeights = this.buildWeights(cellIndex, neighbor, edge.distanceM);
			const updated: TransportEdge = { ...edge, weights: newWeights };
			cellEdges.set(neighbor, updated);

			// Update reverse edge too
			const revMap = this.edges.get(neighbor);
			if (revMap) {
				const revEdge = revMap.get(cellIndex);
				if (revEdge) {
					const revWeights = this.buildWeights(neighbor, cellIndex, revEdge.distanceM);
					revMap.set(cellIndex, { ...revEdge, weights: revWeights });
				}
			}
		}
	}

	/** Rebuild weights for a single edge pair (after road placement). */
	private rebuildEdgeWeights(a: number, b: number): void {
		const aMap = this.edges.get(a);
		const edge = aMap?.get(b);
		if (!aMap || !edge) return;

		const newWeights = this.buildWeights(a, b, edge.distanceM);
		aMap.set(b, { ...edge, weights: newWeights });

		const bMap = this.edges.get(b);
		const revEdge = bMap?.get(a);
		if (bMap && revEdge) {
			const revWeights = this.buildWeights(b, a, revEdge.distanceM);
			bMap.set(a, { ...revEdge, weights: revWeights });
		}
	}
}

function edgeKey(a: number, b: number): string {
	return a < b ? `${a}-${b}` : `${b}-${a}`;
}
