import * as THREE from 'three';
import { EngineConfig } from '../app/config';

const ISO_ANGLE_Y = Math.PI / 4;           // 45 degrees
const ISO_ANGLE_X = Math.atan(1 / Math.sqrt(2)); // ~35.264 degrees (true isometric)
const FRUSTUM_BASE = 10;
const ISO_DISTANCE = 100;

export class IsometricCamera {
	private camera: THREE.OrthographicCamera;
	private zoom: number;

	constructor(width: number, height: number) {
		this.zoom = EngineConfig.camera.zoom;

		const aspect = width / height;
		this.camera = new THREE.OrthographicCamera(
			-FRUSTUM_BASE * aspect,
			FRUSTUM_BASE * aspect,
			FRUSTUM_BASE,
			-FRUSTUM_BASE,
			0.1,
			1000
		);

		this.applyIsometricOrientation();
		this.applyZoom();
	}

	getCamera(): THREE.OrthographicCamera {
		return this.camera;
	}

	setZoom(level: number): void {
		this.zoom = THREE.MathUtils.clamp(
			level,
			EngineConfig.camera.minZoom,
			EngineConfig.camera.maxZoom
		);
		this.applyZoom();
	}

	getZoom(): number {
		return this.zoom;
	}

	resize(width: number, height: number): void {
		const aspect = width / height;
		this.camera.left = -FRUSTUM_BASE * aspect;
		this.camera.right = FRUSTUM_BASE * aspect;
		this.camera.top = FRUSTUM_BASE;
		this.camera.bottom = -FRUSTUM_BASE;
		this.applyZoom();
	}

	/** Position + orient the camera to look at `target` with optional yaw/pitch rotation offsets. */
	applyLookAt(target: THREE.Vector3, yawOffset = 0, pitchOffset = 0): void {
		const yaw = ISO_ANGLE_Y + yawOffset;
		const pitch = THREE.MathUtils.clamp(
			ISO_ANGLE_X + pitchOffset,
			0.15,
			Math.PI / 2 - 0.05
		);

		const dir = new THREE.Vector3(
			Math.sin(yaw) * Math.cos(pitch),
			Math.sin(pitch),
			Math.cos(yaw) * Math.cos(pitch)
		).normalize();

		this.camera.position.copy(target).addScaledVector(dir, ISO_DISTANCE);
		this.camera.lookAt(target);
	}

	private applyIsometricOrientation(): void {
		const dir = new THREE.Vector3(
			Math.sin(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X),
			Math.sin(ISO_ANGLE_X),
			Math.cos(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X)
		).normalize();

		this.camera.position.copy(dir.multiplyScalar(ISO_DISTANCE));
		this.camera.lookAt(0, 0, 0);
	}

	private applyZoom(): void {
		this.camera.zoom = this.zoom;
		this.camera.updateProjectionMatrix();
	}
}
