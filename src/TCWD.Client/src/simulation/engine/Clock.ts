import type { SimulationConfig } from '../config/types.ts';

// ── Serialisable clock snapshot ─────────────────────────────

export interface ClockState {
	readonly tick: number;
	readonly hour: number; // 0–23
	readonly day: number; // 0–(daysPerYear-1)
	readonly year: number; // absolute calendar year
	readonly yearIndex: number; // 0-based offset from startYear
}

// ── Clock ────────────────────────────────────────────────────

export class Clock {
	private _tick = 0;
	private readonly ticksPerDay: number;
	private readonly daysPerYear: number;
	private readonly startYear: number;

	constructor(config: SimulationConfig) {
		this.ticksPerDay = config.ticksPerDay;
		this.daysPerYear = config.daysPerYear;
		this.startYear = config.startYear;
	}

	// ── Derived getters ────────────────────────────────────

	get tick(): number {
		return this._tick;
	}

	get hour(): number {
		return this._tick % this.ticksPerDay;
	}

	get day(): number {
		const ticksPerYear = this.ticksPerDay * this.daysPerYear;
		return Math.floor((this._tick % ticksPerYear) / this.ticksPerDay);
	}

	get year(): number {
		return this.startYear + this.yearIndex;
	}

	get yearIndex(): number {
		const ticksPerYear = this.ticksPerDay * this.daysPerYear;
		return Math.floor(this._tick / ticksPerYear);
	}

	// ── Mutations ──────────────────────────────────────────

	advance(): void {
		this._tick += 1;
	}

	reset(): void {
		this._tick = 0;
	}

	// ── Snapshot ──────────────────────────────────────────

	toState(): ClockState {
		return {
			tick: this.tick,
			hour: this.hour,
			day: this.day,
			year: this.year,
			yearIndex: this.yearIndex
		};
	}
}
