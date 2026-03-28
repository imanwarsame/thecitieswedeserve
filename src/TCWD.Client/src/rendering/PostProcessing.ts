import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { EngineConfig } from '../app/config';

export class PostProcessing {
	private composer!: EffectComposer;
	private renderPass!: RenderPass;
	private bloomPass!: UnrealBloomPass;
	private outputPass!: OutputPass;

	private effects = new Map<string, { pass: { enabled: boolean }; index: number }>();

	init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
		this.composer = new EffectComposer(renderer);

		this.renderPass = new RenderPass(scene, camera);
		this.composer.addPass(this.renderPass);

		const bloomConfig = EngineConfig.postProcessing.bloom;
		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			bloomConfig.strength,
			bloomConfig.radius,
			bloomConfig.threshold
		);
		this.bloomPass.enabled = bloomConfig.enabled;
		this.composer.addPass(this.bloomPass);
		this.effects.set('bloom', { pass: this.bloomPass, index: 1 });

		this.outputPass = new OutputPass();
		this.composer.addPass(this.outputPass);

		console.log('[PostProcessing] Initialized.');
	}

	render(): void {
		this.composer.render();
	}

	resize(width: number, height: number): void {
		this.composer.setSize(width, height);
	}

	setCamera(camera: THREE.Camera): void {
		this.renderPass.camera = camera;
	}

	setEffectEnabled(name: string, enabled: boolean): void {
		const effect = this.effects.get(name);
		if (effect) {
			effect.pass.enabled = enabled;
		} else {
			console.warn(`[PostProcessing] Unknown effect "${name}".`);
		}
	}

	isEffectEnabled(name: string): boolean {
		return this.effects.get(name)?.pass.enabled ?? false;
	}

	dispose(): void {
		this.composer.dispose();
		console.log('[PostProcessing] Disposed.');
	}
}
