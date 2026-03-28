import { useState } from 'react';
import { useEngine } from '../hooks/useEngine';
import styles from './SeasonControls.module.css';

/** Day-of-year for each season preset. */
const SEASONS = [
	{ label: 'Spring', day: 79 },   // ~Mar 20
	{ label: 'Summer', day: 172 },   // ~Jun 21
	{ label: 'Autumn', day: 265 },   // ~Sep 22
	{ label: 'Winter', day: 355 },   // ~Dec 21
] as const;

export function SeasonControls() {
	const engine = useEngine();
	const tc = engine.getTimeController();
	const [active, setActive] = useState(tc.getDayOfYear());

	const handleClick = (day: number) => {
		tc.setDayOfYear(day);
		setActive(day);
	};

	return (
		<div className={styles.controls}>
			<span className={styles.label}>Season</span>
			{SEASONS.map(s => (
				<button
					key={s.label}
					className={`${styles.seasonBtn} ${active === s.day ? styles.seasonActive : ''}`}
					onClick={() => handleClick(s.day)}
				>
					{s.label}
				</button>
			))}
		</div>
	);
}
