import { useState, useEffect } from 'react';
import { useEngine } from './useEngine';

export function useWorldClock() {
	const engine = useEngine();
	const [hour, setHour] = useState(0);
	const [phase, setPhase] = useState('');
	const [dayCount, setDayCount] = useState(0);

	useEffect(() => {
		const clock = engine.getWorldClock();
		const ev = engine.getEvents();

		const interval = setInterval(() => {
			setHour(clock.getHour());
			setPhase(clock.getPhase());
			setDayCount(clock.getDayCount());
		}, 1000);

		const onPhase = (newPhase: unknown) => setPhase(newPhase as string);
		ev.on('world:phaseChanged', onPhase);

		return () => {
			clearInterval(interval);
			ev.off('world:phaseChanged', onPhase);
		};
	}, [engine]);

	return { hour, phase, dayCount };
}
