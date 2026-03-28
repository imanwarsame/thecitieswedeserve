import { useWorldClock } from '../hooks/useWorldClock';
import styles from './TopBar.module.css';

function formatHour(hour: number): string {
	const h = Math.floor(hour);
	const m = Math.floor((hour - h) * 60);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TopBar() {
	const { hour, phase, dayCount } = useWorldClock();

	return (
		<div className={styles.bar}>
			<span className={styles.time}>{formatHour(hour)}</span>
			<span className={styles.separator} />
			<span>{phase}</span>
			<span className={styles.separator} />
			<span>Day {dayCount + 1}</span>
		</div>
	);
}
