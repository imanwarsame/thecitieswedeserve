import * as THREE from 'three';

export class Input {
	readonly mouse = new THREE.Vector2();
	isDown = false;
	private clicked = false;

	private domElement!: HTMLElement;
	private onMouseMove: (e: MouseEvent) => void = () => {};
	private onMouseDown: (e: MouseEvent) => void = () => {};
	private onMouseUp: (e: MouseEvent) => void = () => {};

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
			}
		};

		this.onMouseUp = (e: MouseEvent) => {
			if (e.button === 0) {
				this.isDown = false;
			}
		};

		this.domElement.addEventListener('mousemove', this.onMouseMove);
		this.domElement.addEventListener('mousedown', this.onMouseDown);
		this.domElement.addEventListener('mouseup', this.onMouseUp);
	}

	/** Returns true once per click, then resets */
	consumeClick(): boolean {
		if (this.clicked) {
			this.clicked = false;
			return true;
		}
		return false;
	}

	dispose(): void {
		this.domElement?.removeEventListener('mousemove', this.onMouseMove);
		this.domElement?.removeEventListener('mousedown', this.onMouseDown);
		this.domElement?.removeEventListener('mouseup', this.onMouseUp);
	}
}
