import type { SimulationState, StepRecord } from './types.ts';

// ── Snapshot (deep clone for safe external consumption) ─────

export function createSnapshot(state: SimulationState): SimulationState {
	return JSON.parse(JSON.stringify(state)) as SimulationState;
}

// ── JSON serialisation ──────────────────────────────────────

export function toJSON(state: SimulationState): string {
	return JSON.stringify(state, null, 2);
}

// ── History trimming ────────────────────────────────────────

export function trimHistory(
	history: StepRecord[],
	maxLength: number
): StepRecord[] {
	if (history.length <= maxLength) return history;
	return history.slice(history.length - maxLength);
}
