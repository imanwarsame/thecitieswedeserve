import * as THREE from 'three';
import { Time } from './Time';
import { RenderPipeline } from '../rendering/RenderPipeline';

export type UpdateCallback = (delta: number, unscaledDelta: number) => void;

export class Loop {
	private renderPipeline: RenderPipeline;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private time: Time;

	private running = false;
	private animationFrameId: number | null = null;
	private callbacks: UpdateCallback[] = [];

	constructor(renderPipeline: RenderPipeline, scene: THREE.Scene, camera: THREE.Camera, time: Time) {
		this.renderPipeline = renderPipeline;
		this.scene = scene;
		this.camera = camera;
		this.time = time;
	}

	register(callback: UpdateCallback): void {
		this.callbacks.push(callback);
	}

	unregister(callback: UpdateCallback): void {
		this.callbacks = this.callbacks.filter(cb => cb !== callback);
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.tick();
		console.log('[Loop] Started.');
	}

	stop(): void {
		this.running = false;
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		console.log('[Loop] Stopped.');
	}

	setCamera(camera: THREE.Camera): void {
		this.camera = camera;
	}

	getTime(): Time {
		return this.time;
	}

	private tick = (): void => {
		if (!this.running) return;
		this.animationFrameId = requestAnimationFrame(this.tick);

		this.time.update();

		const delta = this.time.getDelta();
		const unscaledDelta = this.time.getUnscaledDelta();

		for (const callback of this.callbacks) {
			callback(delta, unscaledDelta);
		}

		this.renderPipeline.render(this.scene, this.camera);
	};
}
