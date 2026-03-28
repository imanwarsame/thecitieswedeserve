import { useTimeController } from '../hooks/useTimeController';
import { useSimulation } from '../hooks/useSimulation';
import { IconButton } from '../components/IconButton';
import styles from './TimeControls.module.css';

const SPEED_PRESETS = [
	{ label: 'x1', value: 1 },
	{ label: 'x2', value: 2 },
	{ label: 'x4', value: 4 },
];

export function TimeControls() {
	const { paused, speed, tc } = useTimeController();
	const { state } = useSimulation();
	const { clock } = state;

	return (
		<div className={styles.controls}>
			<IconButton
				label={paused ? 'Play' : 'Pause'}
				onClick={() => paused ? tc.play() : tc.pause()}
			>
				{paused ? '\u25B6' : '\u23F8'}
			</IconButton>

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

			<span className={styles.simInfo}>
				Y{clock.year} D{clock.day + 1} T{clock.tick}
			</span>
		</div>
	);
}
