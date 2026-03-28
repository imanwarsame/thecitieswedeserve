import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Palette } from '../rendering/Palette';
import { WorldClock } from '../gameplay/WorldClock';

// Monochrome lighting keyframes — grays only, intensity drives the day/night feel
const LIGHTING_KEYS: {
	hour: number;
	sun: number;
	sunIntensity: number;
	ambient: number;
	ambientIntensity: number;
}[] = [
	{ hour: 0, sun: 0x808090, sunIntensity: 0.05, ambient: 0x606068, ambientIntensity: 0.08 },
	{ hour: 5, sun: 0x808090, sunIntensity: 0.05, ambient: 0x606068, ambientIntensity: 0.08 },
	{ hour: 6, sun: 0xc0c0c0, sunIntensity: 0.5, ambient: 0xa0a0a0, ambientIntensity: 0.2 },
	{ hour: 7, sun: 0xe0e0e0, sunIntensity: 0.9, ambient: 0xc8c8c8, ambientIntensity: 0.3 },
	{ hour: 10, sun: Palette.sun, sunIntensity: 1.2, ambient: Palette.ambient, ambientIntensity: 0.35 },
	{ hour: 14, sun: Palette.sun, sunIntensity: 1.2, ambient: Palette.ambient, ambientIntensity: 0.35 },
	{ hour: 17, sun: 0xe0e0e0, sunIntensity: 1.0, ambient: 0xc8c8c8, ambientIntensity: 0.3 },
	{ hour: 18, sun: 0xb0b0b0, sunIntensity: 0.5, ambient: 0x909090, ambientIntensity: 0.2 },
	{ hour: 19, sun: 0x909098, sunIntensity: 0.15, ambient: 0x707078, ambientIntensity: 0.12 },
	{ hour: 21, sun: 0x808090, sunIntensity: 0.05, ambient: 0x606068, ambientIntensity: 0.08 },
	{ hour: 24, sun: 0x808090, sunIntensity: 0.05, ambient: 0x606068, ambientIntensity: 0.08 },
];

const SUN_ORBIT_RADIUS = 20;
const SUN_HEIGHT = 15;

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Lighting {
	private directional!: THREE.DirectionalLight;
	private fill!: THREE.DirectionalLight;
	private ambient!: THREE.AmbientLight;
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

		// Ambient
		this.ambient = new THREE.AmbientLight(Palette.ambient, 0.35);
		graph.addToGroup('environment', this.ambient);

		console.log('[Lighting] Initialized.');
	}

	setWorldClock(clock: WorldClock): void {
		this.worldClock = clock;
	}

	setDirectionalPosition(x: number, y: number, z: number): void {
		this.directional.position.set(x, y, z);
	}

	setAmbientIntensity(value: number): void {
		this.ambient.intensity = value;
	}

	update(_delta: number): void {
		if (!this.worldClock) return;

		const hour = this.worldClock.getHour();

		this.updateSunPosition(hour);
		this.updateColors(hour);
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

		_colorA.set(lower.sun);
		_colorB.set(upper.sun);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.directional.color.copy(_colorResult);
		this.directional.intensity = THREE.MathUtils.lerp(lower.sunIntensity, upper.sunIntensity, t);

		_colorA.set(lower.ambient);
		_colorB.set(upper.ambient);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.ambient.color.copy(_colorResult);
		this.ambient.intensity = THREE.MathUtils.lerp(lower.ambientIntensity, upper.ambientIntensity, t);

		// Fill light tracks ambient at lower intensity
		this.fill.color.copy(this.ambient.color);
		this.fill.intensity = this.ambient.intensity * 0.5;
	}
}
