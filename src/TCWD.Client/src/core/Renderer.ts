import * as THREE from 'three';
import { EngineConfig } from '../app/config';

export class Renderer {
	private renderer!: THREE.WebGLRenderer;
	private backend: 'WebGPU' | 'WebGL2' = 'WebGL2';

	async init(canvas: HTMLCanvasElement): Promise<void> {
		if (EngineConfig.renderer.useWebGPU && 'gpu' in navigator) {
			try {
				const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
				if (adapter) {
					this.backend = 'WebGPU';
					console.log('[Renderer] WebGPU adapter found — but Three.js WebGPU renderer requires additional setup. Falling back to WebGL2 for stability.');
				}
			} catch {
				console.log('[Renderer] WebGPU not available, falling back to WebGL2.');
			}
		}

		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: EngineConfig.renderer.antialias,
			powerPreference: 'high-performance',
		});

		this.renderer.shadowMap.enabled = EngineConfig.renderer.shadows;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.0;
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

		this.backend = 'WebGL2';
		console.log(`[Renderer] Initialized with ${this.backend} backend.`);
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

	getBackend(): string {
		return this.backend;
	}

	getWebGLRenderer(): THREE.WebGLRenderer {
		return this.renderer;
	}
}
