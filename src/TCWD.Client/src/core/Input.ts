import * as THREE from 'three';

/** Max movement (px) before a touch is considered a drag, not a tap. */
const TAP_THRESHOLD = 10;
/** Max ms for a tap; beyond this it's a long-press, not a tap. */
const TAP_TIMEOUT = 300;
/** Max ms between two taps to count as double-tap. */
const DOUBLE_TAP_GAP = 300;

export class Input {
	/** Raw NDC mouse position (instant, for clicks). */
	readonly mouse = new THREE.Vector2();
	/** Smoothed NDC mouse position (lerped, for hover — reduces jitter). */
	readonly smoothMouse = new THREE.Vector2();
	isDown = false;
	shiftDown = false;
	private clicked = false;
	private doubleClicked = false;

	private domElement!: HTMLElement;
	private onMouseMove: (e: MouseEvent) => void = () => {};
	private onMouseDown: (e: MouseEvent) => void = () => {};
	private onMouseUp: (e: MouseEvent) => void = () => {};
	private onDblClick: (e: MouseEvent) => void = () => {};

	// Touch tap detection
	private onTouchStart: (e: TouchEvent) => void = () => {};
	private onTouchEnd: (e: TouchEvent) => void = () => {};
	private touchStartPos = { x: 0, y: 0 };
	private touchStartTime = 0;
	private lastTapTime = 0;

	init(domElement: HTMLElement): void {
		this.domElement = domElement;

		this.onMouseMove = (e: MouseEvent) => {
			const rect = this.domElement.getBoundingClientRect();
			this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		};

		this.onMouseDown = (e: MouseEvent) => {
			if (e.button === 0) {
				this.isDown = true;
				this.clicked = true;
				this.shiftDown = e.shiftKey;
				// Snap smooth mouse to raw on click for precise placement
				this.smoothMouse.copy(this.mouse);
			}
		};

		this.onMouseUp = (e: MouseEvent) => {
			if (e.button === 0) {
				this.isDown = false;
			}
		};

		this.onDblClick = (e: MouseEvent) => {
			if (e.button === 0) {
				this.doubleClicked = true;
			}
		};

		// ── Touch → tap / double-tap ─────────────────────────
		this.onTouchStart = (e: TouchEvent) => {
			if (e.touches.length !== 1) return; // only single-finger taps
			const t = e.touches[0];
			this.touchStartPos = { x: t.clientX, y: t.clientY };
			this.touchStartTime = performance.now();

			// Update NDC position for raycasting
			const rect = this.domElement.getBoundingClientRect();
			this.mouse.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
			this.mouse.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
		};

		this.onTouchEnd = (e: TouchEvent) => {
			if (e.touches.length !== 0) return; // wait until all fingers are up
			const t = e.changedTouches[0];
			const dx = t.clientX - this.touchStartPos.x;
			const dy = t.clientY - this.touchStartPos.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const elapsed = performance.now() - this.touchStartTime;

			if (dist < TAP_THRESHOLD && elapsed < TAP_TIMEOUT) {
				// Update NDC to final position
				const rect = this.domElement.getBoundingClientRect();
				this.mouse.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
				this.mouse.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
				this.smoothMouse.copy(this.mouse);

				const now = performance.now();
				if (now - this.lastTapTime < DOUBLE_TAP_GAP) {
					// Double-tap
					this.doubleClicked = true;
					this.lastTapTime = 0;
				} else {
					// Single tap
					this.clicked = true;
					this.lastTapTime = now;
				}
			}
		};

		this.domElement.addEventListener('mousemove', this.onMouseMove);
		this.domElement.addEventListener('mousedown', this.onMouseDown);
		this.domElement.addEventListener('mouseup', this.onMouseUp);
		this.domElement.addEventListener('dblclick', this.onDblClick);
		this.domElement.addEventListener('touchstart', this.onTouchStart, { passive: true });
		this.domElement.addEventListener('touchend', this.onTouchEnd, { passive: true });
	}

	/** Call once per frame to lerp the smooth mouse toward raw. */
	update(): void {
		this.smoothMouse.lerp(this.mouse, 0.3);
	}

	consumeClick(): boolean {
		if (this.clicked) {
			this.clicked = false;
			return true;
		}
		return false;
	}

	consumeDoubleClick(): boolean {
		if (this.doubleClicked) {
			this.doubleClicked = false;
			return true;
		}
		return false;
	}

	dispose(): void {
		this.domElement?.removeEventListener('mousemove', this.onMouseMove);
		this.domElement?.removeEventListener('mousedown', this.onMouseDown);
		this.domElement?.removeEventListener('mouseup', this.onMouseUp);
		this.domElement?.removeEventListener('dblclick', this.onDblClick);
		this.domElement?.removeEventListener('touchstart', this.onTouchStart);
		this.domElement?.removeEventListener('touchend', this.onTouchEnd);
	}
}
