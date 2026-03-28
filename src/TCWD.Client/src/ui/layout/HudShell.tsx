import { TopBar } from './TopBar';
import styles from './HudShell.module.css';

export function HudShell() {
	return (
		<div className={styles.shell}>
			<TopBar />
		</div>
	);
}
