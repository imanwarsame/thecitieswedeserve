import * as THREE from 'three';
import { EngineConfig } from '../app/config';

export class Renderer {
	private renderer!: THREE.WebGLRenderer;

	async init(canvas: HTMLCanvasElement): Promise<void> {
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: EngineConfig.renderer.antialias,
			powerPreference: 'high-performance',
		});

		this.renderer.shadowMap.enabled = EngineConfig.renderer.shadows;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.NoToneMapping;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, EngineConfig.renderer.maxPixelRatio));
		this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

		console.log('[Renderer] Initialized (WebGL2).');
	}

	render(scene: THREE.Scene, camera: THREE.Camera): void {
		this.renderer.render(scene, camera);
	}

	resize(width: number, height: number): void {
		this.renderer.setSize(width, height);
	}

	dispose(): void {
		this.renderer?.dispose();
		console.log('[Renderer] Disposed.');
	}

	getWebGLRenderer(): THREE.WebGLRenderer {
		return this.renderer;
	}
}
