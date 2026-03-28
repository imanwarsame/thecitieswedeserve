import { useState, useEffect } from 'react';
import { useEngine } from '../hooks/useEngine';
import { events } from '../../core/Events';
import type { BuildingType } from '../../simulation/bridge/BuildingFactory';
import { BUILDING_LABELS } from '../../simulation/bridge/BuildingFactory';
import { Home, Server, Sun, Wind, Flame, Atom } from 'lucide-react';
import styles from './BuildToolbar.module.css';

const TOOLS: { type: BuildingType; icon: typeof Home; shortcut: string }[] = [
	{ type: 'housing', icon: Home, shortcut: '1' },
	{ type: 'dataCentre', icon: Server, shortcut: '2' },
	{ type: 'solar', icon: Sun, shortcut: '3' },
	{ type: 'wind', icon: Wind, shortcut: '4' },
	{ type: 'gas', icon: Flame, shortcut: '5' },
	{ type: 'nuclear', icon: Atom, shortcut: '6' },
];

export function BuildToolbar() {
	const engine = useEngine();
	const [active, setActive] = useState<BuildingType | null>(null);

	useEffect(() => {
		const onModeChanged = (...args: unknown[]) => setActive(args[0] as BuildingType | null);
		events.on('placement:modeChanged', onModeChanged);
		return () => { events.off('placement:modeChanged', onModeChanged); };
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.target as HTMLElement).tagName === 'INPUT') return;

			if (e.key === 'Escape' && active) {
				engine.setPlacementMode(null);
				return;
			}
			const tool = TOOLS.find(t => t.shortcut === e.key);
			if (tool) {
				engine.setPlacementMode(active === tool.type ? null : tool.type);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [active, engine]);

	const toggle = (type: BuildingType) => {
		engine.setPlacementMode(active === type ? null : type);
	};

	return (
		<div className={styles.wrapper}>
			<div className={styles.toolbar}>
				{TOOLS.map(tool => {
					const Icon = tool.icon;
					const isActive = active === tool.type;
					return (
						<button
							key={tool.type}
							className={`${styles.toolBtn} ${isActive ? styles.active : ''}`}
							onClick={() => toggle(tool.type)}
							aria-label={BUILDING_LABELS[tool.type]}
						>
							<Icon size={16} strokeWidth={1.8} />
							<span className={styles.tooltip}>
								{BUILDING_LABELS[tool.type]}
								<span className={styles.shortcut}>{tool.shortcut}</span>
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
