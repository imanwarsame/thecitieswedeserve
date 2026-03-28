import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GrayscaleShader } from './shaders/GrayscaleShader';
import { EngineConfig } from '../app/config';

export class PostProcessing {
	private composer!: EffectComposer;
	private renderPass!: RenderPass;
	private grayscalePass!: ShaderPass;
	private hoverOutlinePass!: OutlinePass;
	private selectOutlinePass!: OutlinePass;
	private bloomPass!: UnrealBloomPass;
	private outputPass!: OutputPass;

	private effects = new Map<string, { pass: { enabled: boolean } }>();

	init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
		this.composer = new EffectComposer(renderer);

		// 1. Render pass
		this.renderPass = new RenderPass(scene, camera);
		this.composer.addPass(this.renderPass);

		// 2. Grayscale pass — desaturate any remaining color
		this.grayscalePass = new ShaderPass(GrayscaleShader);
		this.grayscalePass.uniforms.intensity.value = 1.0;
		this.composer.addPass(this.grayscalePass);
		this.effects.set('grayscale', { pass: this.grayscalePass });

		// 3. Hover outline pass
		const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
		this.hoverOutlinePass = new OutlinePass(resolution, scene, camera);
		this.hoverOutlinePass.edgeStrength = 2.0;
		this.hoverOutlinePass.edgeGlow = 0.5;
		this.hoverOutlinePass.edgeThickness = 1.5;
		this.hoverOutlinePass.pulsePeriod = 0;
		this.hoverOutlinePass.visibleEdgeColor.set(0xdddddd);
		this.hoverOutlinePass.hiddenEdgeColor.set(0x333333);
		this.hoverOutlinePass.usePatternTexture = false;
		this.composer.addPass(this.hoverOutlinePass);
		this.effects.set('hoverOutline', { pass: this.hoverOutlinePass });

		// 4. Selection outline pass
		this.selectOutlinePass = new OutlinePass(resolution, scene, camera);
		this.selectOutlinePass.edgeStrength = 3.5;
		this.selectOutlinePass.edgeGlow = 0.8;
		this.selectOutlinePass.edgeThickness = 1.5;
		this.selectOutlinePass.pulsePeriod = 2.0;
		this.selectOutlinePass.visibleEdgeColor.set(0xffffff);
		this.selectOutlinePass.hiddenEdgeColor.set(0x444444);
		this.selectOutlinePass.usePatternTexture = false;
		this.composer.addPass(this.selectOutlinePass);
		this.effects.set('selectOutline', { pass: this.selectOutlinePass });

		// 5. Bloom pass
		const bloomConfig = EngineConfig.postProcessing.bloom;
		this.bloomPass = new UnrealBloomPass(
			resolution,
			bloomConfig.strength,
			bloomConfig.radius,
			bloomConfig.threshold
		);
		this.bloomPass.enabled = bloomConfig.enabled;
		this.composer.addPass(this.bloomPass);
		this.effects.set('bloom', { pass: this.bloomPass });

		// 6. Output pass — gamma correction / sRGB
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

	getHoverOutlinePass(): OutlinePass {
		return this.hoverOutlinePass;
	}

	getSelectOutlinePass(): OutlinePass {
		return this.selectOutlinePass;
	}

	setBloomParams(strength: number, threshold: number, radius: number): void {
		this.bloomPass.strength = strength;
		this.bloomPass.threshold = threshold;
		this.bloomPass.radius = radius;
	}

	setGrayscaleIntensity(intensity: number): void {
		this.grayscalePass.uniforms.intensity.value = intensity;
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
