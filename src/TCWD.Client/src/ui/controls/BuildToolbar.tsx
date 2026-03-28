import { useState, useEffect } from 'react';
import { useEngine } from '../hooks/useEngine';
import { events } from '../../core/Events';
import type { BuildingType } from '../../simulation/bridge/BuildingFactory';
import { BUILDING_LABELS } from '../../simulation/bridge/BuildingFactory';
import styles from './BuildToolbar.module.css';

const BUILDING_TYPES: BuildingType[] = [
	'housing',
	'dataCentre',
	'solar',
	'wind',
	'gas',
	'nuclear',
];

export function BuildToolbar() {
	const engine = useEngine();
	const [active, setActive] = useState<BuildingType | null>(null);

	useEffect(() => {
		const onModeChanged = (...args: unknown[]) => setActive(args[0] as BuildingType | null);
		events.on('placement:modeChanged', onModeChanged);
		return () => { events.off('placement:modeChanged', onModeChanged); };
	}, []);

	// ESC cancels placement
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && active) {
				engine.setPlacementMode(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [active, engine]);

	const toggle = (type: BuildingType) => {
		engine.setPlacementMode(active === type ? null : type);
	};

	return (
		<div className={styles.toolbar}>
			<span className={styles.separator} />
			{BUILDING_TYPES.map(type => (
				<button
					key={type}
					className={`${styles.btn} ${active === type ? styles.active : ''}`}
					onClick={() => toggle(type)}
					title={BUILDING_LABELS[type]}
				>
					{BUILDING_LABELS[type]}
				</button>
			))}
		</div>
	);
}
