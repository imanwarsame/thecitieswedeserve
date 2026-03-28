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
	//                                                    sky (hemisphere top)    ground (hemisphere bottom)
	{ hour: 0,  sun: 0x8888aa, sunIntensity: 0.25, skyColor: 0x707088, groundColor: 0x3a3a44, hemiIntensity: 0.20 },
	{ hour: 5,  sun: 0x8888aa, sunIntensity: 0.25, skyColor: 0x707088, groundColor: 0x3a3a44, hemiIntensity: 0.20 },
	{ hour: 6,  sun: 0xd0d0d0, sunIntensity: 0.6,  skyColor: 0xc8c8c8, groundColor: 0x808080, hemiIntensity: 0.35 },  // dawn
	{ hour: 7,  sun: 0xe8e8e8, sunIntensity: 1.0,  skyColor: 0xe0e0e0, groundColor: 0xa0a0a0, hemiIntensity: 0.45 },  // morning
	{ hour: 10, sun: Palette.sun, sunIntensity: 1.3, skyColor: Palette.ambient, groundColor: Palette.shadow, hemiIntensity: 0.65 },
	{ hour: 14, sun: Palette.sun, sunIntensity: 1.3, skyColor: Palette.ambient, groundColor: Palette.shadow, hemiIntensity: 0.65 },
	{ hour: 17, sun: 0xe8e8e8, sunIntensity: 1.1,  skyColor: 0xe0e0e0, groundColor: 0xa0a0a0, hemiIntensity: 0.50 },  // afternoon
	{ hour: 18, sun: 0xc8c8c8, sunIntensity: 0.7,  skyColor: 0xb0b0b0, groundColor: 0x787878, hemiIntensity: 0.35 },  // evening
	{ hour: 19, sun: 0xa0a0b0, sunIntensity: 0.4,  skyColor: 0x909098, groundColor: 0x484850, hemiIntensity: 0.25 },  // dusk
	{ hour: 21, sun: 0x8888aa, sunIntensity: 0.25, skyColor: 0x707088, groundColor: 0x3a3a44, hemiIntensity: 0.20 },
	{ hour: 24, sun: 0x8888aa, sunIntensity: 0.25, skyColor: 0x707088, groundColor: 0x3a3a44, hemiIntensity: 0.20 },
];

const SUN_ORBIT_RADIUS = 2000;
const SUN_HEIGHT = 1500;
const MOON_ORBIT_RADIUS = 1800;
const MOON_HEIGHT = 1200;

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Lighting {
	private directional!: THREE.DirectionalLight;
	private fill!: THREE.DirectionalLight;
	private hemisphere!: THREE.HemisphereLight;
	private envMap: THREE.Texture | null = null;
	private worldClock: WorldClock | null = null;
	private _celestialBodies: CelestialBodies | null = null;
	private readonly shadowCenter = new THREE.Vector3();
	private lastHour = -1;

	init(graph: SceneGraph): void {
		// Main directional (sun)
		this.directional = new THREE.DirectionalLight(Palette.sun, 1.2);
		this.directional.position.set(15, 25, 15);
		this.directional.castShadow = true;

		const shadow = this.directional.shadow;
		shadow.mapSize.width = 2048;
		shadow.mapSize.height = 2048;
		shadow.camera.near = 0.5;
		shadow.camera.far = 100;
		shadow.camera.left = -30;
		shadow.camera.right = 30;
		shadow.camera.top = 30;
		shadow.camera.bottom = -30;
		shadow.bias = -0.003;
		shadow.normalBias = 0.5;
		shadow.radius = 3;

		graph.addToGroup('environment', this.directional);

		// Fill light — opposite side, no shadows
		this.fill = new THREE.DirectionalLight(Palette.ambient, 0.2);
		this.fill.position.set(-10, 15, -10);
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
		envScene.add(new THREE.HemisphereLight(0xf8f8f7, 0xbebcba, 1.0));

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
		this._celestialBodies = cb;
	}

	setShadowCenter(pos: THREE.Vector3): void {
		this.shadowCenter.copy(pos);
	}

	setDirectionalPosition(x: number, y: number, z: number): void {
		this.directional.position.set(x, y, z);
	}

	update(_delta: number): void {
		if (!this.worldClock) return;

		const hour = this.worldClock.getHour();
		// Skip if hour hasn't changed meaningfully (< 0.01 ≈ 36 seconds game-time)
		if (Math.abs(hour - this.lastHour) < 0.01) return;
		this.lastHour = hour;

		this.updateSunPosition(hour);
		this.updateColors(hour);
	}

	dispose(): void {
		if (this.envMap) {
			this.envMap.dispose();
			this.envMap = null;
		}
	}

	private updateSunPosition(hour: number): void {
		const isDay = hour >= 5.5 && hour <= 18.5;

		if (isDay) {
			// Sun arc: rises at 6, sets at 18
			const sunProgress = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
			const angle = sunProgress * Math.PI;
			const x = Math.cos(angle) * SUN_ORBIT_RADIUS;
			const y = Math.sin(angle) * SUN_HEIGHT;
			const z = SUN_ORBIT_RADIUS * 0.3;
			this.directional.position.set(x, Math.max(y, 1), z);
			this.directional.castShadow = true;
		} else {
			// Moon arc: rises at 19, peaks at midnight, sets at 5
			// Map night hours (19→5) to 0→1, wrapping across midnight
			const nightStart = 19;
			const nightDuration = 10; // 19 → 5 = 10 hours
			const nightHour = hour >= nightStart ? hour - nightStart : hour + (24 - nightStart);
			const moonProgress = THREE.MathUtils.clamp(nightHour / nightDuration, 0, 1);
			const angle = moonProgress * Math.PI;
			// Moon orbits from the opposite side (negative x)
			const x = -Math.cos(angle) * MOON_ORBIT_RADIUS;
			const y = Math.sin(angle) * MOON_HEIGHT;
			const z = -MOON_ORBIT_RADIUS * 0.3;
			this.directional.position.set(x, Math.max(y, 1), z);
			this.directional.castShadow = true;
		}
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
