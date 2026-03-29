import { useState, useEffect } from 'react';
import { useEngine } from '../hooks/useEngine';
import { useMobile } from '../hooks/useMobile';
import { events } from '../../core/Events';
import { X, Trash2 } from 'lucide-react';
import styles from './MobileActions.module.css';

/**
 * Floating action buttons visible only on mobile/touch devices.
 * Replaces keyboard shortcuts (Escape, Delete) with tappable controls.
 */
export function MobileActions() {
	const engine = useEngine();
	const mobile = useMobile();
	const [placementMode, setPlacementMode] = useState<string | null>(null);
	const [hasSelection, setHasSelection] = useState(false);

	useEffect(() => {
		const onModeChanged = (...args: unknown[]) => setPlacementMode(args[0] as string | null);
		const onSelect = () => setHasSelection(true);
		const onDeselect = () => setHasSelection(false);

		events.on('placement:modeChanged', onModeChanged);
		events.on('grid:cellSelected', onSelect);
		events.on('grid:cellDeselected', onDeselect);

		return () => {
			events.off('placement:modeChanged', onModeChanged);
			events.off('grid:cellSelected', onSelect);
			events.off('grid:cellDeselected', onDeselect);
		};
	}, []);

	if (!mobile) return null;

	const showCancel = !!placementMode;
	const showDelete = hasSelection && !placementMode;

	if (!showCancel && !showDelete) return null;

	return (
		<div className={styles.container}>
			{showCancel && (
				<button
					className={styles.fab}
					onClick={() => engine.setPlacementMode(null)}
					aria-label="Cancel placement"
				>
					<X size={20} strokeWidth={2} />
					<span className={styles.label}>Cancel</span>
				</button>
			)}
			{showDelete && (
				<button
					className={`${styles.fab} ${styles.danger}`}
					onClick={() => {
						// Simulate Delete keypress for the entity tooltip handler
						window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
					}}
					aria-label="Remove building"
				>
					<Trash2 size={18} strokeWidth={2} />
					<span className={styles.label}>Remove</span>
				</button>
			)}
		</div>
	);
}
