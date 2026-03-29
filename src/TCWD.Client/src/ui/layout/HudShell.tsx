import { TopBar } from './TopBar';
import { ViewRadiusControl } from '../controls/ViewRadiusControl';
import { TransportOverlayPanel } from '../controls/TransportOverlayPanel';
import styles from './HudShell.module.css';

export function HudShell() {
	return (
		<div className={styles.shell}>
			<TopBar />
			<ViewRadiusControl />
			<TransportOverlayPanel />
		</div>
	);
}
