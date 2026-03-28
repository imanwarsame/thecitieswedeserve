import { useWorldClock } from '../hooks/useWorldClock';
import { useTimeController } from '../hooks/useTimeController';
import { EnergyDashboard } from '../controls/EnergyDashboard';
import { formatWorldHour } from '../utils/formatWorldHour';
import { Play, Pause, Clock } from 'lucide-react';
import styles from './TopBar.module.css';

const SPEED_PRESETS = [
	{ label: 'x1', value: 1 },
	{ label: 'x2', value: 2 },
	{ label: 'x4', value: 4 },
];

export function TopBar() {
	const { hour, phase, dayCount } = useWorldClock();
	const { paused, speed, tc } = useTimeController();

	return (
		<>
			{/* Left panel — time info + controls */}
			<div className={styles.panelLeft}>
				<button
					className={styles.iconBtn}
					onClick={() => paused ? tc.play() : tc.pause()}
					title={paused ? 'Play (Space)' : 'Pause (Space)'}
				>
					{paused
						? <Play size={12} strokeWidth={2.2} />
						: <Pause size={12} strokeWidth={2.2} />
					}
				</button>

				<div className={styles.speeds}>
					{SPEED_PRESETS.map(p => (
						<button
							key={p.label}
							className={`${styles.speedBtn} ${speed === p.value && !paused ? styles.speedActive : ''}`}
							onClick={() => { tc.play(); tc.setSpeed(p.value); }}
						>
							{p.label}
						</button>
					))}
				</div>

				<span className={styles.sep} />

				<span className={styles.clock}>
					<Clock size={10} strokeWidth={2} />
					{formatWorldHour(hour)}
				</span>

				<span className={styles.phase}>{phase}</span>

				<span className={styles.day}>D{dayCount + 1}</span>
			</div>

			{/* Right panel — energy info */}
			<div className={styles.panelRight}>
				<EnergyDashboard />
			</div>
		</>
	);
}
