import { TopBar } from './TopBar';
import { ViewRadiusControl } from '../controls/ViewRadiusControl';
import styles from './HudShell.module.css';

export function HudShell() {
	return (
		<div className={styles.shell}>
			<TopBar />
			<ViewRadiusControl />
		</div>
	);
}
