import * as THREE from 'three';
import { Renderer } from '../core/Renderer';
import { PostProcessing } from './PostProcessing';
import { EngineConfig } from '../app/config';

export class RenderPipeline {
	private renderer: Renderer;
	private postProcessing: PostProcessing;
	private enabled: boolean;
	/** Overlay scenes rendered after the EffectComposer to bypass all post-effects. */
	private overlayScenes: THREE.Scene[] = [];

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
			// Render overlays AFTER the composer so they are unaffected by GTAO / bloom.
			for (const os of this.overlayScenes) {
				this.postProcessing.renderOverlay(os, camera);
			}
		} else {
			this.renderer.render(scene, camera);
			if (this.overlayScenes.length > 0) {
				const webgl = this.renderer.getWebGLRenderer();
				webgl.autoClearColor = false;
				webgl.autoClearDepth = false;
				for (const os of this.overlayScenes) {
					webgl.render(os, camera);
				}
				webgl.autoClearColor = true;
				webgl.autoClearDepth = true;
			}
		}
	}

	setOverlayScene(scene: THREE.Scene): void {
		if (!this.overlayScenes.includes(scene)) {
			this.overlayScenes.push(scene);
		}
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
