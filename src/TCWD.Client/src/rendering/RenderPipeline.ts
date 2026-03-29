import * as THREE from 'three';
import { Renderer } from '../core/Renderer';
import { PostProcessing } from './PostProcessing';
import { EngineConfig } from '../app/config';

export class RenderPipeline {
	private renderer: Renderer;
	private postProcessing: PostProcessing;
	private enabled: boolean;
	/** Overlay scene rendered after the EffectComposer to bypass all post-effects. */
	private overlayScene: THREE.Scene | null = null;

	constructor(renderer: Renderer) {
		this.renderer = renderer;
		this.postProcessing = new PostProcessing();
		this.enabled = EngineConfig.postProcessing.enabled;
	}

	init(webglRenderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
		if (this.enabled) {
			this.postProcessing.init(webglRenderer, scene, camera);
		}
	}

	render(scene: THREE.Scene, camera: THREE.Camera): void {
		if (this.enabled) {
			this.postProcessing.render();
			// Render overlay AFTER the composer so it is unaffected by GTAO / bloom.
			if (this.overlayScene) {
				this.postProcessing.renderOverlay(this.overlayScene, camera);
			}
		} else {
			this.renderer.render(scene, camera);
			if (this.overlayScene) {
				const webgl = this.renderer.getWebGLRenderer();
				webgl.autoClearColor = false;
				webgl.autoClearDepth = false;
				webgl.render(this.overlayScene, camera);
				webgl.autoClearColor = true;
				webgl.autoClearDepth = true;
			}
		}
	}

	setOverlayScene(scene: THREE.Scene): void {
		this.overlayScene = scene;
	}

	resize(width: number, height: number): void {
		this.renderer.resize(width, height);
		if (this.enabled) {
			this.postProcessing.resize(width, height);
		}
	}

	setCamera(camera: THREE.Camera): void {
		if (this.enabled) {
			this.postProcessing.setCamera(camera);
		}
	}

	getPostProcessing(): PostProcessing {
		return this.postProcessing;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	dispose(): void {
		if (this.enabled) {
			this.postProcessing.dispose();
		}
	}
}
