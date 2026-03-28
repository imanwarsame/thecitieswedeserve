/** Formats fractional simulation hour (0–24) as HH:MM. */
export function formatWorldHour(hour: number): string {
	const h = Math.floor(hour);
	const m = Math.floor((hour - h) * 60);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
