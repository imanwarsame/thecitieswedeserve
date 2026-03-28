import { useState, useEffect } from 'react';
import { useEngine } from '../hooks/useEngine';
import styles from './MaterialDebugPanel.module.css';

export function MaterialDebugPanel() {
	const engine = useEngine();
	const registry = engine.getMaterialRegistry();
	const [, setTick] = useState(0);

	// Refresh stats periodically
	useEffect(() => {
		const id = setInterval(() => setTick(t => t + 1), 1000);
		return () => clearInterval(id);
	}, []);

	const keys = registry.keys();

	return (
		<div className={styles.section}>
			<span className={styles.sectionTitle}>Materials</span>
			<div className={styles.stat}>
				<span>Registered</span>
				<span>{keys.length}</span>
			</div>
			<div className={styles.stat}>
				<span>Cloned (active)</span>
				<span>{registry.getClonedCount()}</span>
			</div>
			<div className={styles.swatches}>
				{keys.map(key => (
					<div key={key} className={styles.swatch}>
						<span
							className={styles.color}
							style={{ backgroundColor: `#${registry.get(key).color.getHexString()}` }}
						/>
						<span>{key}</span>
					</div>
				))}
			</div>
		</div>
	);
}
