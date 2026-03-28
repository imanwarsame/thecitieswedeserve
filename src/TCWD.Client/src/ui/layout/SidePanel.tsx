import { useState } from 'react';
import styles from './SidePanel.module.css';

export function SidePanel() {
	const [collapsed, setCollapsed] = useState(true);

	return (
		<div
			className={`${styles.anchor} ${collapsed ? styles.anchorCollapsed : styles.anchorOpen}`}
		>
			{!collapsed && (
				<div className={styles.panel}>
					<span>No selection</span>
				</div>
			)}
			<button
				type="button"
				className={`${styles.toggle} ${collapsed ? styles.toggleCollapsed : styles.toggleOpen}`}
				onClick={() => setCollapsed(!collapsed)}
				aria-label={collapsed ? 'Open panel' : 'Close panel'}
			>
				{collapsed ? '\u25C0' : '\u25B6'}
			</button>
		</div>
	);
}
