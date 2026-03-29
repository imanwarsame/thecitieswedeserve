import { useId, useMemo } from 'react';
import {
	Area,
	AreaChart,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { useSimulation } from '../hooks/useSimulation';
import styles from './EnergyDashboard.module.css';

function fmt(n: number, decimals = 1): string {
	if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(decimals)}k`;
	return n.toFixed(decimals);
}

function pct(n: number): string {
	return `${(n * 100).toFixed(0)}%`;
}

const tipStyle = {
	border: '1px solid hsl(220 13% 91%)',
	borderRadius: 5,
	fontSize: 9,
	padding: '3px 6px',
	background: 'hsl(0 0% 100% / 0.96)',
	boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
};

export function EnergyBar() {
	const stabGradId = `energy-stab-${useId().replace(/:/g, '')}`;
	const { state } = useSimulation();
	const { energy, history } = state;

	const stabilitySeries = useMemo(() => {
		const tail = history.slice(-36);
		if (tail.length >= 2) {
			return tail.map((r, i) => ({ i, s: r.energy.gridStability }));
		}
		const s = energy.gridStability;
		return [
			{ i: 0, s },
			{ i: 1, s },
		];
	}, [history, energy.gridStability]);

	const stabilityClass =
		energy.gridStability < 0.9 ? styles.warn :
			energy.gridStability >= 1.0 ? styles.ok : '';

	return (
		<div className={styles.dashboard}>
			<span className={styles.separator} />

			<div className={styles.block}>
				<span className={styles.blockLabel}>MW</span>
				<div className={styles.metric}>
					<span className={styles.label}>D</span>
					<span className={`${styles.value} ${styles.warn}`}>{fmt(Math.max(0, energy.totalDemandMWh))}</span>
				</div>
				<div className={styles.metric}>
					<span className={styles.label}>S</span>
					<span className={`${styles.value} ${styles.ok}`}>{fmt(Math.max(0, energy.totalSupplyMWh))}</span>
				</div>
			</div>

			<span className={styles.separator} />

			<div className={styles.block}>
				<span className={styles.blockLabel}>Stab</span>
				<div className={styles.sparkCol}>
					<AreaChart
						width={90}
						height={28}
						data={stabilitySeries}
						margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
					>
						<defs>
							<linearGradient id={stabGradId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="hsl(220 70% 50%)" stopOpacity={0.2} />
								<stop offset="100%" stopColor="hsl(220 70% 50%)" stopOpacity={0.02} />
							</linearGradient>
						</defs>
						<XAxis dataKey="i" hide />
						<YAxis hide domain={['auto', 'auto']} />
						<Tooltip
							contentStyle={tipStyle}
							formatter={(v) => {
								const n = typeof v === 'number' ? v : Number(v);
								return Number.isFinite(n) ? [pct(n), ''] : ['', ''];
							}}
							labelFormatter={() => 'Grid'}
						/>
						<Area
							type="monotone"
							dataKey="s"
							stroke="hsl(220 70% 46%)"
							strokeWidth={1}
							fill={`url(#${stabGradId})`}
							dot={false}
							isAnimationActive={false}
						/>
					</AreaChart>
					<span className={`${styles.stabilityPct} ${stabilityClass}`}>
						{pct(energy.gridStability)}
					</span>
				</div>
			</div>

			<span className={styles.separator} />

			<div className={styles.metric}>
				<span className={styles.label}>Ren</span>
				<span className={styles.value}>{pct(energy.renewableFraction)}</span>
			</div>

			<span className={styles.separator} />

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
