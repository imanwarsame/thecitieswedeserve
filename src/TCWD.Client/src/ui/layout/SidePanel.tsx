import { useState } from 'react';
import styles from './SidePanel.module.css';

export function SidePanel() {
	const [collapsed, setCollapsed] = useState(true);

	return (
		<>
			{!collapsed && (
				<div className={styles.panel}>
					<span>No selection</span>
				</div>
			)}
			<button
				className={styles.toggle}
				onClick={() => setCollapsed(!collapsed)}
				style={collapsed ? { right: 0 } : undefined}
				aria-label={collapsed ? 'Open panel' : 'Close panel'}
			>
				{collapsed ? '\u25C0' : '\u25B6'}
			</button>
		</>
	);
}
