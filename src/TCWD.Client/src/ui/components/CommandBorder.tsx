import { useState, useEffect } from 'react';
import { useEngine } from '../hooks/useEngine';
import { events } from '../../core/Events';
import { BUILDING_LABELS } from '../../simulation/bridge/BuildingFactory';
import type { BuildingType } from '../../simulation/bridge/BuildingFactory';
import styles from './CommandBorder.module.css';

export function CommandBorder() {
	const engine = useEngine();
	const [mode, setMode] = useState<BuildingType | null>(null);

	useEffect(() => {
		const onChanged = (...args: unknown[]) => setMode(args[0] as BuildingType | null);
		events.on('placement:modeChanged', onChanged);

		// Sync initial state
		setMode(engine.getPlacementMode());

		return () => { events.off('placement:modeChanged', onChanged); };
	}, [engine]);

	return (
		<div className={`${styles.border} ${mode ? styles.visible : ''}`}>
			{mode && (
				<div className={styles.hint}>
					Placing: {BUILDING_LABELS[mode]}
					<span className={styles.esc}>ESC</span>
				</div>
			)}
		</div>
	);
}
