import { useState } from 'react';
import { Flower2, Sun, Leaf, Snowflake, type LucideIcon } from 'lucide-react';
import { useEngine } from '../hooks/useEngine';
import { Tooltip } from '../components/Tooltip';
import styles from './SeasonControls.module.css';

/** Day-of-year for each season preset. */
const SEASONS: { label: string; day: number; icon: LucideIcon }[] = [
	{ label: 'Spring', day: 79, icon: Flower2 },    // ~Mar 20
	{ label: 'Summer', day: 172, icon: Sun },        // ~Jun 21
	{ label: 'Autumn', day: 265, icon: Leaf },       // ~Sep 22
	{ label: 'Winter', day: 355, icon: Snowflake },  // ~Dec 21
];

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
				<Tooltip key={s.label} content={s.label}>
					<button
						className={`${styles.seasonBtn} ${active === s.day ? styles.seasonActive : ''}`}
						onClick={() => handleClick(s.day)}
					>
						<s.icon size={14} />
					</button>
				</Tooltip>
			))}
		</div>
	);
}
