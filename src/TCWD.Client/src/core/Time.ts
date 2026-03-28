const MAX_DELTA = 0.1;

export const TimeScale = {
	PAUSED: 0,
	SLOW_MO: 0.25,
	NORMAL: 1.0,
	FAST: 2.0,
	VERY_FAST: 4.0,
} as const;

export class Time {
	private deltaTime = 0;
	private unscaledDeltaTime = 0;
	private elapsedTime = 0;
	private unscaledElapsedTime = 0;
	private frameCount = 0;
	private timeScale = 1.0;
	private paused = false;
	private lastTime = 0;
	private started = false;

	update(): void {
		const now = performance.now();

		if (!this.started) {
			this.lastTime = now;
			this.started = true;
			return;
		}

		const rawDelta = Math.min((now - this.lastTime) / 1000, MAX_DELTA);
		this.lastTime = now;

		this.unscaledDeltaTime = rawDelta;
		this.unscaledElapsedTime += rawDelta;
		this.frameCount++;

		if (this.paused) {
			this.deltaTime = 0;
		} else {
			this.deltaTime = rawDelta * this.timeScale;
			this.elapsedTime += this.deltaTime;
		}
	}

	getDelta(): number {
		return this.deltaTime;
	}

	getUnscaledDelta(): number {
		return this.unscaledDeltaTime;
	}

	getElapsed(): number {
		return this.elapsedTime;
	}

	getUnscaledElapsed(): number {
		return this.unscaledElapsedTime;
	}

	getFrameCount(): number {
		return this.frameCount;
	}

	pause(): void {
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
	}

	isPaused(): boolean {
		return this.paused;
	}

	setTimeScale(scale: number): void {
		this.timeScale = scale;
	}

	getTimeScale(): number {
		return this.timeScale;
	}
}
