import { useState, useEffect } from 'react';
import { useEngine } from './useEngine';
import { events } from '../../core/Events';
import type { SimulationState } from '../../simulation';

/**
 * React hook that subscribes to `simulation:tick` events and returns
 * the latest SimulationState.  Throttled via rAF to avoid excessive re-renders.
 */
export function useSimulation() {
	const engine = useEngine();
	const bridge = engine.getSimulationBridge();

	const [state, setState] = useState<SimulationState>(bridge.getState());

	useEffect(() => {
		let pending: SimulationState | null = null;
		let rafId = 0;

		const flush = () => {
			if (pending) {
				setState(pending);
				pending = null;
			}
			rafId = 0;
		};

		const onTick = (...args: unknown[]) => {
			pending = args[0] as SimulationState;
			if (!rafId) {
				rafId = requestAnimationFrame(flush);
			}
		};

		events.on('simulation:tick', onTick);
		return () => {
			events.off('simulation:tick', onTick);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, []);

	return { state, bridge };
}
