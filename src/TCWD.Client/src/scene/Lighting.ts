import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { WorldClock } from '../gameplay/WorldClock';

// Color keyframes: [hour, sunColor, sunIntensity, ambientColor, ambientIntensity]
const LIGHTING_KEYS: {
	hour: number;
	sun: THREE.ColorRepresentation;
	sunIntensity: number;
	ambient: THREE.ColorRepresentation;
	ambientIntensity: number;
}[] = [
	{ hour: 0, sun: 0x1a1a4e, sunIntensity: 0.05, ambient: 0x0a0a2e, ambientIntensity: 0.1 },
	{ hour: 5, sun: 0x1a1a4e, sunIntensity: 0.05, ambient: 0x0a0a2e, ambientIntensity: 0.1 },
	{ hour: 6, sun: 0xff8844, sunIntensity: 0.6, ambient: 0xffaa77, ambientIntensity: 0.25 },
	{ hour: 7, sun: 0xffcc88, sunIntensity: 1.0, ambient: 0xffeedd, ambientIntensity: 0.35 },
	{ hour: 10, sun: 0xffffff, sunIntensity: 1.5, ambient: 0xfff8f0, ambientIntensity: 0.4 },
	{ hour: 14, sun: 0xffffff, sunIntensity: 1.5, ambient: 0xfff8f0, ambientIntensity: 0.4 },
	{ hour: 17, sun: 0xffcc88, sunIntensity: 1.2, ambient: 0xffeedd, ambientIntensity: 0.35 },
	{ hour: 18, sun: 0xff6633, sunIntensity: 0.7, ambient: 0xff8855, ambientIntensity: 0.25 },
	{ hour: 19, sun: 0xcc3322, sunIntensity: 0.3, ambient: 0x553344, ambientIntensity: 0.15 },
	{ hour: 21, sun: 0x1a1a4e, sunIntensity: 0.05, ambient: 0x0a0a2e, ambientIntensity: 0.1 },
	{ hour: 24, sun: 0x1a1a4e, sunIntensity: 0.05, ambient: 0x0a0a2e, ambientIntensity: 0.1 },
];

const SUN_ORBIT_RADIUS = 20;
const SUN_HEIGHT = 15;

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Lighting {
	private directional!: THREE.DirectionalLight;
	private ambient!: THREE.AmbientLight;
	private worldClock: WorldClock | null = null;

	init(graph: SceneGraph): void {
		this.directional = new THREE.DirectionalLight(0xffffff, 1.5);
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

		this.ambient = new THREE.AmbientLight(0xffeedd, 0.4);
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
		// Sun arc: rises at 6 (east), peaks at 12 (overhead), sets at 18 (west)
		// Map hour 6-18 to angle 0 to PI
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
			// Moon position (opposite side, dimmer)
			this.directional.position.set(-5, 10, -5);
			this.directional.castShadow = false;
		}
	}

	private updateColors(hour: number): void {
		// Find surrounding keyframes
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

		// Interpolate sun color and intensity
		_colorA.set(lower.sun);
		_colorB.set(upper.sun);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.directional.color.copy(_colorResult);
		this.directional.intensity = THREE.MathUtils.lerp(lower.sunIntensity, upper.sunIntensity, t);

		// Interpolate ambient color and intensity
		_colorA.set(lower.ambient);
		_colorB.set(upper.ambient);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.ambient.color.copy(_colorResult);
		this.ambient.intensity = THREE.MathUtils.lerp(lower.ambientIntensity, upper.ambientIntensity, t);
	}
}
