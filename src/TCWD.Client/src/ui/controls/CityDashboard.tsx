import { useSimulation } from '../hooks/useSimulation';
import styles from './CityDashboard.module.css';

function fmt(n: number, decimals = 1): string {
	if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
	if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(decimals)}k`;
	return n.toFixed(decimals);
}

function pct(n: number): string {
	return `${(n * 100).toFixed(0)}%`;
}

export function CityDashboard() {
	const { state } = useSimulation();
	const { city } = state;

	const healthClass =
		city.healthIndex < 0.5 ? styles.warn :
			city.healthIndex >= 0.7 ? styles.ok : '';

	const crimeClass =
		city.crimeIndex > 0.6 ? styles.warn :
			city.crimeIndex <= 0.3 ? styles.ok : '';

	const tourismClass =
		city.tourismIndex >= 0.6 ? styles.ok :
			city.tourismIndex < 0.3 ? styles.warn : '';

	return (
		<div className={styles.dashboard}>
			<span className={styles.separator} />

			<div className={styles.grid}>
				<div className={styles.metric}>
					<span className={styles.label}>GDP</span>
					<span className={styles.value}>${fmt(city.gdp)}/h</span>
				</div>

				<div className={styles.metric}>
					<span className={styles.label}>Land</span>
					<span className={styles.value}>${fmt(city.landValue)}</span>
				</div>

				<div className={styles.metric}>
					<span className={styles.label}>Tax</span>
					<span className={styles.value}>${fmt(city.taxRevenue)}/h</span>
				</div>

				<div className={styles.metric}>
					<span className={styles.label}>Health</span>
					<span className={`${styles.value} ${healthClass}`}>
						{pct(city.healthIndex)}
					</span>
				</div>

				<div className={styles.metric}>
					<span className={styles.label}>Crime</span>
					<span className={`${styles.value} ${crimeClass}`}>
						{pct(city.crimeIndex)}
					</span>
				</div>

				<div className={styles.metric}>
					<span className={styles.label}>Tour</span>
					<span className={`${styles.value} ${tourismClass}`}>
						{pct(city.tourismIndex)}
					</span>
				</div>
			</div>
		</div>
	);
}
