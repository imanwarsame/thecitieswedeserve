import { TransportMode } from './types';
import type { Trip, FlowSegment, OccupancyRate, TransportResult } from './types';

// ── Flow Accumulator ────────────────────────────────────────
//
// Aggregates individual trips into per-edge flow segments and
// per-cell occupancy counts.  Also computes summary statistics
// (modal split, avg commute, congestion).

const CONGESTION_THRESHOLD = 200; // trips/hr through a cell before congestion kicks in

export function accumulateFlows(trips: readonly Trip[]): TransportResult {
	// -- Edge flows --
	const edgeMap = new Map<string, { from: number; to: number; mode: TransportMode; count: number }>();
	// -- Cell occupancy --
	const cellCounts = new Map<number, number>();
	// -- Modal split --
	const modeCount: Record<TransportMode, number> = {
		[TransportMode.Road]: 0,
		[TransportMode.Cycle]: 0,
		[TransportMode.Metro]: 0,
		[TransportMode.Train]: 0,
	};

	let totalTime = 0;

	for (const trip of trips) {
		modeCount[trip.mode]++;
		totalTime += trip.timeMins;

		// Walk route edges
		for (let i = 0; i < trip.route.length - 1; i++) {
			const from = trip.route[i];
			const to = trip.route[i + 1];
			const key = `${from}-${to}-${trip.mode}`;
			const existing = edgeMap.get(key);
			if (existing) {
				existing.count++;
			} else {
				edgeMap.set(key, { from, to, mode: trip.mode, count: 1 });
			}
		}

		// Cell occupancy (every cell in the route)
		for (const cell of trip.route) {
			cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
		}
	}

	// -- Build outputs --
	const segments: FlowSegment[] = [];
	for (const entry of edgeMap.values()) {
		segments.push({
			from: entry.from,
			to: entry.to,
			mode: entry.mode,
			tripsPerHour: entry.count,
		});
	}

	const occupancy: OccupancyRate[] = [];
	let congestionSum = 0;
	for (const [cellIndex, count] of cellCounts) {
		occupancy.push({ cellIndex, tripsPerHour: count });
		if (count > CONGESTION_THRESHOLD) {
			congestionSum += (count - CONGESTION_THRESHOLD) / CONGESTION_THRESHOLD;
		}
	}

	const totalPassengers = trips.length;
	const avgCommuteMins = totalPassengers > 0 ? totalTime / totalPassengers : 0;

	// Congestion index: 0 = no congestion, 1 = severe
	const totalCells = cellCounts.size || 1;
	const congestionIndex = Math.min(1, congestionSum / totalCells);

	// Modal split (fractions)
	const modalSplit = {} as Record<TransportMode, number>;
	for (const mode of Object.values(TransportMode)) {
		modalSplit[mode] = totalPassengers > 0 ? modeCount[mode] / totalPassengers : 0;
	}

	return {
		trips,
		segments,
		occupancy,
		modalSplit,
		avgCommuteMins,
		totalPassengers,
		congestionIndex,
	};
}
