import { Palette } from './Palette';
import { radialFogUniforms } from './RadialFog';
import type { PostProcessing } from './PostProcessing';
import type { Lighting } from '../scene/Lighting';
import type * as THREE from 'three';

export interface MoodPreset {
	name: string;
	background: number;
	fogColor: number;
	fogInnerRadius: number;
	fogOuterRadius: number;
	sunColor: number;
	sunIntensity: number;
	sunPosition: [number, number, number];
	ambientIntensity: number;
	bloomStrength: number;
	bloomThreshold: number;
	bloomRadius: number;
	grayscaleIntensity: number;
	outlineEdgeStrength: number;
	outlineEdgeGlow: number;
	outlinePulsePeriod: number;
}

const presets: Record<string, MoodPreset> = {
	overcast: {
		name: 'overcast',
		background: Palette.background,
		fogColor: Palette.fog,
		fogInnerRadius: 30,
		fogOuterRadius: 120,
		sunColor: Palette.sun,
		sunIntensity: 1.2,
		sunPosition: [10, 15, 10],
		ambientIntensity: 0.35,
		bloomStrength: 0.25,
		bloomThreshold: 0.85,
		bloomRadius: 0.4,
		grayscaleIntensity: 1.0,
		outlineEdgeStrength: 3.5,
		outlineEdgeGlow: 0.8,
		outlinePulsePeriod: 2.0,
	},
	dawn: {
		name: 'dawn',
		background: 0xd8d0c8,
		fogColor: 0xccc4bc,
		fogInnerRadius: 20,
		fogOuterRadius: 90,
		sunColor: 0xe0d8d0,
		sunIntensity: 0.8,
		sunPosition: [18, 5, 8],
		ambientIntensity: 0.25,
		bloomStrength: 0.35,
		bloomThreshold: 0.8,
		bloomRadius: 0.6,
		grayscaleIntensity: 1.0,
		outlineEdgeStrength: 3.0,
		outlineEdgeGlow: 0.7,
		outlinePulsePeriod: 2.5,
	},
	midnight: {
		name: 'midnight',
		background: 0x101828,
		fogColor: 0x101828,
		fogInnerRadius: 30,
		fogOuterRadius: 120,
		sunColor: 0x4060a0,
		sunIntensity: 0.12,
		sunPosition: [-5, 10, -5],
		ambientIntensity: 0.15,
		bloomStrength: 0.2,
		bloomThreshold: 0.7,
		bloomRadius: 0.5,
		grayscaleIntensity: 1.0,
		outlineEdgeStrength: 4.0,
		outlineEdgeGlow: 1.0,
		outlinePulsePeriod: 3.0,
	},
	clinical: {
		name: 'clinical',
		background: 0xf5f5f5,
		fogColor: 0xf0f0f0,
		fogInnerRadius: 100,
		fogOuterRadius: 300,
		sunColor: 0xfafafa,
		sunIntensity: 1.8,
		sunPosition: [10, 20, 10],
		ambientIntensity: 0.5,
		bloomStrength: 0.1,
		bloomThreshold: 0.9,
		bloomRadius: 0.3,
		grayscaleIntensity: 1.0,
		outlineEdgeStrength: 3.0,
		outlineEdgeGlow: 0.5,
		outlinePulsePeriod: 2.0,
	},
};

// ---------------------------------------------------------------------------
// Material overrides per mood (prepared for future per-material tinting)
// ---------------------------------------------------------------------------

export interface MoodMaterialOverrides {
	/** Multiplier applied to all material colors (tints the world). */
	colorTint: number;
	/** Added to all roughness values. Negative = shinier (wet look). */
	roughnessOffset: number;
	/** Grayscale intensity for the post-processing pass. */
	grayscaleIntensity: number;
}

export const MOOD_MATERIAL_OVERRIDES: Record<string, MoodMaterialOverrides> = {
	overcast: {
		colorTint: 0xe0e0e0,
		roughnessOffset: 0.05,
		grayscaleIntensity: 1.0,
	},
	dawn: {
		colorTint: 0xf0e8e0,
		roughnessOffset: -0.05,
		grayscaleIntensity: 0.85,
	},
	midnight: {
		colorTint: 0xc0c0d0,
		roughnessOffset: -0.1,
		grayscaleIntensity: 1.0,
	},
	clinical: {
		colorTint: 0xffffff,
		roughnessOffset: 0.0,
		grayscaleIntensity: 1.0,
	},
};

let currentPresetName = 'overcast';

export function getPreset(name: string): MoodPreset {
	const p = presets[name];
	if (!p) throw new Error(`[MoodPresets] Unknown preset "${name}".`);
	return p;
}

export function applyPreset(
	name: string,
	scene: THREE.Scene,
	lighting: Lighting,
	postProcessing: PostProcessing,
): void {
	const p = getPreset(name);
	currentPresetName = name;

	// Background
	(scene.background as THREE.Color).set(p.background);

	// Fog
	radialFogUniforms.fogColor.value.set(p.fogColor);
	radialFogUniforms.fogInnerRadius.value = p.fogInnerRadius;
	radialFogUniforms.fogOuterRadius.value = p.fogOuterRadius;

	// Lighting
	lighting.setDirectionalPosition(...p.sunPosition);

	// Post-processing
	postProcessing.setBloomParams(p.bloomStrength, p.bloomThreshold, p.bloomRadius);
	postProcessing.setGrayscaleIntensity(p.grayscaleIntensity);

	// Outline
	const sp = postProcessing.getSelectOutlinePass();
	sp.edgeStrength = p.outlineEdgeStrength;
	sp.edgeGlow = p.outlineEdgeGlow;
	sp.pulsePeriod = p.outlinePulsePeriod;
}

export function getCurrentPreset(): string {
	return currentPresetName;
}

export function listPresets(): string[] {
	return Object.keys(presets);
}
