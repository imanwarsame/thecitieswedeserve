import * as THREE from 'three';
import { IsometricCamera } from './IsometricCamera';
import { EngineConfig } from '../app/config';

const PAN_SPEED = 20;
const ZOOM_SPEED = 0.1;
const SMOOTHING = 0.08;
const ARROW_PAN_SPEED = 15;

export class CameraController {
	private isoCamera!: IsometricCamera;
	private domElement!: HTMLElement;

	private targetPosition = new THREE.Vector3();
	private currentPosition = new THREE.Vector3();
	private targetZoom = 1;

	private panEnabled = true;
	private zoomEnabled = true;

	private isDragging = false;
	private lastPointer = new THREE.Vector2();
	private keysDown = new Set<string>();

	private followTarget: THREE.Object3D | null = null;

	// Handlers stored for cleanup
	private onPointerDown: (e: PointerEvent) => void = () => {};
	private onPointerMove: (e: PointerEvent) => void = () => {};
	private onPointerUp: () => void = () => {};
	private onWheel: (e: WheelEvent) => void = () => {};
	private onKeyDown: (e: KeyboardEvent) => void = () => {};
	private onKeyUp: (e: KeyboardEvent) => void = () => {};
	private onContextMenu: (e: Event) => void = () => {};

	init(isoCamera: IsometricCamera, domElement: HTMLElement): void {
		this.isoCamera = isoCamera;
		this.domElement = domElement;

		const camera = isoCamera.getCamera();
		this.targetPosition.copy(camera.position);
		this.currentPosition.copy(camera.position);
		this.targetZoom = isoCamera.getZoom();

		this.bindEvents();
	}

	update(delta: number): void {
		this.handleArrowKeys(delta);
		this.handleFollowTarget();

		// Smooth position
		this.currentPosition.lerp(this.targetPosition, SMOOTHING);
		const camera = this.isoCamera.getCamera();
		camera.position.copy(this.currentPosition);

		// Smooth zoom
		const currentZoom = this.isoCamera.getZoom();
		const newZoom = THREE.MathUtils.lerp(currentZoom, this.targetZoom, SMOOTHING);
		this.isoCamera.setZoom(newZoom);
	}

	setTarget(object: THREE.Object3D): void {
		this.followTarget = object;
	}

	clearTarget(): void {
		this.followTarget = null;
	}

	setPanEnabled(enabled: boolean): void {
		this.panEnabled = enabled;
	}

	setZoomEnabled(enabled: boolean): void {
		this.zoomEnabled = enabled;
	}

	dispose(): void {
		this.domElement.removeEventListener('pointerdown', this.onPointerDown);
		this.domElement.removeEventListener('pointermove', this.onPointerMove);
		this.domElement.removeEventListener('pointerup', this.onPointerUp);
		this.domElement.removeEventListener('wheel', this.onWheel);
		this.domElement.removeEventListener('contextmenu', this.onContextMenu);
		window.removeEventListener('keydown', this.onKeyDown);
		window.removeEventListener('keyup', this.onKeyUp);
	}

	private bindEvents(): void {
		this.onPointerDown = (e: PointerEvent) => {
			// Middle mouse (1) or right mouse (2)
			if (!this.panEnabled) return;
			if (e.button === 1 || e.button === 2) {
				this.isDragging = true;
				this.lastPointer.set(e.clientX, e.clientY);
				this.domElement.setPointerCapture(e.pointerId);
			}
		};

		this.onPointerMove = (e: PointerEvent) => {
			if (!this.isDragging) return;

			const dx = e.clientX - this.lastPointer.x;
			const dy = e.clientY - this.lastPointer.y;
			this.lastPointer.set(e.clientX, e.clientY);

			const panScale = PAN_SPEED / (this.targetZoom * this.domElement.clientHeight);

			// Pan in the camera's local XZ plane (isometric-aware)
			const camera = this.isoCamera.getCamera();
			const right = new THREE.Vector3();
			const up = new THREE.Vector3(0, 1, 0);
			camera.getWorldDirection(new THREE.Vector3());
			right.crossVectors(camera.up, new THREE.Vector3().subVectors(new THREE.Vector3(), camera.getWorldDirection(new THREE.Vector3()))).normalize();
			const forward = new THREE.Vector3();
			forward.crossVectors(right, up).normalize();

			this.targetPosition.add(right.multiplyScalar(-dx * panScale));
			this.targetPosition.add(forward.multiplyScalar(dy * panScale));
		};

		this.onPointerUp = () => {
			this.isDragging = false;
		};

		this.onWheel = (e: WheelEvent) => {
			if (!this.zoomEnabled) return;
			e.preventDefault();

			const zoomDelta = -Math.sign(e.deltaY) * ZOOM_SPEED;
			this.targetZoom = THREE.MathUtils.clamp(
				this.targetZoom + zoomDelta * this.targetZoom,
				EngineConfig.camera.minZoom,
				EngineConfig.camera.maxZoom
			);
		};

		this.onKeyDown = (e: KeyboardEvent) => {
			this.keysDown.add(e.key);
		};

		this.onKeyUp = (e: KeyboardEvent) => {
			this.keysDown.delete(e.key);
		};

		this.onContextMenu = (e: Event) => {
			e.preventDefault();
		};

		this.domElement.addEventListener('pointerdown', this.onPointerDown);
		this.domElement.addEventListener('pointermove', this.onPointerMove);
		this.domElement.addEventListener('pointerup', this.onPointerUp);
		this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
		this.domElement.addEventListener('contextmenu', this.onContextMenu);
		window.addEventListener('keydown', this.onKeyDown);
		window.addEventListener('keyup', this.onKeyUp);
	}

	private handleArrowKeys(delta: number): void {
		if (!this.panEnabled) return;

		const speed = (ARROW_PAN_SPEED * delta) / this.targetZoom;
		const camera = this.isoCamera.getCamera();

		const right = new THREE.Vector3();
		const up = new THREE.Vector3(0, 1, 0);
		right.crossVectors(camera.up, new THREE.Vector3().subVectors(new THREE.Vector3(), camera.getWorldDirection(new THREE.Vector3()))).normalize();
		const forward = new THREE.Vector3();
		forward.crossVectors(right, up).normalize();

		if (this.keysDown.has('ArrowLeft') || this.keysDown.has('a')) {
			this.targetPosition.add(right.clone().multiplyScalar(-speed));
		}
		if (this.keysDown.has('ArrowRight') || this.keysDown.has('d')) {
			this.targetPosition.add(right.clone().multiplyScalar(speed));
		}
		if (this.keysDown.has('ArrowUp') || this.keysDown.has('w')) {
			this.targetPosition.add(forward.clone().multiplyScalar(-speed));
		}
		if (this.keysDown.has('ArrowDown') || this.keysDown.has('s')) {
			this.targetPosition.add(forward.clone().multiplyScalar(speed));
		}
	}

	private handleFollowTarget(): void {
		if (!this.followTarget) return;

		const targetWorldPos = new THREE.Vector3();
		this.followTarget.getWorldPosition(targetWorldPos);

		// Offset by the isometric camera direction to center on target
		const camera = this.isoCamera.getCamera();
		const dir = camera.position.clone().normalize();
		this.targetPosition.copy(targetWorldPos.add(dir.multiplyScalar(100)));
	}
}
