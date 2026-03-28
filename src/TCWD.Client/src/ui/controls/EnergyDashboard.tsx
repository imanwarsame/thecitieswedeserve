import { useSimulation } from '../hooks/useSimulation';
import styles from './EnergyDashboard.module.css';

function fmt(n: number, decimals = 1): string {
	if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(decimals)}k`;
	return n.toFixed(decimals);
}

function pct(n: number): string {
	return `${(n * 100).toFixed(0)}%`;
}

export function EnergyDashboard() {
	const { state } = useSimulation();
	const { energy } = state;

	const stabilityClass =
		energy.gridStability < 0.9 ? styles.warn :
			energy.gridStability >= 1.0 ? styles.ok : '';

	return (
		<div className={styles.dashboard}>
			<span className={styles.separator} />

			<div className={styles.metric}>
				<span className={styles.label}>Demand</span>
				<span className={styles.value}>{fmt(energy.totalDemandMWh)} MW</span>
			</div>

			<div className={styles.metric}>
				<span className={styles.label}>Supply</span>
				<span className={styles.value}>{fmt(energy.totalSupplyMWh)} MW</span>
			</div>

			<div className={styles.metric}>
				<span className={styles.label}>Stability</span>
				<span className={`${styles.value} ${stabilityClass}`}>
					{pct(energy.gridStability)}
				</span>
			</div>

			<div className={styles.metric}>
				<span className={styles.label}>Renew</span>
				<span className={styles.value}>{pct(energy.renewableFraction)}</span>
			</div>

			<div className={styles.metric}>
				<span className={styles.label}>CO₂</span>
				<span className={styles.value}>{fmt(energy.totalCarbonTonnes)} t</span>
			</div>

			<div className={styles.metric}>
				<span className={styles.label}>Cost</span>
				<span className={styles.value}>${fmt(energy.operatingCost)}</span>
			</div>
		</div>
	);
}
