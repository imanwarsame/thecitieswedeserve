import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { formatWorldHour } from '../utils/formatWorldHour';
import styles from './Slider02.module.css';

function stepDecimals(step: number): number {
	const s = String(step);
	const i = s.indexOf('.');
	return i < 0 ? 0 : s.length - i - 1;
}

function snapToStep(raw: number, min: number, max: number, step: number): number {
	const stepped = Math.round((raw - min) / step) * step + min;
	const d = stepDecimals(step);
	return Math.max(min, Math.min(max, parseFloat(stepped.toFixed(d))));
}

export interface Slider02Props {
	value: number;
	onChange: (value: number) => void;
	min: number;
	max: number;
	step: number;
	label?: string;
	/** Scales typography (default 0.75 for header). */
	textSize?: number;
	/** Scales track height / thumb (default 0.4 for header). */
	barSize?: number;
	thumbColor?: string;
	trackColor?: string;
	fillColor?: string;
	/** Shown under the value line (e.g. sim Y/D/T). */
	detail?: ReactNode;
	/** Display string for value row and hover preview (default HH:MM for fractional hours). */
	formatDisplay?: (value: number) => string;
	className?: string;
	style?: CSSProperties;
}

export function Slider02({
	value,
	onChange,
	min,
	max,
	step,
	label,
	textSize = 0.75,
	barSize = 0.4,
	thumbColor = '#9a9b9c',
	trackColor = '#e4e4e4',
	fillColor = '#d2d3d4',
	detail,
	formatDisplay = formatWorldHour,
	className,
	style,
}: Slider02Props) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const [hoverOpacity, setHoverOpacity] = useState(0);
	const [hoverLeftPct, setHoverLeftPct] = useState(0);
	const [hoverText, setHoverText] = useState('');

	const rangeSpan = max - min;

	const updateFill = useCallback(() => {
		const wrapper = wrapperRef.current;
		const track = trackRef.current;
		if (!wrapper || !track || rangeSpan <= 0) return;

		const startVal = Math.max(min, Math.min(max, value));
		const startPercent = (startVal - min) / rangeSpan;
		const trackWidth = track.getBoundingClientRect().width;
		const handleHalfWidthPx = 28 * barSize;
		const maxExtend = trackWidth > 0 ? handleHalfWidthPx / trackWidth : 0;
		const extendPercent = maxExtend * (1 - startPercent);
		const fillEnd = Math.min(1, startPercent + extendPercent);

		wrapper.style.setProperty('--fill-start', '0');
		wrapper.style.setProperty('--fill-end', String(fillEnd));
	}, [barSize, max, min, rangeSpan, value]);

	useLayoutEffect(() => {
		updateFill();
	}, [updateFill]);

	useLayoutEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const ro = new ResizeObserver(() => updateFill());
		ro.observe(track);
		return () => ro.disconnect();
	}, [updateFill]);

	const setHoverFromClientX = useCallback(
		(clientX: number) => {
			const input = trackRef.current?.querySelector('input');
			if (!input || rangeSpan <= 0) return;

			const rect = input.getBoundingClientRect();
			const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			const rawVal = min + percent * rangeSpan;
			const finalVal = snapToStep(rawVal, min, max, step);

			const snappedPercent = (finalVal - min) / rangeSpan;
			setHoverLeftPct(snappedPercent * 100);
			setHoverText(formatDisplay(finalVal));
			setHoverOpacity(1);
		},
		[formatDisplay, max, min, rangeSpan, step],
	);

	const onTrackMouseMove = useCallback(
		(e: React.MouseEvent) => setHoverFromClientX(e.clientX),
		[setHoverFromClientX],
	);

	const onTrackMouseLeave = useCallback(() => setHoverOpacity(0), []);

	const onTrackTouchStart = useCallback(
		(e: React.TouchEvent) => {
			const t = e.touches[0];
			if (t) setHoverFromClientX(t.clientX);
		},
		[setHoverFromClientX],
	);

	const onTrackTouchEnd = useCallback(() => setHoverOpacity(0), []);

	const onInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = parseFloat(e.target.value);
			if (Number.isNaN(v)) return;
			const snapped = snapToStep(v, min, max, step);
			onChange(snapped);
		},
		[max, min, onChange, step],
	);

	const wrapperStyle = {
		...style,
		'--text-size': textSize,
		'--bar-size': barSize,
		'--thumb-color': thumbColor,
		'--track-color': trackColor,
		'--fill-color': fillColor,
	} as CSSProperties;

	return (
		<div ref={wrapperRef} className={`${styles.wrapper} ${className ?? ''}`.trim()} style={wrapperStyle}>
			{label ? <div className={styles.labelRow}>{label}</div> : null}
			<div
				ref={trackRef}
				className={styles.inputContainer}
				onMouseMove={onTrackMouseMove}
				onMouseLeave={onTrackMouseLeave}
				onTouchStart={onTrackTouchStart}
				onTouchEnd={onTrackTouchEnd}
			>
				<div className={styles.hoverValue} style={{ left: `${hoverLeftPct}%`, opacity: hoverOpacity }}>
					{hoverText}
				</div>
				<div className={styles.fill} />
				<input
					className={styles.input}
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={onInput}
					aria-label={label || 'Value'}
				/>
			</div>
			<div className={styles.valueRow}>{formatDisplay(value)}</div>
			{detail != null ? <div className={styles.detail}>{detail}</div> : null}
		</div>
	);
}
