import { useWorldClock } from '../hooks/useWorldClock';
import { useTimeController } from '../hooks/useTimeController';
import { useEngine } from '../hooks/useEngine';
import { EnergyBar } from '../controls/EnergyDashboard';
import { CityBar } from '../controls/CityDashboard';
import { SessionControls } from '../controls/SessionControls';
import { SeasonControls } from '../controls/SeasonControls';
import { formatWorldHour } from '../utils/formatWorldHour';
import { Play, Pause, Clock, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import styles from './TopBar.module.css';

const SPEED_PRESETS = [
	{ label: 'x1', value: 1 },
	{ label: 'x2', value: 2 },
	{ label: 'x4', value: 4 },
];

export function TopBar() {
	const { hour, phase, dayCount } = useWorldClock();
	const { paused, speed, tc } = useTimeController();
	const engine = useEngine();

	const handleClearAll = useCallback(() => {
		if (!window.confirm('Clear everything and start from a blank slate?')) return;
		engine.clearAll();
	}, [engine]);

	return (
		<>
			<div className={styles.topBar}>
				{/* Row 1 — playback controls + time + session */}
				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<button
							className={styles.iconBtn}
							onClick={() => paused ? tc.play() : tc.pause()}
							title={paused ? 'Play (Space)' : 'Pause (Space)'}
						>
							{paused
								? <Play size={18} strokeWidth={2} />
								: <Pause size={18} strokeWidth={2} />
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
							<Clock size={15} strokeWidth={2} />
							{formatWorldHour(hour)}
						</span>

						<span className={styles.phase}>{phase}</span>

						<span className={styles.day}>D{dayCount + 1}</span>

						<SeasonControls />
					</div>

					<div className={styles.rowRight}>
						<button
							className={styles.iconBtn}
							onClick={handleClearAll}
							title="Clear All"
						>
							<Trash2 size={18} strokeWidth={2} />
						</button>
						<SessionControls />
					</div>
				</div>
			</div>

			{/* Info bars — stacked top-right */}
			<div className={`${styles.floatingBar} ${styles.floatingBarRight}`}>
				<div className={`${styles.row} ${styles.rowEnd}`}>
					<div className={styles.rowFull}><EnergyBar /></div>
				</div>
				<div className={`${styles.row} ${styles.rowEnd}`}>
					<div className={styles.rowFull}><CityBar /></div>
				</div>
			</div>
		</>
	);
}
