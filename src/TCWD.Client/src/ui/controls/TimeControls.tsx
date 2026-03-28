import { useTimeController } from '../hooks/useTimeController';
import { useWorldClock } from '../hooks/useWorldClock';
import { useSimulation } from '../hooks/useSimulation';
import { IconButton } from '../components/IconButton';
import { Slider } from '../components/Slider';
import styles from './TimeControls.module.css';

const SPEED_PRESETS = [
	{ label: 'x1', value: 1 },
	{ label: 'x2', value: 2 },
	{ label: 'x4', value: 4 },
];

export function TimeControls() {
	const { paused, speed, tc } = useTimeController();
	const { hour } = useWorldClock();
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

			<div className={styles.timeSlider}>
				<Slider
					label=""
					value={hour}
					min={0}
					max={24}
					step={0.25}
					onChange={v => tc.setWorldHour(v)}
				/>
			</div>

			<span className={styles.simInfo}>
				Y{clock.year} D{clock.day + 1} T{clock.tick}
			</span>
		</div>
	);
}
