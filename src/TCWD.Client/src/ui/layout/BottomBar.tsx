import { TimeControls } from '../controls/TimeControls';
import { BuildToolbar } from '../controls/BuildToolbar';
import styles from './BottomBar.module.css';

export function BottomBar() {
	return (
		<div className={styles.bar}>
			<TimeControls />
			<BuildToolbar />
		</div>
	);
}
