import * as THREE from 'three';
import { EngineConfig } from '../app/config';
import { Palette } from '../rendering/Palette';
import { radialFogUniforms } from '../rendering/RadialFog';
import { WorldClock } from '../gameplay/WorldClock';

interface EnvironmentPreset {
	backgroundColor: number;
	fogColor: number;
	fogInnerRadius: number;
	fogOuterRadius: number;
}

const presets: Record<string, EnvironmentPreset> = {
	day: {
		backgroundColor: Palette.background,
		fogColor: Palette.fog,
		fogInnerRadius: 30,
		fogOuterRadius: 120,
	},
	sunset: {
		backgroundColor: 0xc0a888,
		fogColor: 0xc0a888,
		fogInnerRadius: 30,
		fogOuterRadius: 120,
	},
	dusk: {
		backgroundColor: 0x384058,
		fogColor: 0x384058,
		fogInnerRadius: 30,
		fogOuterRadius: 120,
	},
	night: {
		backgroundColor: 0x101828,
		fogColor: 0x101828,
		fogInnerRadius: 30,
		fogOuterRadius: 120,
	},
	foggy: {
		backgroundColor: 0xb0b0b0,
		fogColor: 0xb8b8b8,
		fogInnerRadius: 10,
		fogOuterRadius: 50,
	},
};

const TIME_PRESETS: { hour: number; preset: string }[] = [
	{ hour: 0, preset: 'night' },
	{ hour: 4, preset: 'night' },
	{ hour: 5.5, preset: 'dusk' },   // pre-dawn twilight (reuse dusk colors)
	{ hour: 7, preset: 'day' },
	{ hour: 10, preset: 'day' },
	{ hour: 14, preset: 'day' },
	{ hour: 17, preset: 'day' },
	{ hour: 18, preset: 'sunset' },
	{ hour: 19.5, preset: 'dusk' },
	{ hour: 20.5, preset: 'night' },
	{ hour: 24, preset: 'night' },
];

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorResult = new THREE.Color();

export class Environment {
	private scene!: THREE.Scene;
	private fogEnabled: boolean;
	private currentPresetName: string;
	private worldClock: WorldClock | null = null;

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

		// Use a dummy THREE.Fog so that materials compile with USE_FOG defined.
		// Actual fog calculation is done by our custom shader chunks in RadialFog.ts.
		if (this.fogEnabled) {
			this.scene.fog = new THREE.Fog(Palette.fog, 9999, 10000);
		}

		this.setPreset(this.currentPresetName);
		console.log('[Environment] Initialized.');
	}

	setWorldClock(clock: WorldClock): void {
		this.worldClock = clock;
	}

	/** Update the world-space fog center point (should track camera target) */
	setFogCenter(position: THREE.Vector3): void {
		radialFogUniforms.fogCenter.value.copy(position);
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
		if (enabled) {
			this.scene.fog = new THREE.Fog(Palette.fog, 9999, 10000);
		} else {
			this.scene.fog = null;
		}
	}

	setFogRadii(inner: number, outer: number): void {
		radialFogUniforms.fogInnerRadius.value = inner;
		radialFogUniforms.fogOuterRadius.value = outer;
	}

	getCurrentPreset(): string {
		return this.currentPresetName;
	}

	private updateFromWorldClock(): void {
		const hour = this.worldClock!.getHour();

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
		radialFogUniforms.fogColor.value.set(preset.fogColor);
		radialFogUniforms.fogInnerRadius.value = preset.fogInnerRadius;
		radialFogUniforms.fogOuterRadius.value = preset.fogOuterRadius;
	}

	private applyInterpolated(a: EnvironmentPreset, b: EnvironmentPreset, t: number): void {
		_colorA.set(a.backgroundColor);
		_colorB.set(b.backgroundColor);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		(this.scene.background as THREE.Color).copy(_colorResult);

		_colorA.set(a.fogColor);
		_colorB.set(b.fogColor);
		_colorResult.copy(_colorA).lerp(_colorB, t);
		radialFogUniforms.fogColor.value.copy(_colorResult);

		radialFogUniforms.fogInnerRadius.value = THREE.MathUtils.lerp(a.fogInnerRadius, b.fogInnerRadius, t);
		radialFogUniforms.fogOuterRadius.value = THREE.MathUtils.lerp(a.fogOuterRadius, b.fogOuterRadius, t);
	}

	private captureCurrentState(): EnvironmentPreset {
		return {
			backgroundColor: (this.scene.background as THREE.Color).getHex(),
			fogColor: radialFogUniforms.fogColor.value.getHex(),
			fogInnerRadius: radialFogUniforms.fogInnerRadius.value,
			fogOuterRadius: radialFogUniforms.fogOuterRadius.value,
		};
	}
}
