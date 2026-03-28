import * as THREE from 'three';

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
	return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function lerpColor(colorA: THREE.Color, colorB: THREE.Color, t: number): THREE.Color {
	return colorA.clone().lerp(colorB, t);
}

export function degreesToRadians(deg: number): number {
	return deg * (Math.PI / 180);
}

export function radiansToDegrees(rad: number): number {
	return rad * (180 / Math.PI);
}
