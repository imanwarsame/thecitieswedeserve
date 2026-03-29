import { TransportMode } from './types';
import type { ResolvedRoute } from './types';
import type { TransportNetwork } from './TransportNetwork';
import { MinHeap } from './MinHeap';

// ── Route Resolver ──────────────────────────────────────────
//
// Dijkstra-based shortest path per mode.  Uses an LRU cache to avoid
// re-computing the same origin→destination for the same mode within
// a short time window.

const CACHE_MAX = 2048;

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
		const dist = new Map<number, number>();
		const costMap = new Map<number, number>();
		const prev = new Map<number, number>();
		const heap = new MinHeap<number>();

		dist.set(origin, 0);
		costMap.set(origin, 0);
		heap.push(0, origin);

		while (heap.size > 0) {
			const { priority: d, value: current } = heap.pop()!;

			if (current === destination) {
				return this.buildRoute(origin, destination, mode, prev, d, costMap.get(destination) ?? 0);
			}

			if (d > (dist.get(current) ?? Infinity)) continue;

			const edges = this.network.getEdges(current);
			if (!edges) continue;

			for (const [neighbor, edge] of edges) {
				const weight = edge.weights[mode];
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
		while (current !== undefined) {
			path.push(current);
			current = prev.get(current);
		}
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
