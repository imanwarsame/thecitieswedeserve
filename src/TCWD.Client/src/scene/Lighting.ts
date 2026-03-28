import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Palette } from '../rendering/Palette';
import { WorldClock } from '../gameplay/WorldClock';

const LIGHTING_KEYS: {
	hour: number;
	sun: number;
	sunIntensity: number;
	skyColor: number;
	groundColor: number;
	hemiIntensity: number;
}[] = [
	{ hour: 0,  sun: 0x808090, sunIntensity: 0.05, skyColor: 0x606068, groundColor: 0x303038, hemiIntensity: 0.08 },
	{ hour: 5,  sun: 0x808090, sunIntensity: 0.05, skyColor: 0x606068, groundColor: 0x303038, hemiIntensity: 0.08 },
	{ hour: 6,  sun: 0xc0c0c0, sunIntensity: 0.5,  skyColor: 0xa0a0a0, groundColor: 0x606060, hemiIntensity: 0.25 },
	{ hour: 7,  sun: 0xe0e0e0, sunIntensity: 0.9,  skyColor: 0xc8c8c8, groundColor: 0x808080, hemiIntensity: 0.4 },
	{ hour: 10, sun: Palette.sun, sunIntensity: 1.2, skyColor: Palette.ambient, groundColor: Palette.shadow, hemiIntensity: 0.6 },
	{ hour: 14, sun: Palette.sun, sunIntensity: 1.2, skyColor: Palette.ambient, groundColor: Palette.shadow, hemiIntensity: 0.6 },
	{ hour: 17, sun: 0xe0e0e0, sunIntensity: 1.0,  skyColor: 0xc8c8c8, groundColor: 0x808080, hemiIntensity: 0.4 },
	{ hour: 18, sun: 0xb0b0b0, sunIntensity: 0.5,  skyColor: 0x909090, groundColor: 0x505050, hemiIntensity: 0.25 },
	{ hour: 19, sun: 0x909098, sunIntensity: 0.15,  skyColor: 0x707078, groundColor: 0x383840, hemiIntensity: 0.12 },
	{ hour: 21, sun: 0x808090, sunIntensity: 0.05, skyColor: 0x606068, groundColor: 0x303038, hemiIntensity: 0.08 },
	{ hour: 24, sun: 0x808090, sunIntensity: 0.05, skyColor: 0x606068, groundColor: 0x303038, hemiIntensity: 0.08 },
];

const SUN_ORBIT_RADIUS = 20;
const SUN_HEIGHT = 15;

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Lighting {
	private directional!: THREE.DirectionalLight;
	private fill!: THREE.DirectionalLight;
	private hemisphere!: THREE.HemisphereLight;
	private envMap: THREE.Texture | null = null;
	private worldClock: WorldClock | null = null;

	init(graph: SceneGraph): void {
		// Main directional (sun)
		this.directional = new THREE.DirectionalLight(Palette.sun, 1.2);
		this.directional.position.set(10, 15, 10);
		this.directional.castShadow = true;

		const shadow = this.directional.shadow;
		shadow.mapSize.width = 2048;
		shadow.mapSize.height = 2048;
		shadow.camera.near = 0.5;
		shadow.camera.far = 60;
		shadow.camera.left = -20;
		shadow.camera.right = 20;
		shadow.camera.top = 20;
		shadow.camera.bottom = -20;

		graph.addToGroup('environment', this.directional);

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

	/** Generate an IBL environment map for MeshStandardMaterial. */
	initEnvironmentMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
		const pmrem = new THREE.PMREMGenerator(renderer);

		// Simple sky-ground gradient scene for soft IBL
		const envScene = new THREE.Scene();
		envScene.add(new THREE.HemisphereLight(0xf0f0f0, 0x808080, 1.0));

		this.envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
		scene.environment = this.envMap;

		pmrem.dispose();
		console.log('[Lighting] Environment map generated.');
	}

	setWorldClock(clock: WorldClock): void {
		this.worldClock = clock;
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

	private updateSunPosition(hour: number): void {
		const sunProgress = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
		const angle = sunProgress * Math.PI;

		const isDay = hour >= 5.5 && hour <= 18.5;

		if (isDay) {
			const x = Math.cos(angle) * SUN_ORBIT_RADIUS;
			const y = Math.sin(angle) * SUN_HEIGHT;
			const z = SUN_ORBIT_RADIUS * 0.3;
			this.directional.position.set(x, Math.max(y, 1), z);
			this.directional.castShadow = true;
		} else {
			this.directional.position.set(-5, 10, -5);
			this.directional.castShadow = false;
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
