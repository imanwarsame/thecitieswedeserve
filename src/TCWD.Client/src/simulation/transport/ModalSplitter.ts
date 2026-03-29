import { TransportMode } from './types';
import type { ArchetypeProfile, ResolvedRoute } from './types';

// ── Modal Splitter ──────────────────────────────────────────
//
// Utility-based mode choice.  Given a Pop archetype's weights and
// the set of resolved routes across modes, pick the mode with the
// highest utility.
//
// U(mode) = timePenalty * time + costPenalty * cost + modePref
//
// Higher utility = better.  timePenalty and costPenalty are typically
// negative, so faster/cheaper routes score higher.

export function chooseMode(profile: ArchetypeProfile, routes: readonly ResolvedRoute[]): ResolvedRoute | null {
	if (routes.length === 0) return null;
	if (routes.length === 1) return routes[0];

	let best: ResolvedRoute | null = null;
	let bestUtility = -Infinity;

	for (const route of routes) {
		const u = utility(profile, route);
		if (u > bestUtility) {
			bestUtility = u;
			best = route;
		}
	}

	return best;
}

function utility(profile: ArchetypeProfile, route: ResolvedRoute): number {
	const w = profile.weights;
	let u = w.timePenalty * route.totalTimeMins + w.costPenalty * route.totalCost;

	switch (route.mode) {
		case TransportMode.Cycle:
			u += w.cyclePref;
			break;
		case TransportMode.Metro:
		case TransportMode.Train:
			u += w.transitPref;
			break;
	}

	return u;
}
