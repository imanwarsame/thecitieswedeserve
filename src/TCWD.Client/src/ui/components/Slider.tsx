import styles from './Slider.module.css';

interface SliderProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 0.01, onChange }: SliderProps) {
	return (
		<div className={styles.wrapper}>
			<span className={styles.label}>{label}</span>
			<input
				className={styles.input}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={e => onChange(parseFloat(e.target.value))}
			/>
			<span className={styles.value}>{value.toFixed(2)}</span>
		</div>
	);
}
