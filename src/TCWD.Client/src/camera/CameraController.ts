import * as THREE from 'three';
import { IsometricCamera } from './IsometricCamera';
import { EngineConfig } from '../app/config';

const PAN_SPEED = 20;
const ZOOM_SPEED = 0.1;
const SMOOTHING = 0.08;
const ARROW_PAN_SPEED = 15;

const ROTATE_SPEED = 0.004;
const ROTATION_SPRING = 0.08;
const MAX_YAW_OFFSET = Math.PI / 4;   // ±45°
const MAX_PITCH_OFFSET = Math.PI / 8; // ±22.5°

export class CameraController {
	private isoCamera!: IsometricCamera;
	private domElement!: HTMLElement;

	// Pan (look-at target on ground plane)
	private targetLookAt = new THREE.Vector3();
	private currentLookAt = new THREE.Vector3();
	private targetZoom = 1;

	// Elastic rotation
	private rotationYaw = 0;
	private rotationPitch = 0;
	private targetRotationYaw = 0;
	private targetRotationPitch = 0;
	private isRotating = false;

	private panEnabled = true;
	private zoomEnabled = true;

	private isDragging = false;
	private dragButton = -1;
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
		this.targetZoom = isoCamera.getZoom();

		this.bindEvents();
	}

	update(delta: number): void {
		this.handleArrowKeys(delta);
		this.handleFollowTarget();

		// Smooth look-at
		this.currentLookAt.lerp(this.targetLookAt, SMOOTHING);

		// Elastic rotation — springs back to 0 when released
		if (!this.isRotating) {
			this.targetRotationYaw = 0;
			this.targetRotationPitch = 0;
		}
		this.rotationYaw = THREE.MathUtils.lerp(this.rotationYaw, this.targetRotationYaw, ROTATION_SPRING);
		this.rotationPitch = THREE.MathUtils.lerp(this.rotationPitch, this.targetRotationPitch, ROTATION_SPRING);
		if (Math.abs(this.rotationYaw) < 0.0005) this.rotationYaw = 0;
		if (Math.abs(this.rotationPitch) < 0.0005) this.rotationPitch = 0;

		// Apply camera position + orientation
		this.isoCamera.applyLookAt(this.currentLookAt, this.rotationYaw, this.rotationPitch);

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

	/** Returns the ground-plane point the camera is centred on (used for fog). */
	getTargetPosition(): THREE.Vector3 {
		return this.currentLookAt.clone();
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

	private getGroundPlaneAxes(): { right: THREE.Vector3; forward: THREE.Vector3 } {
		const camera = this.isoCamera.getCamera();
		const lookDir = new THREE.Vector3();
		camera.getWorldDirection(lookDir);

		const worldUp = new THREE.Vector3(0, 1, 0);
		const right = new THREE.Vector3().crossVectors(lookDir, worldUp).normalize();
		const forward = new THREE.Vector3().crossVectors(worldUp, right).normalize();

		return { right, forward };
	}

	private bindEvents(): void {
		this.onPointerDown = (e: PointerEvent) => {
			if (e.button === 1 && this.panEnabled) {
				// Middle mouse = pan
				this.isDragging = true;
				this.dragButton = 1;
				this.lastPointer.set(e.clientX, e.clientY);
				this.domElement.setPointerCapture(e.pointerId);
			} else if (e.button === 2) {
				// Right mouse = elastic rotate
				this.isDragging = true;
				this.dragButton = 2;
				this.isRotating = true;
				this.lastPointer.set(e.clientX, e.clientY);
				this.domElement.setPointerCapture(e.pointerId);
			}
		};

		this.onPointerMove = (e: PointerEvent) => {
			if (!this.isDragging) return;

			const dx = e.clientX - this.lastPointer.x;
			const dy = e.clientY - this.lastPointer.y;
			this.lastPointer.set(e.clientX, e.clientY);

			if (this.dragButton === 1) {
				// Pan
				const panScale = PAN_SPEED / (this.targetZoom * this.domElement.clientHeight);
				const { right, forward } = this.getGroundPlaneAxes();

				this.targetLookAt.addScaledVector(right, -dx * panScale);
				this.targetLookAt.addScaledVector(forward, dy * panScale);
			} else if (this.dragButton === 2) {
				// Rotate (elastic)
				this.targetRotationYaw = THREE.MathUtils.clamp(
					this.targetRotationYaw - dx * ROTATE_SPEED,
					-MAX_YAW_OFFSET,
					MAX_YAW_OFFSET
				);
				this.targetRotationPitch = THREE.MathUtils.clamp(
					this.targetRotationPitch + dy * ROTATE_SPEED,
					-MAX_PITCH_OFFSET,
					MAX_PITCH_OFFSET
				);
			}
		};

		this.onPointerUp = () => {
			if (this.dragButton === 2) {
				this.isRotating = false;
			}
			this.isDragging = false;
			this.dragButton = -1;
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
		const { right, forward } = this.getGroundPlaneAxes();

		if (this.keysDown.has('ArrowLeft') || this.keysDown.has('a')) {
			this.targetLookAt.addScaledVector(right, -speed);
		}
		if (this.keysDown.has('ArrowRight') || this.keysDown.has('d')) {
			this.targetLookAt.addScaledVector(right, speed);
		}
		if (this.keysDown.has('ArrowUp') || this.keysDown.has('w')) {
			this.targetLookAt.addScaledVector(forward, speed);
		}
		if (this.keysDown.has('ArrowDown') || this.keysDown.has('s')) {
			this.targetLookAt.addScaledVector(forward, -speed);
		}
	}

	private handleFollowTarget(): void {
		if (!this.followTarget) return;

		const targetWorldPos = new THREE.Vector3();
		this.followTarget.getWorldPosition(targetWorldPos);
		this.targetLookAt.set(targetWorldPos.x, 0, targetWorldPos.z);
	}
}
