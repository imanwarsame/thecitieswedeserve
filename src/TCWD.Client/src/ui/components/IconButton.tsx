import styles from './IconButton.module.css';

interface IconButtonProps {
	label: string;
	active?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}

export function IconButton({ label, active, onClick, children }: IconButtonProps) {
	return (
		<button
			className={`${styles.button} ${active ? styles.active : ''}`}
			onClick={onClick}
			title={label}
			aria-label={label}
		>
			{children}
		</button>
	);
}
