import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Palette } from '../rendering/Palette';
import { WorldClock } from '../gameplay/WorldClock';
import type { CelestialBodies } from './CelestialBodies';
import { loadHdr } from '../assets/loaders/HdrLoader';

const LIGHTING_KEYS: {
	hour: number;
	sun: number;
	sunIntensity: number;
	skyColor: number;
	groundColor: number;
	hemiIntensity: number;
}[] = [
	{ hour: 0,  sun: 0x9098b0, sunIntensity: 0.2,  skyColor: 0x788098, groundColor: 0x484e5a, hemiIntensity: 0.18 },
	{ hour: 5,  sun: 0x9098b0, sunIntensity: 0.2,  skyColor: 0x788098, groundColor: 0x484e5a, hemiIntensity: 0.18 },
	{ hour: 6,  sun: 0xc0c0c0, sunIntensity: 0.5,  skyColor: 0xa0a0a0, groundColor: 0x606060, hemiIntensity: 0.25 },
	{ hour: 7,  sun: 0xe0e0e0, sunIntensity: 0.9,  skyColor: 0xc8c8c8, groundColor: 0x808080, hemiIntensity: 0.4 },
	{ hour: 10, sun: Palette.sun, sunIntensity: 1.2, skyColor: Palette.ambient, groundColor: Palette.shadow, hemiIntensity: 0.6 },
	{ hour: 14, sun: Palette.sun, sunIntensity: 1.2, skyColor: Palette.ambient, groundColor: Palette.shadow, hemiIntensity: 0.6 },
	{ hour: 17, sun: 0xe0e0e0, sunIntensity: 1.0,  skyColor: 0xc8c8c8, groundColor: 0x808080, hemiIntensity: 0.4 },
	{ hour: 18, sun: 0xb0b0b0, sunIntensity: 0.5,  skyColor: 0x909090, groundColor: 0x505050, hemiIntensity: 0.25 },
	{ hour: 19, sun: 0x909098, sunIntensity: 0.3,   skyColor: 0x808898, groundColor: 0x485060, hemiIntensity: 0.18 },
	{ hour: 21, sun: 0x9098b0, sunIntensity: 0.2,  skyColor: 0x788098, groundColor: 0x484e5a, hemiIntensity: 0.18 },
	{ hour: 24, sun: 0x9098b0, sunIntensity: 0.2,  skyColor: 0x788098, groundColor: 0x484e5a, hemiIntensity: 0.18 },
];

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Lighting {
	private directional!: THREE.DirectionalLight;
	private fill!: THREE.DirectionalLight;
	private hemisphere!: THREE.HemisphereLight;
	private envMap: THREE.Texture | null = null;
	private worldClock: WorldClock | null = null;
	private celestialBodies: CelestialBodies | null = null;
	/** World-space centre the shadow frustum is anchored to (tracks camera lookAt). */
	private readonly shadowCenter = new THREE.Vector3();

	init(graph: SceneGraph): void {
		// Main directional (sun)
		this.directional = new THREE.DirectionalLight(Palette.sun, 1.2);
		this.directional.position.set(10, 15, 10);
		this.directional.castShadow = true;

		const shadow = this.directional.shadow;
		shadow.mapSize.width = 4096;
		shadow.mapSize.height = 4096;
		shadow.camera.near = 0.5;
		shadow.camera.far = 60;
		shadow.camera.left = -20;
		shadow.camera.right = 20;
		shadow.camera.top = 20;
		shadow.camera.bottom = -20;
		shadow.bias = -0.0005;
		shadow.normalBias = 0.02;
		shadow.radius = 3;

		graph.addToGroup('environment', this.directional);
		// The target must live in the scene graph so THREE.js updates its matrixWorld
		// each frame; without it the shadow camera's lookAt goes stale.
		graph.addToGroup('environment', this.directional.target);

		// Fill light — opposite side, no shadows
		this.fill = new THREE.DirectionalLight(Palette.ambient, 0.2);
		this.fill.position.set(-8, 10, -8);
		this.fill.castShadow = false;
		graph.addToGroup('environment', this.fill);

		// Hemisphere light — sky/ground gradient replaces flat ambient
		this.hemisphere = new THREE.HemisphereLight(Palette.sun, Palette.shadow, 0.6);
		graph.addToGroup('environment', this.hemisphere);

		console.log('[Lighting] Initialized.');
	}

	/** Generate a fallback IBL environment map from a simple hemisphere scene. */
	initEnvironmentMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
		const pmrem = new THREE.PMREMGenerator(renderer);

		const envScene = new THREE.Scene();
		envScene.add(new THREE.HemisphereLight(0xf0f0f0, 0x808080, 1.0));

		this.envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
		scene.environment = this.envMap;

		pmrem.dispose();
		console.log('[Lighting] Fallback environment map generated.');
	}

	/**
	 * Load an HDR equirectangular texture for IBL.
	 * Supports .hdr (RGBE) and .hdr.jpg (UltraHDR).
	 * Sets scene.environment only (not background — background stays palette-controlled).
	 */
	async loadEnvironmentHdr(
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene,
		path: string,
	): Promise<void> {
		try {
			const texture = await loadHdr(path);
			const pmrem = new THREE.PMREMGenerator(renderer);
			const envMap = pmrem.fromEquirectangular(texture).texture;

			if (this.envMap) this.envMap.dispose();
			this.envMap = envMap;
			scene.environment = envMap;

			texture.dispose();
			pmrem.dispose();
			console.log(`[Lighting] HDR environment loaded from "${path}".`);
		} catch {
			console.warn('[Lighting] HDR load failed, using fallback environment map.');
			this.initEnvironmentMap(renderer, scene);
		}
	}

	setWorldClock(clock: WorldClock): void {
		this.worldClock = clock;
	}

	setCelestialBodies(cb: CelestialBodies): void {
		this.celestialBodies = cb;
	}

	/**
	 * Keep the shadow frustum centred on the camera's look-at point so shadows
	 * remain correct when the player pans away from world origin.
	 */
	setShadowCenter(pos: THREE.Vector3): void {
		this.shadowCenter.copy(pos);
	}

	setDirectionalPosition(x: number, y: number, z: number): void {
		this.directional.position.set(x, y, z);
	}

	update(_delta: number): void {
		if (!this.worldClock) return;

		const hour = this.worldClock.getHour();

		this.updateSunPosition(hour);
		this.updateColors(hour);
	}

	dispose(): void {
		if (this.envMap) {
			this.envMap.dispose();
			this.envMap = null;
		}
	}

	private updateSunPosition(_hour: number): void {
		if (!this.celestialBodies) return;

		const sunPos = this.celestialBodies.getSunPosition();
		const moonPos = this.celestialBodies.getMoonPosition();

		// Use whichever body is above the horizon; sun takes priority.
		const useSource = sunPos.y > 0 ? sunPos : moonPos;

		const len = useSource.length();
		if (len > 0.001) {
			// Place the light at shadowCenter + sun-direction * 25 so the shadow
			// frustum (±20 units) is always centred on the visible scene area.
			// The target stays AT shadowCenter so the light direction is preserved.
			this.directional.position
				.copy(useSource)
				.multiplyScalar(25 / len)
				.add(this.shadowCenter);
			this.directional.target.position.copy(this.shadowCenter);
		}
		this.directional.castShadow = useSource.y > 0;
	}

	private updateColors(hour: number): void {
		let lower = LIGHTING_KEYS[0];
		let upper = LIGHTING_KEYS[1];

		for (let i = 0; i < LIGHTING_KEYS.length - 1; i++) {
			if (hour >= LIGHTING_KEYS[i].hour && hour < LIGHTING_KEYS[i + 1].hour) {
				lower = LIGHTING_KEYS[i];
				upper = LIGHTING_KEYS[i + 1];
				break;
			}
		}

		const t = (hour - lower.hour) / (upper.hour - lower.hour || 1);

		// Sun color + intensity
		_colorA.set(lower.sun);
		_colorB.set(upper.sun);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.directional.color.copy(_colorResult);
		this.directional.intensity = THREE.MathUtils.lerp(lower.sunIntensity, upper.sunIntensity, t);

		// Hemisphere sky color
		_colorA.set(lower.skyColor);
		_colorB.set(upper.skyColor);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.hemisphere.color.copy(_colorResult);

		// Hemisphere ground color
		_colorA.set(lower.groundColor);
		_colorB.set(upper.groundColor);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.hemisphere.groundColor.copy(_colorResult);

		this.hemisphere.intensity = THREE.MathUtils.lerp(lower.hemiIntensity, upper.hemiIntensity, t);

		// Fill light tracks hemisphere sky at lower intensity
		this.fill.color.copy(this.hemisphere.color);
		this.fill.intensity = this.hemisphere.intensity * 0.3;
	}
}
