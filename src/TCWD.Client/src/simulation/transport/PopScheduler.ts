import { EntityType } from '../types';
import type { Entity } from '../entities/types';
import type { ArchetypeProfile, Trip } from './types';
import type { RouteResolver } from './RouteResolver';
import { chooseMode } from './ModalSplitter';
import { ARCHETYPES } from './PopArchetypes';

// ── Pop Scheduler ───────────────────────────────────────────
//
// Generates trips for the current hour based on Pop archetype schedules.
// For each archetype whose schedule has an activity at this hour:
//   1. Pick a random origin cell (housing cells).
//   2. Pick a destination cell (attractor cell matching the activity type).
//   3. Resolve routes across all modes, then choose the best via ModalSplitter.
//   4. Emit a Trip.
//
// Population is scaled by the number of housing entities.

/** Simple seeded PRNG (xorshift32). Not crypto — just deterministic. */
function xorshift(seed: number): () => number {
	let s = seed | 1;
	return () => {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}

export class PopScheduler {
	private resolver: RouteResolver;
	private rng: () => number;

	constructor(resolver: RouteResolver, seed = 12345) {
		this.resolver = resolver;
		this.rng = xorshift(seed);
	}

	/**
	 * Generate all trips for the given hour.
	 * @param hour 0–23
	 * @param entities current entity list (used to derive housing cells + attractors)
	 * @param cellMap maps EntityType → array of cell indices where those entities exist
	 * @param populationPerHousing rough population per housing entity (e.g. 500)
	 */
	generateTrips(
		hour: number,
		entities: readonly Entity[],
		cellMap: ReadonlyMap<string, number[]>,
		populationPerHousing: number = 500,
	): Trip[] {
		const housingCells = cellMap.get(EntityType.Housing) ?? [];
		if (housingCells.length === 0) return [];

		const totalPop = housingCells.length * populationPerHousing;
		const trips: Trip[] = [];

		for (const archetype of ARCHETYPES) {
			const popCount = Math.round(totalPop * archetype.fraction);
			this.generateArchetypeTrips(hour, archetype, popCount, housingCells, cellMap, trips);
		}

		return trips;
	}

	private generateArchetypeTrips(
		hour: number,
		archetype: ArchetypeProfile,
		popCount: number,
		housingCells: number[],
		cellMap: ReadonlyMap<string, number[]>,
		out: Trip[],
	): void {
		for (const activity of archetype.schedule) {
			if (activity.hour !== hour && activity.returnHour !== hour) continue;

			const isReturn = activity.returnHour === hour && activity.hour !== hour;
			const destType = activity.destination;
			const destCells = cellMap.get(destType) ?? [];
			if (destCells.length === 0) continue;

			// Scale: not every Pop makes every trip — ~60% participation rate
			const tripCount = Math.round(popCount * 0.6 / archetype.schedule.length);

			for (let i = 0; i < tripCount; i++) {
				const origin = isReturn
					? destCells[Math.floor(this.rng() * destCells.length)]
					: housingCells[Math.floor(this.rng() * housingCells.length)];

				const dest = isReturn
					? housingCells[Math.floor(this.rng() * housingCells.length)]
					: destCells[Math.floor(this.rng() * destCells.length)];

				if (origin === dest) continue;

				const routes = this.resolver.findAllModeRoutes(origin, dest);
				const chosen = chooseMode(archetype, routes);
				if (!chosen) continue;

				out.push({
					archetypeName: archetype.name,
					originCell: origin,
					destCell: dest,
					hour,
					mode: chosen.mode,
					route: chosen.path,
					timeMins: chosen.totalTimeMins,
				});
			}
		}
	}
}
