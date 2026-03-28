import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import type { WorldClock } from '../gameplay/WorldClock';

/** Latitude in degrees — affects sun arc height and seasonal variation. */
const LATITUDE = 51.5; // London-esque

/** Orbital radius from the scene origin. */
const ORBIT_RADIUS = 80;

/** Minimum altitude (below this the body is "below horizon"). */
const HORIZON_Y = -2;

/**
 * Rotate the azimuth by 45° so the arc goes diagonally across the scene
 * (SE → NW) instead of due south, looks natural in isometric view.
 */
const AZIMUTH_OFFSET = Math.PI / 4;

const DEG2RAD = Math.PI / 180;

// ── Helpers ──────────────────────────────────────────────────

/** Solar declination for a given day of year (0-365). */
function solarDeclination(dayOfYear: number): number {
	return 23.45 * Math.sin(DEG2RAD * (360 / 365) * (dayOfYear + 284));
}

/**
 * Compute altitude & azimuth of the sun.
 * Returns { altitude, azimuth } in radians.
 */
function sunPosition(hour: number, dayOfYear: number): { altitude: number; azimuth: number } {
	const decl = solarDeclination(dayOfYear) * DEG2RAD;
	const lat = LATITUDE * DEG2RAD;
	const hourAngle = (hour - 12) * 15 * DEG2RAD;

	const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
	const altitude = Math.asin(THREE.MathUtils.clamp(sinAlt, -1, 1));

	const cosAz = (Math.sin(decl) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(altitude) + 1e-10);
	let azimuth = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
	if (hourAngle > 0) azimuth = Math.PI * 2 - azimuth;

	// Rotate so the path is diagonal in the isometric view
	azimuth += AZIMUTH_OFFSET;

	return { altitude, azimuth };
}

/** Convert altitude + azimuth to a world-space Vector3 on a sphere of given radius. */
function celestialToWorld(altitude: number, azimuth: number, radius: number, out: THREE.Vector3): void {
	const y = Math.sin(altitude) * radius;
	const proj = Math.cos(altitude) * radius;
	const x = -proj * Math.sin(azimuth);
	const z = -proj * Math.cos(azimuth);
	out.set(x, y, z);
}

// ── Sun / Moon mesh builders ─────────────────────────────────

function createSunMesh(): THREE.Group {
	const group = new THREE.Group();
	group.name = 'celestial-sun';

	const core = new THREE.Mesh(
		new THREE.SphereGeometry(1.5, 24, 24),
		new THREE.MeshBasicMaterial({ color: 0xfff8e0 }),
	);
	group.add(core);

	const glow = new THREE.Mesh(
		new THREE.SphereGeometry(3.0, 24, 24),
		new THREE.MeshBasicMaterial({
			color: 0xffeeaa,
			transparent: true,
			opacity: 0.25,
			depthWrite: false,
		}),
	);
	group.add(glow);

	const halo = new THREE.Mesh(
		new THREE.SphereGeometry(5.5, 24, 24),
		new THREE.MeshBasicMaterial({
			color: 0xfff5cc,
			transparent: true,
			opacity: 0.08,
			depthWrite: false,
		}),
	);
	group.add(halo);

	return group;
}

function createMoonMesh(): THREE.Group {
	const group = new THREE.Group();
	group.name = 'celestial-moon';

	const core = new THREE.Mesh(
		new THREE.SphereGeometry(0.8, 20, 20),
		new THREE.MeshBasicMaterial({ color: 0xc8d0e8 }),
	);
	group.add(core);

	const glow = new THREE.Mesh(
		new THREE.SphereGeometry(1.6, 20, 20),
		new THREE.MeshBasicMaterial({
			color: 0xb8c0d8,
			transparent: true,
			opacity: 0.1,
			depthWrite: false,
		}),
	);
	group.add(glow);

	return group;
}

// ── Main class ───────────────────────────────────────────────

export class CelestialBodies {
	private sun: THREE.Group;
	private moon: THREE.Group;
	private worldClock: WorldClock | null = null;
	private readonly sunPos = new THREE.Vector3();
	private readonly moonPos = new THREE.Vector3();

	constructor() {
		this.sun = createSunMesh();
		this.moon = createMoonMesh();
	}

	init(graph: SceneGraph): void {
		graph.addToGroup('environment', this.sun);
		graph.addToGroup('environment', this.moon);
		console.log('[CelestialBodies] Initialized.');
	}

	setWorldClock(clock: WorldClock): void {
		this.worldClock = clock;
	}

	/** Returns the current sun world-space position (for directional light alignment). */
	getSunPosition(): THREE.Vector3 {
		return this.sunPos;
	}

	update(): void {
		if (!this.worldClock) return;

		const hour = this.worldClock.getHour();
		const dayOfYear = this.worldClock.getDayOfYear();

		// ── Sun ──
		const { altitude: sunAlt, azimuth: sunAz } = sunPosition(hour, dayOfYear);
		celestialToWorld(sunAlt, sunAz, ORBIT_RADIUS, this.sunPos);
		this.sun.position.copy(this.sunPos);
		this.sun.visible = this.sunPos.y > HORIZON_Y;

		// ── Moon ── offset by ~12 hours + opposite seasonal declination
		const moonHour = (hour + 12) % 24;
		const moonDayOffset = (dayOfYear + 182) % 365;
		const { altitude: moonAlt, azimuth: moonAz } = sunPosition(moonHour, moonDayOffset);
		celestialToWorld(moonAlt, moonAz, ORBIT_RADIUS, this.moonPos);
		this.moon.position.copy(this.moonPos);
		this.moon.visible = this.moonPos.y > HORIZON_Y;
	}

	dispose(): void {
		this.sun.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				(child.material as THREE.Material).dispose();
			}
		});
		this.moon.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				(child.material as THREE.Material).dispose();
			}
		});
	}
}
