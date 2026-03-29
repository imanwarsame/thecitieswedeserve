import { useState, useEffect, useRef } from 'react';
import { useEngine } from '../hooks/useEngine';
import { events } from '../../core/Events';
import type { BuildingType } from '../../simulation/bridge/BuildingFactory';
import { BUILDING_LABELS } from '../../simulation/bridge/BuildingFactory';
import { HOUSING_COLORS } from '../../rendering/Palette';
import { Home, Server, Sun, Wind, Flame, Atom, Building2, Store, GraduationCap, Drama, TreePine, Route, TrainFront, Bike, Signpost } from 'lucide-react';
import styles from './BuildToolbar.module.css';

const TOOLS: { type: BuildingType; icon: typeof Home; shortcut: string }[] = [
	{ type: 'housing', icon: Home, shortcut: '1' },
	{ type: 'dataCentre', icon: Server, shortcut: '2' },
	{ type: 'solar', icon: Sun, shortcut: '3' },
	{ type: 'wind', icon: Wind, shortcut: '4' },
	{ type: 'gas', icon: Flame, shortcut: '5' },
	{ type: 'nuclear', icon: Atom, shortcut: '6' },
	{ type: 'office', icon: Building2, shortcut: '7' },
	{ type: 'commercial', icon: Store, shortcut: '8' },
	{ type: 'school', icon: GraduationCap, shortcut: '9' },
	{ type: 'leisure', icon: Drama, shortcut: '0' },
	{ type: 'park', icon: TreePine, shortcut: '-' },
	{ type: 'road' as BuildingType, icon: Route, shortcut: 'r' },
	{ type: 'metro', icon: Signpost, shortcut: 'm' },
	{ type: 'train', icon: TrainFront, shortcut: 't' },
	{ type: 'cyclePath', icon: Bike, shortcut: 'b' },
];

export function BuildToolbar() {
	const engine = useEngine();
	const [active, setActive] = useState<BuildingType | null>(null);
	const [colorIdx, setColorIdx] = useState(0);
	const [showPalette, setShowPalette] = useState(false);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	const pickColor = (idx: number) => {
		setColorIdx(idx);
		engine.setHousingColor(HOUSING_COLORS[idx].hex);
	};

	const onEnterHousing = () => {
		if (hideTimer.current) clearTimeout(hideTimer.current);
		setShowPalette(true);
	};

	const onLeaveHousing = () => {
		hideTimer.current = setTimeout(() => setShowPalette(false), 200);
	};

	const onTapHousing = () => {
		// On touch devices, toggle palette on tap (since hover doesn't exist)
		if ('ontouchstart' in window) {
			setShowPalette(prev => !prev);
		}
	};

	return (
		<div className={styles.wrapper}>
			<div className={styles.toolbar}>
				{TOOLS.map(tool => {
					const Icon = tool.icon;
					const isActive = active === tool.type;
					const isHousing = tool.type === 'housing';

					return (
						<div
							key={tool.type}
							className={styles.toolWrap}
							onMouseEnter={isHousing ? onEnterHousing : undefined}
							onMouseLeave={isHousing ? onLeaveHousing : undefined}
							onTouchEnd={isHousing ? onTapHousing : undefined}
						>
							<button
								className={`${styles.toolBtn} ${isActive ? styles.active : ''}`}
								onClick={() => toggle(tool.type)}
								aria-label={BUILDING_LABELS[tool.type]}
							>
								<Icon size={16} strokeWidth={1.8} />
								{/* colour indicator dot on housing button */}
								{isHousing && (
									<span
										className={styles.colorDot}
										style={{ background: HOUSING_COLORS[colorIdx].css }}
									/>
								)}
								{!isActive && !isHousing && (
									<span className={styles.tooltip}>
										{BUILDING_LABELS[tool.type]}
										<span className={styles.shortcut}>{tool.shortcut}</span>
									</span>
								)}
							</button>

							{/* Colour palette flyout for housing */}
							{isHousing && showPalette && (
								<div
									className={styles.palette}
									onMouseEnter={onEnterHousing}
									onMouseLeave={onLeaveHousing}
								>
									{HOUSING_COLORS.map((c, i) => (
										<button
											key={c.name}
											className={`${styles.swatch} ${i === colorIdx ? styles.swatchActive : ''}`}
											style={{ background: c.css }}
											onClick={() => pickColor(i)}
											aria-label={c.name}
											title={c.name}
										/>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
