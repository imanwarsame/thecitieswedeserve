import * as THREE from 'three';
import { EngineConfig } from '../app/config';
import { WorldClock } from '../gameplay/WorldClock';

interface EnvironmentPreset {
	backgroundColor: number;
	fogColor: number;
	fogNear: number;
	fogFar: number;
}

const presets: Record<string, EnvironmentPreset> = {
	day: {
		backgroundColor: 0x87ceeb,
		fogColor: 0xc8d8e4,
		fogNear: 50,
		fogFar: 200,
	},
	sunset: {
		backgroundColor: 0xff6b35,
		fogColor: 0xe8a87c,
		fogNear: 40,
		fogFar: 150,
	},
	night: {
		backgroundColor: 0x0a0a2e,
		fogColor: 0x1a1a3e,
		fogNear: 20,
		fogFar: 100,
	},
	foggy: {
		backgroundColor: 0x9e9e9e,
		fogColor: 0xaaaaaa,
		fogNear: 10,
		fogFar: 60,
	},
};

// Time-of-day keyframes: [hour, presetName]
const TIME_PRESETS: { hour: number; preset: string }[] = [
	{ hour: 0, preset: 'night' },
	{ hour: 5, preset: 'night' },
	{ hour: 7, preset: 'day' },
	{ hour: 10, preset: 'day' },
	{ hour: 14, preset: 'day' },
	{ hour: 17, preset: 'day' },
	{ hour: 18, preset: 'sunset' },
	{ hour: 19.5, preset: 'night' },
	{ hour: 21, preset: 'night' },
	{ hour: 24, preset: 'night' },
];

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Environment {
	private scene!: THREE.Scene;
	private fog!: THREE.Fog;
	private fogEnabled: boolean;
	private currentPresetName: string;
	private worldClock: WorldClock | null = null;

	// Transition state
	private transitioning = false;
	private transitionFrom!: EnvironmentPreset;
	private transitionTo!: EnvironmentPreset;
	private transitionDuration = 0;
	private transitionElapsed = 0;

	constructor() {
		this.fogEnabled = EngineConfig.environment.fog;
		this.currentPresetName = EngineConfig.environment.preset;
	}

	init(scene: THREE.Scene): void {
		this.scene = scene;

		this.fog = new THREE.Fog(0xc8d8e4, 50, 200);
		if (this.fogEnabled) {
			this.scene.fog = this.fog;
		}

		this.setPreset(this.currentPresetName);
		console.log('[Environment] Initialized.');
	}

	setWorldClock(clock: WorldClock): void {
		this.worldClock = clock;
	}

	update(_delta: number): void {
		if (this.transitioning) {
			this.updateTransition(_delta);
			return;
		}

		if (this.worldClock) {
			this.updateFromWorldClock();
		}
	}

	setPreset(name: string): void {
		const preset = presets[name];
		if (!preset) {
			console.warn(`[Environment] Unknown preset "${name}".`);
			return;
		}
		this.currentPresetName = name;
		this.applyPreset(preset);
	}

	transitionToPreset(name: string, duration: number): void {
		const target = presets[name];
		if (!target) {
			console.warn(`[Environment] Unknown preset "${name}".`);
			return;
		}

		this.transitionFrom = this.captureCurrentState();
		this.transitionTo = target;
		this.transitionDuration = duration;
		this.transitionElapsed = 0;
		this.transitioning = true;
		this.currentPresetName = name;
	}

	setFogEnabled(enabled: boolean): void {
		this.fogEnabled = enabled;
		this.scene.fog = enabled ? this.fog : null;
	}

	getCurrentPreset(): string {
		return this.currentPresetName;
	}

	private updateFromWorldClock(): void {
		const hour = this.worldClock!.getHour();

		// Find surrounding keyframes
		let lower = TIME_PRESETS[0];
		let upper = TIME_PRESETS[1];

		for (let i = 0; i < TIME_PRESETS.length - 1; i++) {
			if (hour >= TIME_PRESETS[i].hour && hour < TIME_PRESETS[i + 1].hour) {
				lower = TIME_PRESETS[i];
				upper = TIME_PRESETS[i + 1];
				break;
			}
		}

		const presetA = presets[lower.preset];
		const presetB = presets[upper.preset];
		const t = (hour - lower.hour) / (upper.hour - lower.hour || 1);

		this.applyInterpolated(presetA, presetB, t);
	}

	private updateTransition(delta: number): void {
		this.transitionElapsed += delta;
		const t = Math.min(this.transitionElapsed / this.transitionDuration, 1);

		this.applyInterpolated(this.transitionFrom, this.transitionTo, t);

		if (t >= 1) {
			this.transitioning = false;
		}
	}

	private applyPreset(preset: EnvironmentPreset): void {
		(this.scene.background as THREE.Color).set(preset.backgroundColor);
		this.fog.color.set(preset.fogColor);
		this.fog.near = preset.fogNear;
		this.fog.far = preset.fogFar;
	}

	private applyInterpolated(a: EnvironmentPreset, b: EnvironmentPreset, t: number): void {
		_colorA.set(a.backgroundColor);
		_colorB.set(b.backgroundColor);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		(this.scene.background as THREE.Color).copy(_colorResult);

		_colorA.set(a.fogColor);
		_colorB.set(b.fogColor);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		this.fog.color.copy(_colorResult);

		this.fog.near = THREE.MathUtils.lerp(a.fogNear, b.fogNear, t);
		this.fog.far = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t);
	}

	private captureCurrentState(): EnvironmentPreset {
		return {
			backgroundColor: (this.scene.background as THREE.Color).getHex(),
			fogColor: this.fog.color.getHex(),
			fogNear: this.fog.near,
			fogFar: this.fog.far,
		};
	}
}
