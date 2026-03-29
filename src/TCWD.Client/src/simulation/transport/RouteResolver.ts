import { TransportMode } from './types';
import type { ResolvedRoute } from './types';
import type { TransportNetwork } from './TransportNetwork';
import { MinHeap } from './MinHeap';

// ── Route Resolver ──────────────────────────────────────────
//
// Dijkstra-based shortest path per mode.  Uses an LRU cache to avoid
// re-computing the same origin→destination for the same mode within
// a short time window.
//
// For Metro and Train modes, walking is limited to first-mile and
// last-mile only: pops may walk one hop from the origin to an adjacent
// transit station, ride explicit transit links, then walk one hop from
// the exit station to the destination.  No walking is permitted in
// between — all intermediate edges must be explicit infrastructure.

const CACHE_MAX = 2048;

/** Walking speed (km/h) used when pops walk to/from transit stations. */
const WALK_SPEED = 5;

interface CacheEntry {
	route: ResolvedRoute | null;
	tick: number;
}

export class RouteResolver {
	private network: TransportNetwork;
	private cache = new Map<string, CacheEntry>();
	private cacheTick = 0;

	constructor(network: TransportNetwork) {
		this.network = network;
	}

	/** Advance cache tick (call once per simulation step). */
	advanceTick(): void {
		this.cacheTick++;
		// Evict stale entries every 64 ticks
		if (this.cacheTick % 64 === 0) this.evict();
	}

	/** Find shortest route for a single mode. Returns null if unreachable. */
	findRoute(origin: number, destination: number, mode: TransportMode): ResolvedRoute | null {
		if (origin === destination) {
			return { mode, path: [origin], totalTimeMins: 0, totalCost: 0 };
		}

		const key = `${origin}-${destination}-${mode}`;
		const cached = this.cache.get(key);
		if (cached && this.cacheTick - cached.tick < 24) {
			return cached.route;
		}

		const route = this.dijkstra(origin, destination, mode);
		this.cache.set(key, { route, tick: this.cacheTick });
		if (this.cache.size > CACHE_MAX) this.evict();
		return route;
	}

	/** Find routes for all available modes. */
	findAllModeRoutes(origin: number, destination: number): ResolvedRoute[] {
		const routes: ResolvedRoute[] = [];
		for (const mode of Object.values(TransportMode)) {
			const r = this.findRoute(origin, destination, mode);
			if (r) routes.push(r);
		}
		return routes;
	}

	/** Clear the cache (e.g. when network topology changes). */
	clearCache(): void {
		this.cache.clear();
	}

	// ── Dijkstra ────────────────────────────────────────────

	private dijkstra(origin: number, destination: number, mode: TransportMode): ResolvedRoute | null {
		const isTransit = mode === TransportMode.Metro || mode === TransportMode.Train;
		const hasStation = isTransit
			? (cell: number) => (mode === TransportMode.Metro
				? this.network.hasMetro(cell)
				: this.network.hasTrain(cell))
			: undefined;

		const dist = new Map<number, number>();
		const costMap = new Map<number, number>();
		const prev = new Map<number, number>();
		const heap = new MinHeap<number>();

		dist.set(origin, 0);
		costMap.set(origin, 0);
		heap.push(0, origin);

		// Transit first-mile: if origin itself is not a station, seed
		// Dijkstra with walking to adjacent station cells so pops can
		// reach the transit network in one hop.
		if (hasStation && !hasStation(origin)) {
			const originEdges = this.network.getEdges(origin);
			if (originEdges) {
				for (const [neighbor, edge] of originEdges) {
					if (!edge.isVirtual && hasStation(neighbor)) {
						const distKm = edge.distanceM / 1000;
						const walkTime = (distKm / WALK_SPEED) * 60;
						if (walkTime < (dist.get(neighbor) ?? Infinity)) {
							dist.set(neighbor, walkTime);
							costMap.set(neighbor, 0);
							prev.set(neighbor, origin);
							heap.push(walkTime, neighbor);
						}
					}
				}
			}
		}

		while (heap.size > 0) {
			const { priority: d, value: current } = heap.pop()!;

			if (current === destination) {
				return this.buildRoute(origin, destination, mode, prev, d, costMap.get(destination) ?? 0);
			}

			if (d > (dist.get(current) ?? Infinity)) continue;

			const edges = this.network.getEdges(current);
			if (!edges) continue;

			for (const [neighbor, edge] of edges) {
				let weight = edge.weights[mode];

				// Transit last-mile: allow walking from a station to the
				// destination cell if it is adjacent — no other walking
				// is permitted inside the main Dijkstra traversal.
				if (!weight && hasStation && !edge.isVirtual &&
					neighbor === destination && hasStation(current)) {
					const distKm = edge.distanceM / 1000;
					weight = { timeMins: (distKm / WALK_SPEED) * 60, cost: 0 };
				}

				if (!weight) continue; // mode not available on this edge

				const newDist = d + weight.timeMins;
				if (newDist < (dist.get(neighbor) ?? Infinity)) {
					dist.set(neighbor, newDist);
					costMap.set(neighbor, (costMap.get(current) ?? 0) + weight.cost);
					prev.set(neighbor, current);
					heap.push(newDist, neighbor);
				}
			}
		}

		return null; // unreachable
	}

	private buildRoute(
		origin: number,
		destination: number,
		mode: TransportMode,
		prev: Map<number, number>,
		totalTimeMins: number,
		totalCost: number,
	): ResolvedRoute {
		const path: number[] = [];
		let current: number | undefined = destination;
		while (current !== undefined && current !== origin) {
			path.push(current);
			current = prev.get(current);
		}
		path.push(origin);
		path.reverse();
		return { mode, path, totalTimeMins, totalCost };
	}

	private evict(): void {
		const staleThreshold = this.cacheTick - 48;
		for (const [key, entry] of this.cache) {
			if (entry.tick < staleThreshold) {
				this.cache.delete(key);
			}
		}
	}
}
