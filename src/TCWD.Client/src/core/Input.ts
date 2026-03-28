import * as THREE from 'three';

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

		this.domElement.addEventListener('mousemove', this.onMouseMove);
		this.domElement.addEventListener('mousedown', this.onMouseDown);
		this.domElement.addEventListener('mouseup', this.onMouseUp);
		this.domElement.addEventListener('dblclick', this.onDblClick);
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
	}
}
