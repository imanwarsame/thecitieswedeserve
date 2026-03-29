import { TopBar } from './TopBar';
import { TransportOverlayPanel } from '../controls/TransportOverlayPanel';
import { LayerToggle } from '../controls/LayerToggle';
import styles from './HudShell.module.css';

export function HudShell() {
	return (
		<div className={styles.shell}>
			<TopBar />

			{/* Desktop-only positioned controls */}
			<div className={styles.desktopOnly}>
				<TransportOverlayPanel />
			</div>

			{/* Layer toggle — always available, adapts position via CSS */}
			<LayerToggle />
		</div>
	);
}
