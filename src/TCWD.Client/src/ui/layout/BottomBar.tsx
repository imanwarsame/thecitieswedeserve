import { ViewRadiusControl } from '../controls/ViewRadiusControl';
import styles from './BottomBar.module.css';

export function BottomBar() {
	return (
		<div className={styles.bar}>
			<div className={styles.viewSlider}>
				<ViewRadiusControl />
			</div>
		</div>
	);
}
