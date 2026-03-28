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
	private lastPhase: TimePhase;

	constructor() {
		this.currentHour = EngineConfig.world.startHour;
		this.dayLengthInSeconds = EngineConfig.world.dayLengthInSeconds;
		this.lastPhase = this.getPhase();
	}

	update(delta: number): void {
		const hoursPerSecond = 24 / this.dayLengthInSeconds;
		this.currentHour += delta * hoursPerSecond;

		if (this.currentHour >= 24) {
			this.currentHour -= 24;
			this.dayCount++;
			events.emit('world:newDay', this.dayCount);
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
}
