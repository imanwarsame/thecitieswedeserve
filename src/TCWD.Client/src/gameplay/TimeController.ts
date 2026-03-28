import { Time } from '../core/Time';
import { events } from '../core/Events';
import { WorldClock } from './WorldClock';

export class TimeController {
	private time: Time;
	private worldClock: WorldClock;

	constructor(time: Time, worldClock: WorldClock) {
		this.time = time;
		this.worldClock = worldClock;
	}

	pause(): void {
		this.time.pause();
		events.emit('time:paused');
	}

	play(): void {
		this.time.resume();
		this.time.setTimeScale(1.0);
		events.emit('time:resumed');
	}

	setSpeed(multiplier: number): void {
		this.time.setTimeScale(multiplier);
		events.emit('time:scaleChanged', multiplier);
	}

	getSpeed(): number {
		return this.time.getTimeScale();
	}

	isPaused(): boolean {
		return this.time.isPaused();
	}

	setWorldHour(hour: number): void {
		this.worldClock.setHour(hour);
	}

	setDayOfYear(day: number): void {
		this.worldClock.setDayOfYear(day);
	}

	getDayOfYear(): number {
		return this.worldClock.getDayOfYear();
	}
}
