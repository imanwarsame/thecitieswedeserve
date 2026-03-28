import type { Entity } from '../entities/types';
import type { ClockState } from '../engine/Clock';
import type { VoronoiCell } from '../../grid/types';
import type { TransportResult, NetworkEdgeVisual } from './types';
import { TransportMode } from './types';
import { TransportNetwork } from './TransportNetwork';
import { RouteResolver } from './RouteResolver';
import { PopScheduler } from './PopScheduler';
import { accumulateFlows } from './FlowAccumulator';

// ── Transport Module ────────────────────────────────────────
//
// Facade that owns all transport sub-systems and provides a
// single `compute()` entry-point called by the TransportLayer.

const EMPTY_RESULT: TransportResult = {
	trips: [],
	segments: [],
	occupancy: [],
	modalSplit: {
		[TransportMode.Road]: 0,
		[TransportMode.Cycle]: 0,
		[TransportMode.Metro]: 0,
		[TransportMode.Train]: 0,
	},
	avgCommuteMins: 0,
	totalPassengers: 0,
	congestionIndex: 0,
};

export class TransportModule {
	readonly network: TransportNetwork;
	private resolver: RouteResolver;
	private scheduler: PopScheduler;
	private lastResult: TransportResult = EMPTY_RESULT;

	/** Entity-to-cell mapping provided by the bridge. */
	private entityCellMap = new Map<string, number>();

	constructor() {
		this.network = new TransportNetwork();
		this.resolver = new RouteResolver(this.network);
		this.scheduler = new PopScheduler(this.resolver);
	}

	/** Initialise the network graph from grid cells. Call once after grid build. */
	init(cells: readonly VoronoiCell[]): void {
		this.network.init(cells);
		this.resolver.clearCache();
	}

	/** Register a sim entity at a cell (called when buildings are placed). */
	mapEntityToCell(simEntityId: string, cellIndex: number): void {
		this.entityCellMap.set(simEntityId, cellIndex);
	}

	/** Unregister a sim entity (called when buildings are removed). */
	unmapEntity(simEntityId: string): void {
		this.entityCellMap.delete(simEntityId);
	}

	/** Add explicit road between two cells (enables Road+Cycle routing). */
	addRoad(fromCell: number, toCell: number): void {
		this.network.addRoad(fromCell, toCell);
		this.resolver.clearCache();
	}

	/** Place metro infrastructure at a cell. */
	addMetro(cellIndex: number): void {
		this.network.addMetro(cellIndex);
		this.resolver.clearCache();
	}

	/** Place train infrastructure at a cell. */
	addTrain(cellIndex: number): void {
		this.network.addTrain(cellIndex);
		this.resolver.clearCache();
	}

	/** Core computation — called once per simulation tick by the TransportLayer. */
	compute(entities: readonly Entity[], clock: ClockState): TransportResult {
		this.resolver.advanceTick();

		// Build cell map: EntityType → cellIndices
		const cellMap = this.buildCellMap(entities);

		const trips = this.scheduler.generateTrips(clock.hour, entities, cellMap);
		this.lastResult = accumulateFlows(trips);
		return this.lastResult;
	}

	getLastResult(): TransportResult {
		return this.lastResult;
	}

	/** Build visual edge data for the TransportRenderer. */
	getVisualEdges(cells: readonly VoronoiCell[]): NetworkEdgeVisual[] {
		const visuals: NetworkEdgeVisual[] = [];
		const result = this.lastResult;

		// Flow segments → visuals
		for (const seg of result.segments) {
			const fromCell = cells[seg.from];
			const toCell = cells[seg.to];
			if (!fromCell || !toCell) continue;
			visuals.push({
				fromX: fromCell.center.x,
				fromZ: fromCell.center.y,
				toX: toCell.center.x,
				toZ: toCell.center.y,
				mode: seg.mode,
				flow: seg.tripsPerHour,
			});
		}

		return visuals;
	}

	// ── Internal ────────────────────────────────────────────

	private buildCellMap(entities: readonly Entity[]): Map<string, number[]> {
		const map = new Map<string, number[]>();

		for (const entity of entities) {
			const cellIndex = this.entityCellMap.get(entity.id);
			if (cellIndex === undefined) continue;

			const list = map.get(entity.type);
			if (list) {
				list.push(cellIndex);
			} else {
				map.set(entity.type, [cellIndex]);
			}
		}

		return map;
	}
}
