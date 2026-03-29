import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { GrayscaleShader } from './shaders/GrayscaleShader';
import { EdgeShader } from './shaders/EdgeShader';
import { EngineConfig } from '../app/config';

export class PostProcessing {
	private composer!: EffectComposer;
	private renderPass!: RenderPass;
	private gtaoPass!: GTAOPass;
	private grayscalePass!: ShaderPass;
	private hoverOutlinePass!: OutlinePass;
	private selectOutlinePass!: OutlinePass;
	private edgePass!: ShaderPass;
	private bloomPass!: UnrealBloomPass;
	private outputPass!: OutputPass;
	private depthRenderTarget!: THREE.WebGLRenderTarget;
	private scene!: THREE.Scene;
	private camera!: THREE.Camera;
	private webglRenderer!: THREE.WebGLRenderer;

	private effects = new Map<string, { pass: { enabled: boolean } }>();

	init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
		this.webglRenderer = renderer;
		this.scene = scene;
		this.camera = camera;

		// Use multisampled render target so MSAA works with post-processing
		const size = renderer.getSize(new THREE.Vector2());
		const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
			samples: 4,
		});
		this.composer = new EffectComposer(renderer, renderTarget);

		// Depth render target — feeds the edge detection pass
		this.depthRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
			depthTexture: new THREE.DepthTexture(size.x, size.y),
		});
		this.depthRenderTarget.depthTexture.format = THREE.DepthFormat;
		this.depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;

		// 1. Render pass
		this.renderPass = new RenderPass(scene, camera);
		this.composer.addPass(this.renderPass);

		// 2. GTAO pass — screen-space ambient occlusion for smoother shadows
		const aoConfig = EngineConfig.postProcessing.ao;
		// Half-resolution AO — visually near-identical but ~4× cheaper
		const aoW = Math.ceil(window.innerWidth / 2);
		const aoH = Math.ceil(window.innerHeight / 2);
		this.gtaoPass = new GTAOPass(scene, camera, aoW, aoH);
		this.gtaoPass.output = GTAOPass.OUTPUT.Default;
		this.gtaoPass.enabled = aoConfig.enabled;
		this.gtaoPass.blendIntensity = aoConfig.intensity;
		this.gtaoPass.updateGtaoMaterial({ radius: aoConfig.radius });
		this.composer.addPass(this.gtaoPass);
		this.effects.set('ao', { pass: this.gtaoPass });

		// 3. Edge detection pass — depth Sobel + Laplacian, off by default
		const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
		this.edgePass = new ShaderPass(EdgeShader);
		this.edgePass.uniforms.resolution.value = resolution.clone();
		this.edgePass.uniforms.edgeColor.value = new THREE.Color(0x505050);
		this.edgePass.uniforms.edgeOpacity.value = 0.35;
		this.edgePass.uniforms.depthThreshold.value = 0.0015;
		this.edgePass.enabled = true;
		this.composer.addPass(this.edgePass);
		this.effects.set('edges', { pass: this.edgePass });

		// 4. Grayscale pass — off by default (pastel palette provides colour)
		this.grayscalePass = new ShaderPass(GrayscaleShader);
		this.grayscalePass.uniforms.intensity.value = 0.0;
		this.grayscalePass.enabled = false;
		this.composer.addPass(this.grayscalePass);
		this.effects.set('grayscale', { pass: this.grayscalePass });

		// 5. Hover outline pass
		this.hoverOutlinePass = new OutlinePass(resolution, scene, camera);
		this.hoverOutlinePass.edgeStrength = 2.0;
		this.hoverOutlinePass.edgeGlow = 0.5;
		this.hoverOutlinePass.edgeThickness = 1.5;
		this.hoverOutlinePass.pulsePeriod = 0;
		this.hoverOutlinePass.visibleEdgeColor.set(0x5b9bd5);
		this.hoverOutlinePass.hiddenEdgeColor.set(0x3a6fa0);
		this.hoverOutlinePass.usePatternTexture = false;
		this.composer.addPass(this.hoverOutlinePass);
		this.effects.set('hoverOutline', { pass: this.hoverOutlinePass });

		// 6. Selection outline pass
		this.selectOutlinePass = new OutlinePass(resolution, scene, camera);
		this.selectOutlinePass.edgeStrength = 2.2;
		this.selectOutlinePass.edgeGlow = 0.3;
		this.selectOutlinePass.edgeThickness = 1.2;
		this.selectOutlinePass.pulsePeriod = 5.0;
		this.selectOutlinePass.visibleEdgeColor.set(0x4a86c8);
		this.selectOutlinePass.hiddenEdgeColor.set(0x2d5a8a);
		this.selectOutlinePass.usePatternTexture = false;
		this.composer.addPass(this.selectOutlinePass);
		this.effects.set('selectOutline', { pass: this.selectOutlinePass });

		// 7. Bloom pass
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

		// 8. Output pass — gamma correction / sRGB
		this.outputPass = new OutputPass();
		this.composer.addPass(this.outputPass);

		console.log('[PostProcessing] Initialized.');
	}

	render(): void {
		// If edge pass is active, render a depth-only pass first
		if (this.edgePass.enabled) {
			const renderer = this.composer.renderer;
			const oldTarget = renderer.getRenderTarget();
			renderer.setRenderTarget(this.depthRenderTarget);
			renderer.render(this.scene, this.camera);
			renderer.setRenderTarget(oldTarget);

			this.edgePass.uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
		}

		this.composer.render();
	}

	/**
	 * Render an overlay scene directly onto the canvas AFTER the EffectComposer
	 * has finished, bypassing all post-processing passes (GTAO, bloom, etc.).
	 * autoClear is disabled so the composed image is preserved underneath.
	 */
	renderOverlay(overlayScene: THREE.Scene, camera: THREE.Camera): void {
		this.webglRenderer.autoClearColor = false;
		this.webglRenderer.autoClearDepth = false;
		this.webglRenderer.render(overlayScene, camera);
		this.webglRenderer.autoClearColor = true;
		this.webglRenderer.autoClearDepth = true;
	}

	resize(width: number, height: number): void {
		this.composer.setSize(width, height);
		this.gtaoPass.setSize(Math.ceil(width / 2), Math.ceil(height / 2));

		this.depthRenderTarget.setSize(width, height);
		this.edgePass.uniforms.resolution.value.set(width, height);
	}

	setCamera(camera: THREE.Camera): void {
		this.renderPass.camera = camera;
		this.camera = camera;
	}

	getHoverOutlinePass(): OutlinePass {
		return this.hoverOutlinePass;
	}

	getSelectOutlinePass(): OutlinePass {
		return this.selectOutlinePass;
	}

	setAoParams(radius: number, intensity: number): void {
		this.gtaoPass.updateGtaoMaterial({ radius });
		this.gtaoPass.blendIntensity = intensity;
	}

	setBloomParams(strength: number, threshold: number, radius: number): void {
		this.bloomPass.strength = strength;
		this.bloomPass.threshold = threshold;
		this.bloomPass.radius = radius;
	}

	setEdgeParams(opacity: number, color?: number): void {
		this.edgePass.uniforms.edgeOpacity.value = opacity;
		if (color !== undefined) {
			(this.edgePass.uniforms.edgeColor.value as THREE.Color).set(color);
		}
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
		this.depthRenderTarget?.dispose();
		this.composer.dispose();
		console.log('[PostProcessing] Disposed.');
	}
}
