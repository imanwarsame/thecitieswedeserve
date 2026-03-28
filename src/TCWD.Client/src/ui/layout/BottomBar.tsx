import { TimeControls } from '../controls/TimeControls';
import styles from './BottomBar.module.css';

export function BottomBar() {
	return (
		<div className={styles.bar}>
			<TimeControls />
		</div>
	);
}
