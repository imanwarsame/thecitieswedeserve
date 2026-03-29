import * as THREE from 'three';
import { IsometricCamera } from './IsometricCamera';
import { EngineConfig } from '../app/config';
import { isTouchDevice } from '../core/Mobile';

const PAN_SPEED = 800;
const ZOOM_SPEED = 0.05;
const SMOOTHING = 0.15;
const ARROW_PAN_SPEED = 600;

const ROTATE_SPEED = 0.004;
const ROTATION_SPRING = 0.08;
const MAX_YAW_OFFSET = Math.PI / 4;   // ±45°
const MAX_PITCH_OFFSET = Math.PI / 8; // ±22.5°

// Touch gesture thresholds
const TOUCH_PAN_SPEED = 1200;
const PINCH_ZOOM_SPEED = 0.008;
const TWO_FINGER_ROTATE_SPEED = 0.006;

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

	// Touch / multi-pointer tracking
	private activePointers = new Map<number, THREE.Vector2>();
	private lastPinchDist = 0;

	private followTarget: THREE.Object3D | null = null;

	// Touch gesture state
	private activeTouches = new Map<number, { x: number; y: number }>();
	private lastPinchDist = 0;
	private lastPinchAngle = 0;
	private lastTouchCenter = new THREE.Vector2();
	private touchGesture: 'none' | 'pan' | 'pinch' = 'none';

	// Reusable vectors to avoid per-frame allocations
	private _lookDir = new THREE.Vector3();
	private _right = new THREE.Vector3();
	private _forward = new THREE.Vector3();
	private _worldUp = new THREE.Vector3(0, 1, 0);
	private _targetWorldPos = new THREE.Vector3();

	// Handlers stored for cleanup
	private onPointerDown: (e: PointerEvent) => void = () => {};
	private onPointerMove: (e: PointerEvent) => void = () => {};
	private onPointerUp: (e: PointerEvent) => void = () => {};
	private onWheel: (e: WheelEvent) => void = () => {};
	private onKeyDown: (e: KeyboardEvent) => void = () => {};
	private onKeyUp: (e: KeyboardEvent) => void = () => {};
	private onContextMenu: (e: Event) => void = () => {};
	private onTouchStart: (e: TouchEvent) => void = () => {};
	private onTouchMove: (e: TouchEvent) => void = () => {};
	private onTouchEnd: (e: TouchEvent) => void = () => {};

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

	/** Smoothly animate zoom to a target level. */
	setTargetZoom(zoom: number): void {
		this.targetZoom = THREE.MathUtils.clamp(
			zoom,
			EngineConfig.camera.minZoom,
			EngineConfig.camera.maxZoom,
		);
	}

	/** Smoothly pan to a world-space ground point. */
	setTargetLookAt(x: number, z: number): void {
		this.targetLookAt.set(x, 0, z);
	}

	/**
	 * Smoothly zoom and pan so the entire scene is visible.
	 * Computes the world-space bounding box of the scene and fits
	 * the camera to show everything.
	 */
	zoomExtents(scene: THREE.Scene): void {
		const box = new THREE.Box3();
		scene.traverse((obj) => {
			if (obj.name === 'shadowGround') return;
			if ((obj as THREE.Mesh).isMesh) {
				box.expandByObject(obj);
			}
		});
		if (box.isEmpty()) return;

		const center = box.getCenter(new THREE.Vector3());
		this.targetLookAt.set(center.x, 0, center.z);

		const size = box.getSize(new THREE.Vector3());
		const worldW = size.x;
		const worldH = size.z;

		const camera = this.isoCamera.getCamera();
		const frustumW = (camera.right - camera.left) / camera.zoom;
		const frustumH = (camera.top - camera.bottom) / camera.zoom;

		// Isometric view rotates ~45°, so bounding box appears as a
		// diamond. Account for this with sqrt(2) plus breathing room.
		const isoScale = Math.SQRT2 * 1.25;
		const zoomX = frustumW / (worldW * isoScale);
		const zoomY = frustumH / (worldH * isoScale);
		const fitZoom = Math.min(zoomX, zoomY);

		this.setTargetZoom(fitZoom);
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
		this.domElement.removeEventListener('touchstart', this.onTouchStart);
		this.domElement.removeEventListener('touchmove', this.onTouchMove);
		this.domElement.removeEventListener('touchend', this.onTouchEnd);
		this.domElement.removeEventListener('touchcancel', this.onTouchEnd);
		window.removeEventListener('keydown', this.onKeyDown);
		window.removeEventListener('keyup', this.onKeyUp);
	}

	private getGroundPlaneAxes(): { right: THREE.Vector3; forward: THREE.Vector3 } {
		const camera = this.isoCamera.getCamera();
		camera.getWorldDirection(this._lookDir);

		this._right.crossVectors(this._lookDir, this._worldUp).normalize();
		this._forward.crossVectors(this._worldUp, this._right).normalize();

		return { right: this._right, forward: this._forward };
	}

	// ── Touch helpers ────────────────────────────────────────

	private getTouchCenter(touches: TouchList): THREE.Vector2 {
		let cx = 0, cy = 0;
		for (let i = 0; i < touches.length; i++) {
			cx += touches[i].clientX;
			cy += touches[i].clientY;
		}
		return new THREE.Vector2(cx / touches.length, cy / touches.length);
	}

	private getTouchDistance(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	private getTouchAngle(touches: TouchList): number {
		if (touches.length < 2) return 0;
		return Math.atan2(
			touches[1].clientY - touches[0].clientY,
			touches[1].clientX - touches[0].clientX,
		);
	}

	// ── Event binding ────────────────────────────────────────

	private bindEvents(): void {
		// ── Mouse / pointer events (desktop) ─────────────────
		this.onPointerDown = (e: PointerEvent) => {
			// ── Touch input ──────────────────────────────────────────────
			if (e.pointerType === 'touch') {
				this.activePointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
				this.domElement.setPointerCapture(e.pointerId);

				if (this.activePointers.size === 1 && this.panEnabled) {
					// Single finger → pan
					this.isDragging = true;
					this.dragButton = 1;
					this.lastPointer.set(e.clientX, e.clientY);
				} else if (this.activePointers.size === 2) {
					// Two fingers → switch to pinch-zoom
					this.isDragging = false;
					this.dragButton = -1;
					this.lastPinchDist = this.getPinchDistance();
				}
				return;
			}

			// ── Mouse input ──────────────────────────────────────────────
			if (e.button === 1 && this.panEnabled) {
				this.isDragging = true;
				this.dragButton = 1;
				this.lastPointer.set(e.clientX, e.clientY);
				this.domElement.setPointerCapture(e.pointerId);
			} else if (e.button === 2) {
				this.isDragging = true;
				this.dragButton = 2;
				this.isRotating = true;
				this.lastPointer.set(e.clientX, e.clientY);
				this.domElement.setPointerCapture(e.pointerId);
			}
		};

		this.onPointerMove = (e: PointerEvent) => {
			// ── Touch input ──────────────────────────────────────────────
			if (e.pointerType === 'touch') {
				this.activePointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));

				if (this.activePointers.size === 2 && this.zoomEnabled) {
					// Pinch-to-zoom
					const dist = this.getPinchDistance();
					if (this.lastPinchDist > 0) {
						const scale = dist / this.lastPinchDist;
						this.targetZoom = THREE.MathUtils.clamp(
							this.targetZoom * scale,
							EngineConfig.camera.minZoom,
							EngineConfig.camera.maxZoom,
						);
					}
					this.lastPinchDist = dist;
					return;
				}

				// Single finger pan
				if (this.isDragging && this.dragButton === 1) {
					const dx = e.clientX - this.lastPointer.x;
					const dy = e.clientY - this.lastPointer.y;
					this.lastPointer.set(e.clientX, e.clientY);

					const panScale = PAN_SPEED / (this.targetZoom * this.domElement.clientHeight);
					const { right, forward } = this.getGroundPlaneAxes();
					this.targetLookAt.addScaledVector(right, -dx * panScale);
					this.targetLookAt.addScaledVector(forward, dy * panScale);
				}
				return;
			}

			// ── Mouse input ──────────────────────────────────────────────
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

		this.onPointerUp = (e: PointerEvent) => {
			// ── Touch cleanup ────────────────────────────────────────────
			if (e.pointerType === 'touch') {
				this.activePointers.delete(e.pointerId);
				if (this.activePointers.size < 2) {
					this.lastPinchDist = 0;
				}
				if (this.activePointers.size === 1) {
					// Went from pinch back to 1 finger → resume pan
					const [remaining] = this.activePointers.values();
					this.isDragging = true;
					this.dragButton = 1;
					this.lastPointer.copy(remaining);
				} else if (this.activePointers.size === 0) {
					this.isDragging = false;
					this.dragButton = -1;
				}
				return;
			}

			// ── Mouse cleanup ────────────────────────────────────────────
			if (this.dragButton === 2) {
				this.isRotating = false;
			}
			this.isDragging = false;
			this.dragButton = -1;
		};

		this.onWheel = (e: WheelEvent) => {
			if (!this.zoomEnabled) return;
			e.preventDefault();

			// Clamp deltaY to ±1 to tame trackpad momentum / fast scrolling
			const clamped = THREE.MathUtils.clamp(e.deltaY, -60, 60) / 60;
			const zoomDelta = -clamped * ZOOM_SPEED;
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

		// ── Touch events (mobile) ────────────────────────────
		this.onTouchStart = (e: TouchEvent) => {
			e.preventDefault(); // prevent scroll / zoom by browser

			const touches = e.touches;
			for (let i = 0; i < touches.length; i++) {
				this.activeTouches.set(touches[i].identifier, {
					x: touches[i].clientX,
					y: touches[i].clientY,
				});
			}

			if (touches.length === 1) {
				// Single finger — pan
				this.touchGesture = 'pan';
				this.lastTouchCenter.set(touches[0].clientX, touches[0].clientY);
			} else if (touches.length >= 2) {
				// Two+ fingers — pinch zoom + rotate
				this.touchGesture = 'pinch';
				this.lastPinchDist = this.getTouchDistance(touches);
				this.lastPinchAngle = this.getTouchAngle(touches);
				this.lastTouchCenter = this.getTouchCenter(touches);
				this.isRotating = true;
			}
		};

		this.onTouchMove = (e: TouchEvent) => {
			e.preventDefault();
			const touches = e.touches;

			if (this.touchGesture === 'pan' && touches.length === 1) {
				// Single-finger pan
				if (!this.panEnabled) return;
				const dx = touches[0].clientX - this.lastTouchCenter.x;
				const dy = touches[0].clientY - this.lastTouchCenter.y;
				this.lastTouchCenter.set(touches[0].clientX, touches[0].clientY);

				const panScale = TOUCH_PAN_SPEED / (this.targetZoom * this.domElement.clientHeight);
				const { right, forward } = this.getGroundPlaneAxes();
				this.targetLookAt.addScaledVector(right, -dx * panScale);
				this.targetLookAt.addScaledVector(forward, dy * panScale);

			} else if (touches.length >= 2) {
				// Upgrade gesture to pinch if a second finger arrives
				if (this.touchGesture !== 'pinch') {
					this.touchGesture = 'pinch';
					this.lastPinchDist = this.getTouchDistance(touches);
					this.lastPinchAngle = this.getTouchAngle(touches);
					this.lastTouchCenter = this.getTouchCenter(touches);
					this.isRotating = true;
					return;
				}

				// Pinch zoom
				if (this.zoomEnabled) {
					const dist = this.getTouchDistance(touches);
					const delta = dist - this.lastPinchDist;
					this.targetZoom = THREE.MathUtils.clamp(
						this.targetZoom + delta * PINCH_ZOOM_SPEED * this.targetZoom,
						EngineConfig.camera.minZoom,
						EngineConfig.camera.maxZoom,
					);
					this.lastPinchDist = dist;
				}

				// Two-finger rotation
				const angle = this.getTouchAngle(touches);
				const angleDelta = angle - this.lastPinchAngle;
				this.targetRotationYaw = THREE.MathUtils.clamp(
					this.targetRotationYaw + angleDelta / TWO_FINGER_ROTATE_SPEED,
					-MAX_YAW_OFFSET,
					MAX_YAW_OFFSET,
				);
				this.lastPinchAngle = angle;

				// Two-finger pan (center movement)
				if (this.panEnabled) {
					const center = this.getTouchCenter(touches);
					const dx = center.x - this.lastTouchCenter.x;
					const dy = center.y - this.lastTouchCenter.y;
					this.lastTouchCenter.copy(center);

					const panScale = TOUCH_PAN_SPEED / (this.targetZoom * this.domElement.clientHeight);
					const { right, forward } = this.getGroundPlaneAxes();
					this.targetLookAt.addScaledVector(right, -dx * panScale);
					this.targetLookAt.addScaledVector(forward, dy * panScale);
				}
			}
		};

		this.onTouchEnd = (e: TouchEvent) => {
			// Remove ended touches
			const remaining = e.touches;
			this.activeTouches.clear();
			for (let i = 0; i < remaining.length; i++) {
				this.activeTouches.set(remaining[i].identifier, {
					x: remaining[i].clientX,
					y: remaining[i].clientY,
				});
			}

			if (remaining.length === 0) {
				this.touchGesture = 'none';
				this.isRotating = false;
			} else if (remaining.length === 1) {
				// Downgraded from pinch to single-finger pan
				this.touchGesture = 'pan';
				this.isRotating = false;
				this.lastTouchCenter.set(remaining[0].clientX, remaining[0].clientY);
			}
		};

		// Bind desktop events
		this.domElement.addEventListener('pointerdown', this.onPointerDown);
		this.domElement.addEventListener('pointermove', this.onPointerMove);
		this.domElement.addEventListener('pointerup', this.onPointerUp);
		this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
		this.domElement.addEventListener('contextmenu', this.onContextMenu);
		window.addEventListener('keydown', this.onKeyDown);
		window.addEventListener('keyup', this.onKeyUp);

		// Bind touch events
		if (isTouchDevice) {
			this.domElement.addEventListener('touchstart', this.onTouchStart, { passive: false });
			this.domElement.addEventListener('touchmove', this.onTouchMove, { passive: false });
			this.domElement.addEventListener('touchend', this.onTouchEnd);
			this.domElement.addEventListener('touchcancel', this.onTouchEnd);
		}
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

		this.followTarget.getWorldPosition(this._targetWorldPos);
		this.targetLookAt.set(this._targetWorldPos.x, 0, this._targetWorldPos.z);
	}

	private getPinchDistance(): number {
		if (this.activePointers.size < 2) return 0;
		const pts = [...this.activePointers.values()];
		return pts[0].distanceTo(pts[1]);
	}
}
