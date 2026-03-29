import { useState, useEffect, useCallback } from 'react';
import { useEngine } from '../hooks/useEngine';
import { useSimulation } from '../hooks/useSimulation';
import { TransportMode } from '../../simulation/transport/types';
import { Layers } from 'lucide-react';
import styles from './TransportOverlayPanel.module.css';

const ALL_MODES = Object.values(TransportMode) as TransportMode[];

const MODE_LABELS: Record<TransportMode, string> = {
	[TransportMode.Road]:  'Road',
	[TransportMode.Cycle]: 'Cycle',
	[TransportMode.Metro]: 'Metro',
	[TransportMode.Train]: 'Train',
};

const MODE_COLORS: Record<TransportMode, string> = {
	[TransportMode.Road]:  '#888888',
	[TransportMode.Cycle]: '#66aa55',
	[TransportMode.Metro]: '#5566cc',
	[TransportMode.Train]: '#aa5555',
};

export function TransportOverlayPanel() {
	const engine = useEngine();
	const { state } = useSimulation();
	const transport = state.transport;

	const [panelOpen, setPanelOpen]         = useState(false);
	const [overlayOn, setOverlayOn]         = useState(false);
	const [enabledModes, setEnabledModes]   = useState<Set<TransportMode>>(new Set(ALL_MODES));

	// ── Keyboard shortcut: T to toggle overlay ───────────────────────────────
	const handleKey = useCallback((e: KeyboardEvent) => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.key === 't' || e.key === 'T') {
			setOverlayOn(v => {
				const next = !v;
				engine.getFlowOverlayRenderer().setVisible(next);
				return next;
			});
		}
	}, [engine]);

	useEffect(() => {
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	}, [handleKey]);

	// ── Handlers ─────────────────────────────────────────────────────────────

	const toggleOverlay = () => {
		setOverlayOn(v => {
			const next = !v;
			engine.getFlowOverlayRenderer().setVisible(next);
			if (next) setPanelOpen(true);
			return next;
		});
	};

	const toggleMode = (mode: TransportMode) => {
		setEnabledModes(prev => {
			const next = new Set(prev);
			if (next.has(mode)) {
				next.delete(mode);
			} else {
				next.add(mode);
			}
			engine.getFlowOverlayRenderer().setModeFilter(next);
			return next;
		});
	};

	// ── Derived display values ────────────────────────────────────────────────

	const passengers      = transport?.totalPassengersPerHour ?? 0;
	const congestionPct   = Math.round((transport?.congestionIndex ?? 0) * 100);
	const avgCommute      = Math.round(transport?.averageCommuteMins ?? 0);
	const modalSplit      = transport?.modalSplit ?? {};

	return (
		<div className={styles.root}>
			{/* Toggle button — always visible */}
			<button
				className={`${styles.toggleBtn} ${overlayOn ? styles.toggleBtnActive : ''}`}
				onClick={toggleOverlay}
				onMouseEnter={() => setPanelOpen(true)}
				title="Transport Flow Overlay (T)"
			>
				<Layers size={14} strokeWidth={2} />
				<span>Flow</span>
			</button>

			{/* Panel — shown on hover or when overlay is active */}
			{(panelOpen || overlayOn) && (
				<div
					className={styles.panel}
					onMouseLeave={() => { if (!overlayOn) setPanelOpen(false); }}
				>

					{/* ── Master toggle ────────────────────────────────────── */}
					<div className={styles.section}>
						<span className={styles.sectionTitle}>Population Flow Overlay</span>
						<div className={styles.row}>
							<label className={styles.switchLabel}>
								<input
									type="checkbox"
									checked={overlayOn}
									onChange={toggleOverlay}
									className={styles.checkbox}
								/>
								{overlayOn ? 'On' : 'Off'}
								<span className={styles.hint}> — press T</span>
							</label>
						</div>
					</div>

					{/* ── Mode filters ─────────────────────────────────────── */}
					<div className={styles.section}>
						<span className={styles.sectionTitle}>Modes</span>
						<div className={styles.modeList}>
							{ALL_MODES.map(mode => (
								<label key={mode} className={styles.modeItem}>
									<input
										type="checkbox"
										checked={enabledModes.has(mode)}
										onChange={() => toggleMode(mode)}
										className={styles.checkbox}
									/>
									<span
										className={styles.modeDot}
										style={{ background: MODE_COLORS[mode] }}
									/>
									{MODE_LABELS[mode]}
									{transport && (
										<span className={styles.modeFraction}>
											{Math.round((modalSplit[mode] ?? 0) * 100)}%
										</span>
									)}
								</label>
							))}
						</div>
					</div>

					{/* ── Congestion legend ─────────────────────────────────── */}
					<div className={styles.section}>
						<span className={styles.sectionTitle}>Volume / Congestion</span>
						<div className={styles.legendRow}>
							<span className={styles.legendLabel}>Low</span>
							<div className={styles.legendBar} />
							<span className={styles.legendLabel}>High</span>
						</div>
						<p className={styles.legendHint}>
							Width = volume &nbsp;&bull;&nbsp; Colour = congestion level
						</p>
					</div>

					{/* ── Live stats ────────────────────────────────────────── */}
					{transport && (
						<div className={styles.section}>
							<span className={styles.sectionTitle}>Now</span>
							<div className={styles.statsGrid}>
								<span className={styles.statLabel}>Passengers/hr</span>
								<span className={styles.statValue}>{passengers.toLocaleString()}</span>
								<span className={styles.statLabel}>Congestion</span>
								<span
									className={styles.statValue}
									style={{ color: congestionPct > 60 ? '#c44' : congestionPct > 30 ? '#a83' : '#5a5' }}
								>
									{congestionPct}%
								</span>
								<span className={styles.statLabel}>Avg commute</span>
								<span className={styles.statValue}>{avgCommute} min</span>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
