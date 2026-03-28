import { EngineConfig } from '../app/config';
import { events } from '../core/Events';

export type TimePhase =
	| 'Night'
	| 'Dawn'
	| 'Morning'
	| 'Midday'
	| 'Afternoon'
	| 'Dusk'
	| 'Evening';

const PHASES: { name: TimePhase; start: number; end: number }[] = [
	{ name: 'Night', start: 0, end: 5 },
	{ name: 'Dawn', start: 5, end: 7 },
	{ name: 'Morning', start: 7, end: 10 },
	{ name: 'Midday', start: 10, end: 14 },
	{ name: 'Afternoon', start: 14, end: 17 },
	{ name: 'Dusk', start: 17, end: 19 },
	{ name: 'Evening', start: 19, end: 21 },
	{ name: 'Night', start: 21, end: 24 },
];

export class WorldClock {
	private currentHour: number;
	private dayLengthInSeconds: number;
	private dayCount = 0;
	private dayOfYear = 79; // default: ~March 20 (spring equinox)
	private lastPhase: TimePhase;
	private lastWholeHour: number;

	constructor() {
		this.currentHour = EngineConfig.world.startHour;
		this.dayLengthInSeconds = EngineConfig.world.dayLengthInSeconds;
		this.lastPhase = this.getPhase();
		this.lastWholeHour = Math.floor(this.currentHour);
	}

	update(delta: number): void {
		const hoursPerSecond = 24 / this.dayLengthInSeconds;
		this.currentHour += delta * hoursPerSecond;

		if (this.currentHour >= 24) {
			this.currentHour -= 24;
			this.dayCount++;
			this.dayOfYear = (this.dayOfYear + 1) % 365;
			this.lastWholeHour = -1; // force hourChanged on wrap
			events.emit('world:newDay', this.dayCount);
		}

		// Emit once per whole-hour crossing (drives simulation tick)
		const wholeHour = Math.floor(this.currentHour);
		if (wholeHour !== this.lastWholeHour) {
			this.lastWholeHour = wholeHour;
			events.emit('world:hourChanged', wholeHour);
		}

		const phase = this.getPhase();
		if (phase !== this.lastPhase) {
			this.lastPhase = phase;
			events.emit('world:phaseChanged', phase);
		}
	}

	getHour(): number {
		return this.currentHour;
	}

	getPhase(): TimePhase {
		for (const phase of PHASES) {
			if (this.currentHour >= phase.start && this.currentHour < phase.end) {
				return phase.name;
			}
		}
		return 'Night';
	}

	getDayCount(): number {
		return this.dayCount;
	}

	setHour(hour: number): void {
		this.currentHour = ((hour % 24) + 24) % 24;
	}

	getNormalizedTime(): number {
		return this.currentHour / 24;
	}

	getDayOfYear(): number {
		return this.dayOfYear;
	}

	setDayOfYear(day: number): void {
		this.dayOfYear = ((day % 365) + 365) % 365;
		events.emit('world:dateChanged', this.dayOfYear);
	}
}
