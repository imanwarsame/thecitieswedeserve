import { TopBar } from './TopBar';
import { BottomBar } from './BottomBar';
import { SidePanel } from './SidePanel';
import styles from './HudShell.module.css';

export function HudShell() {
	return (
		<div className={styles.shell}>
			<TopBar />
			<div />
			<SidePanel />
			<BottomBar />
		</div>
	);
}
