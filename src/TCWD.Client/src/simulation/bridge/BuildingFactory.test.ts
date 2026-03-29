import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
	createBuildingMesh,
	updateBuildingLights,
	MAT_HOUSING_WINDOW,
	MAT_DC_WINDOW,
	MAT_COMMERCIAL_WINDOW,
	MAT_SCHOOL_WINDOW,
	MAT_TRANSIT_WINDOW,
	type BuildingType,
} from './BuildingFactory';

// ── Helpers ───────────────────────────────────────────────────

/** Collect all materials used by meshes in a group tree. */
function collectMaterials(group: THREE.Group): THREE.Material[] {
	const mats: THREE.Material[] = [];
	group.traverse(child => {
		if (child instanceof THREE.Mesh) {
			const m = child.material;
			if (Array.isArray(m)) mats.push(...m);
			else mats.push(m);
		}
	});
	return mats;
}

/** Check whether any mesh in the group uses a specific material. */
function usesMaterial(group: THREE.Group, mat: THREE.Material): boolean {
	return collectMaterials(group).includes(mat);
}

// Reset shared material state before each test so side-effects don't leak
beforeEach(() => {
	MAT_HOUSING_WINDOW.emissiveIntensity = 0;
	MAT_DC_WINDOW.emissiveIntensity = 0;
	MAT_COMMERCIAL_WINDOW.emissiveIntensity = 0;
	MAT_SCHOOL_WINDOW.emissiveIntensity = 0;
	MAT_TRANSIT_WINDOW.emissiveIntensity = 0;
});

// ── Emissive material presence in meshes ─────────────────────

describe('Building meshes contain emissive windows', () => {
	const cases: [BuildingType, THREE.Material][] = [
		['housing',    MAT_HOUSING_WINDOW],
		['dataCentre', MAT_DC_WINDOW],
		['office',     MAT_DC_WINDOW],
		['commercial', MAT_COMMERCIAL_WINDOW],
		['school',     MAT_SCHOOL_WINDOW],
		['leisure',    MAT_COMMERCIAL_WINDOW],
		['metro',      MAT_TRANSIT_WINDOW],
		['train',      MAT_TRANSIT_WINDOW],
	];

	it.each(cases)('%s mesh includes its emissive window material', (type, expectedMat) => {
		const mesh = createBuildingMesh(type);
		expect(usesMaterial(mesh, expectedMat)).toBe(true);
	});

	it.each(['solar', 'wind', 'park', 'cyclePath'] as BuildingType[])(
		'%s mesh has no emissive window material (not a lit building)',
		(type) => {
			const mesh = createBuildingMesh(type);
			const mats = collectMaterials(mesh);
			const emissiveMats = [
				MAT_HOUSING_WINDOW, MAT_DC_WINDOW,
				MAT_COMMERCIAL_WINDOW, MAT_SCHOOL_WINDOW, MAT_TRANSIT_WINDOW,
			];
			for (const em of emissiveMats) {
				expect(mats.includes(em)).toBe(false);
			}
		},
	);
});

// ── updateBuildingLights glow schedules ──────────────────────

describe('updateBuildingLights – glow schedules per typology', () => {
	describe('housing (residential): on at night, off during day', () => {
		it('full glow at midnight', () => {
			updateBuildingLights(0);
			expect(MAT_HOUSING_WINDOW.emissiveIntensity).toBe(1.0);
		});

		it('off at noon', () => {
			updateBuildingLights(12);
			expect(MAT_HOUSING_WINDOW.emissiveIntensity).toBe(0);
		});

		it('full glow at 10pm', () => {
			updateBuildingLights(22);
			expect(MAT_HOUSING_WINDOW.emissiveIntensity).toBe(1.0);
		});

		it('fading at dawn (6am)', () => {
			updateBuildingLights(6);
			expect(MAT_HOUSING_WINDOW.emissiveIntensity).toBeGreaterThan(0);
			expect(MAT_HOUSING_WINDOW.emissiveIntensity).toBeLessThan(1);
		});
	});

	describe('dataCentre / office: always on, boosted at night', () => {
		it('faint glow at noon (base = 0.15)', () => {
			updateBuildingLights(12);
			expect(MAT_DC_WINDOW.emissiveIntensity).toBeCloseTo(0.15, 1);
		});

		it('full glow at midnight (base + nightBoost = 1.0)', () => {
			updateBuildingLights(0);
			expect(MAT_DC_WINDOW.emissiveIntensity).toBeCloseTo(1.0, 1);
		});
	});

	describe('commercial / leisure: warm storefront, evening peak', () => {
		it('off at 3am', () => {
			updateBuildingLights(3);
			expect(MAT_COMMERCIAL_WINDOW.emissiveIntensity).toBe(0);
		});

		it('subdued during daytime (0.5 at noon)', () => {
			updateBuildingLights(12);
			expect(MAT_COMMERCIAL_WINDOW.emissiveIntensity).toBeCloseTo(0.5, 1);
		});

		it('full glow at 9pm (peak evening)', () => {
			updateBuildingLights(21);
			expect(MAT_COMMERCIAL_WINDOW.emissiveIntensity).toBe(1.0);
		});

		it('ramping up in evening (7pm > noon)', () => {
			updateBuildingLights(12);
			const noon = MAT_COMMERCIAL_WINDOW.emissiveIntensity;
			updateBuildingLights(19);
			const evening = MAT_COMMERCIAL_WINDOW.emissiveIntensity;
			expect(evening).toBeGreaterThan(noon);
		});
	});

	describe('school: institutional hours only, dark at night', () => {
		it('off at midnight', () => {
			updateBuildingLights(0);
			expect(MAT_SCHOOL_WINDOW.emissiveIntensity).toBe(0);
		});

		it('on during school hours (10am)', () => {
			updateBuildingLights(10);
			expect(MAT_SCHOOL_WINDOW.emissiveIntensity).toBeCloseTo(0.7, 1);
		});

		it('off at 8pm', () => {
			updateBuildingLights(20);
			expect(MAT_SCHOOL_WINDOW.emissiveIntensity).toBe(0);
		});

		it('ramping up at 7:30am (dawn)', () => {
			updateBuildingLights(7.5);
			expect(MAT_SCHOOL_WINDOW.emissiveIntensity).toBeGreaterThan(0);
			expect(MAT_SCHOOL_WINDOW.emissiveIntensity).toBeLessThan(0.7);
		});
	});

	describe('transit (metro/train): 24/7, brighter at night', () => {
		it('base glow at noon (0.2)', () => {
			updateBuildingLights(12);
			expect(MAT_TRANSIT_WINDOW.emissiveIntensity).toBeCloseTo(0.2, 1);
		});

		it('full glow at midnight (base + nightBoost = 1.0)', () => {
			updateBuildingLights(0);
			expect(MAT_TRANSIT_WINDOW.emissiveIntensity).toBeCloseTo(1.0, 1);
		});

		it('never fully off', () => {
			for (let h = 0; h < 24; h++) {
				updateBuildingLights(h);
				expect(MAT_TRANSIT_WINDOW.emissiveIntensity).toBeGreaterThan(0);
			}
		});
	});
});

// ── All glow values stay in 0–1 range ────────────────────────

describe('updateBuildingLights – all materials stay in [0, 1]', () => {
	const allMats = [
		MAT_HOUSING_WINDOW,
		MAT_DC_WINDOW,
		MAT_COMMERCIAL_WINDOW,
		MAT_SCHOOL_WINDOW,
		MAT_TRANSIT_WINDOW,
	];

	it('emissiveIntensity stays in [0, 1] for every hour', () => {
		for (let h = 0; h <= 24; h += 0.5) {
			updateBuildingLights(h);
			for (const mat of allMats) {
				expect(mat.emissiveIntensity).toBeGreaterThanOrEqual(0);
				expect(mat.emissiveIntensity).toBeLessThanOrEqual(1.0);
			}
		}
	});
});
