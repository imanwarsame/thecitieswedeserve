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
		backgroundColor: Palette.background,  // neutral off-white
		fogColor: Palette.fog,                // neutral haze
		fogInnerRadius: 1200,
		fogOuterRadius: 2200,
	},
	sunset: {
		backgroundColor: 0xc8c8c8,           // cool gray
		fogColor: 0xc8c8c8,
		fogInnerRadius: 1000,
		fogOuterRadius: 2000,
	},
	dusk: {
		backgroundColor: 0x585868,           // cool dark gray
		fogColor: 0x585868,
		fogInnerRadius: 1000,
		fogOuterRadius: 2000,
	},
	night: {
		backgroundColor: 0x282830,           // deep charcoal
		fogColor: 0x282830,
		fogInnerRadius: 800,
		fogOuterRadius: 1800,
	},
	foggy: {
		backgroundColor: 0xebebeb,           // neutral fog
		fogColor: 0xebebeb,
		fogInnerRadius: 500,
		fogOuterRadius: 1200,
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
	private lastHour = -1;

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
		// Skip if hour hasn't changed meaningfully
		if (Math.abs(hour - this.lastHour) < 0.01) return;
		this.lastHour = hour;

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
		// Fog radii are controlled by ViewRadiusControl — don't override here.
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
		// Fog radii are controlled by ViewRadiusControl — don't override here.
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
