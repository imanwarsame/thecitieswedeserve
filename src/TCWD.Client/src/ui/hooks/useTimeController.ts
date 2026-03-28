import { useState, useEffect } from 'react';
import { useEngine } from './useEngine';

export function useTimeController() {
	const engine = useEngine();
	const tc = engine.getTimeController();
	const [paused, setPaused] = useState(tc.isPaused());
	const [speed, setSpeed] = useState(tc.getSpeed());

	useEffect(() => {
		const ev = engine.getEvents();
		const onPause = () => setPaused(true);
		const onResume = () => setPaused(false);
		const onScale = (s: unknown) => setSpeed(s as number);

		ev.on('time:paused', onPause);
		ev.on('time:resumed', onResume);
		ev.on('time:scaleChanged', onScale);

		return () => {
			ev.off('time:paused', onPause);
			ev.off('time:resumed', onResume);
			ev.off('time:scaleChanged', onScale);
		};
	}, [engine]);

	return { paused, speed, tc };
}
