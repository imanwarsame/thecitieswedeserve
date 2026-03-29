import { useState, useEffect, useCallback, useRef } from 'react';
import { useEngine } from '../hooks/useEngine';
import { Layers } from 'lucide-react';
import styles from './LayerToggle.module.css';

/**
 * Extensible layer definitions.
 * Each entry drives a toggle row in the popover.
 * `key` is used for state; `onToggle` receives the engine + new value.
 */
interface LayerDef {
	key: string;
	label: string;
	shortcut?: string;
	defaultOn: boolean;
	onToggle: (engine: ReturnType<typeof useEngine>, on: boolean) => void;
}

const LAYERS: LayerDef[] = [
	{
		key: 'flow',
		label: 'Population Flow',
		shortcut: 'F',
		defaultOn: false,
		onToggle: (engine, on) => engine.getFlowOverlayRenderer().setVisible(on),
	},
	{
		key: 'landUse',
		label: 'Land Use',
		shortcut: 'L',
		defaultOn: false,
		onToggle: (engine, on) => {
			const zone = engine.getZoneOverlayRenderer();
			zone.setMode('landUse');
			zone.setVisible(on);
		},
	},
	{
		key: 'energyUse',
		label: 'Energy Use',
		shortcut: 'E',
		defaultOn: false,
		onToggle: (engine, on) => {
			const zone = engine.getZoneOverlayRenderer();
			zone.setMode('energyUse');
			zone.setVisible(on);
		},
	},
];

export function LayerToggle() {
	const engine = useEngine();
	const [panelOpen, setPanelOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	// State map: key → on/off
	const [layerState, setLayerState] = useState<Record<string, boolean>>(
		() => Object.fromEntries(LAYERS.map(l => [l.key, l.defaultOn])),
	);

	const anyOn = Object.values(layerState).some(Boolean);

	// Close panel when tapping/clicking outside
	useEffect(() => {
		if (!panelOpen) return;
		const handleOutside = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setPanelOpen(false);
			}
		};
		window.addEventListener('pointerdown', handleOutside);
		return () => window.removeEventListener('pointerdown', handleOutside);
	}, [panelOpen]);

	/** Zone layers share a single renderer — enabling one must disable the other. */
	const ZONE_KEYS = new Set(['landUse', 'energyUse']);

	const applyToggle = (prev: Record<string, boolean>, layer: LayerDef): Record<string, boolean> => {
		const turning = !prev[layer.key];
		const next = { ...prev, [layer.key]: turning };

		// If turning ON a zone layer, turn the sibling zone layer OFF
		if (turning && ZONE_KEYS.has(layer.key)) {
			for (const zk of ZONE_KEYS) {
				if (zk !== layer.key && next[zk]) {
					next[zk] = false;
					const sibling = LAYERS.find(l => l.key === zk);
					if (sibling) sibling.onToggle(engine, false);
				}
			}
		}

		layer.onToggle(engine, next[layer.key]);
		return next;
	};

	// Keyboard shortcuts
	const handleKey = useCallback((e: KeyboardEvent) => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		for (const layer of LAYERS) {
			if (layer.shortcut && e.key.toUpperCase() === layer.shortcut) {
				setLayerState(prev => applyToggle(prev, layer));
			}
		}
	}, [engine]);

	useEffect(() => {
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	}, [handleKey]);

	const toggleLayer = (layer: LayerDef) => {
		setLayerState(prev => applyToggle(prev, layer));
	};

	return (
		<div className={styles.root} ref={rootRef}>
			<button
				className={`${styles.toggleBtn} ${anyOn ? styles.toggleBtnActive : ''}`}
				onClick={() => setPanelOpen(v => !v)}
				title="Toggle layers"
			>
				<Layers size={14} strokeWidth={2} />
				<span>Layers</span>
			</button>

			{panelOpen && (
				<div className={styles.panel}>
					<p className={styles.panelTitle}>Overlays</p>
					{LAYERS.map(layer => (
						<label key={layer.key} className={styles.layerRow}>
							<input
								type="checkbox"
								checked={layerState[layer.key]}
								onChange={() => toggleLayer(layer)}
							/>
							<span className={styles.layerLabel}>{layer.label}</span>
							{layer.shortcut && (
								<span className={styles.layerHint}>{layer.shortcut}</span>
							)}
						</label>
					))}
				</div>
			)}
		</div>
	);
}
