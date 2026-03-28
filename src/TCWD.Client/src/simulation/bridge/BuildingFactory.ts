import * as THREE from 'three';
import { EntityType, FuelType } from '../types';
import type { Entity as SimEntity } from '../entities/types';
import type { ModelFactory, AnimatedModel } from '../../assets/ModelFactory';
import type { VoronoiCell } from '../../grid/types';

/**
 * Creates procedural 3D meshes for simulation entity types.
 * All meshes use monochrome materials consistent with the project's palette.
 */

// fog:false prevents these materials from using the patched radial fog shader
// (which requires uniforms injected via patchMaterialUniforms). Without this,
// the shader compiles with undefined uniform references → black output.
const MAT_HOUSING = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.9, metalness: 0.0, fog: false });
const MAT_DATACENTRE = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.6, metalness: 0.2, fog: false });
const MAT_SOLAR = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.3, metalness: 0.4, fog: false });
const MAT_WIND_POLE = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.5, metalness: 0.3, fog: false });
const MAT_WIND_BLADE = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.4, metalness: 0.2, fog: false });
const MAT_GAS = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.8, metalness: 0.1, fog: false });
const MAT_COAL = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.9, metalness: 0.05, fog: false });
const MAT_NUCLEAR = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.7, metalness: 0.15, fog: false });
const MAT_CHIMNEY = new THREE.MeshStandardMaterial({ color: 0x686868, roughness: 0.85, metalness: 0.1, fog: false });
const MAT_OFFICE = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.6, metalness: 0.15, fog: false });
const MAT_COMMERCIAL = new THREE.MeshStandardMaterial({ color: 0xb8a898, roughness: 0.75, metalness: 0.05, fog: false });
const MAT_SCHOOL = new THREE.MeshStandardMaterial({ color: 0xd0c8b8, roughness: 0.8, metalness: 0.0, fog: false });
const MAT_LEISURE = new THREE.MeshStandardMaterial({ color: 0x9898b0, roughness: 0.7, metalness: 0.1, fog: false });
const MAT_PARK_GROUND = new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 1.0, metalness: 0.0, fog: false });
const MAT_PARK_TREE = new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.9, metalness: 0.0, fog: false });
const MAT_PARK_TRUNK = new THREE.MeshStandardMaterial({ color: 0x8a7060, roughness: 0.95, metalness: 0.0, fog: false });
const MAT_METRO = new THREE.MeshStandardMaterial({ color: 0x505060, roughness: 0.5, metalness: 0.3, fog: false });
const MAT_TRAIN = new THREE.MeshStandardMaterial({ color: 0x686878, roughness: 0.55, metalness: 0.25, fog: false });
const MAT_CYCLE = new THREE.MeshStandardMaterial({ color: 0x7a9a6a, roughness: 0.8, metalness: 0.05, fog: false });

// Emissive window / LED materials – shared so a single update lights every building
export const MAT_HOUSING_WINDOW = new THREE.MeshStandardMaterial({
	color: 0x222222,
	roughness: 1.0,
	metalness: 0.0,
	emissive: 0xcccccc,
	emissiveIntensity: 0,
	fog: false,
});
const MAT_DC_WINDOW = new THREE.MeshStandardMaterial({
	color: 0x181818,
	roughness: 1.0,
	metalness: 0.0,
	emissive: 0x88aacc,
	emissiveIntensity: 0,
	fog: false,
});

/** Procedural meshes were authored at 1 unit ≈ 20 m; scale to 1 unit = 1 m. */
const BUILDING_SCALE = 20;

function enableShadows(obj: THREE.Object3D): void {
	obj.traverse(child => {
		if (child instanceof THREE.Mesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
}

function createHousingMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), MAT_HOUSING);
	body.position.y = 0.3;
	const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.3, 4), MAT_HOUSING);
	roof.position.y = 0.75;
	roof.rotation.y = Math.PI / 4;

	// Emissive windows (glow at night)
	const winGeo = new THREE.PlaneGeometry(0.12, 0.14);
	const win1 = new THREE.Mesh(winGeo, MAT_HOUSING_WINDOW);
	win1.position.set(-0.14, 0.34, 0.351);
	const win2 = new THREE.Mesh(winGeo, MAT_HOUSING_WINDOW);
	win2.position.set(0.14, 0.34, 0.351);
	const win3 = new THREE.Mesh(winGeo, MAT_HOUSING_WINDOW);
	win3.position.set(0.351, 0.34, -0.05);
	win3.rotation.y = Math.PI / 2;

	group.add(body, roof, win1, win2, win3);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createDataCentreMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.8), MAT_DATACENTRE);
	body.position.y = 0.25;
	// small vent boxes on top
	const vent = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.15), MAT_CHIMNEY);
	vent.position.set(-0.25, 0.55, 0);
	const vent2 = vent.clone();
	vent2.position.set(0.25, 0.55, 0);

	// LED strip on front face
	const strip1 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.05), MAT_DC_WINDOW);
	strip1.position.set(0, 0.18, 0.401);
	// LED strip on right side
	const strip2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), MAT_DC_WINDOW);
	strip2.position.set(0.501, 0.18, 0);
	strip2.rotation.y = Math.PI / 2;
	// LED indicators on vents
	const ledGeo = new THREE.PlaneGeometry(0.04, 0.04);
	const led1 = new THREE.Mesh(ledGeo, MAT_DC_WINDOW);
	led1.position.set(-0.25, 0.55, 0.076);
	const led2 = new THREE.Mesh(ledGeo, MAT_DC_WINDOW);
	led2.position.set(0.25, 0.55, 0.076);

	group.add(body, vent, vent2, strip1, strip2, led1, led2);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createSolarMesh(): THREE.Group {
	const group = new THREE.Group();
	// Tilted panel
	const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.7), MAT_SOLAR);
	panel.position.y = 0.35;
	panel.rotation.x = -0.3;
	// Support pole
	const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), MAT_WIND_POLE);
	pole.position.y = 0.175;
	group.add(panel, pole);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createWindMesh(): THREE.Group {
	const group = new THREE.Group();
	// Tower
	const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 8), MAT_WIND_POLE);
	tower.position.y = 0.7;
	// Nacelle
	const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), MAT_WIND_POLE);
	nacelle.position.y = 1.4;
	// Blades (3 flat rectangles)
	const bladeGeo = new THREE.BoxGeometry(0.04, 0.5, 0.06);
	for (let i = 0; i < 3; i++) {
		const blade = new THREE.Mesh(bladeGeo, MAT_WIND_BLADE);
		blade.position.y = 1.4;
		blade.rotation.z = (i * Math.PI * 2) / 3;
		blade.position.x = Math.sin(blade.rotation.z) * 0.25;
		blade.position.y = 1.4 + Math.cos(blade.rotation.z) * 0.25;
		group.add(blade);
	}
	group.add(tower, nacelle);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createGasMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), MAT_GAS);
	body.position.y = 0.25;
	const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8), MAT_CHIMNEY);
	chimney.position.set(0.25, 0.7, 0);
	group.add(body, chimney);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createCoalMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.7), MAT_COAL);
	body.position.y = 0.275;
	const chimney1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), MAT_CHIMNEY);
	chimney1.position.set(0.2, 0.8, 0.1);
	const chimney2 = chimney1.clone();
	chimney2.position.set(-0.15, 0.75, -0.1);
	group.add(body, chimney1, chimney2);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createNuclearMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.9), MAT_NUCLEAR);
	body.position.y = 0.3;
	// Cooling tower (truncated cone)
	const cooling = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.6, 12), MAT_WIND_POLE);
	cooling.position.set(0.25, 0.9, 0);
	const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT_NUCLEAR);
	dome.position.set(-0.25, 0.6, 0);
	group.add(body, cooling, dome);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createOfficeMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.7), MAT_OFFICE);
	body.position.y = 0.45;
	// Window strips on front face
	const winGeo = new THREE.PlaneGeometry(0.55, 0.06);
	for (let i = 0; i < 3; i++) {
		const strip = new THREE.Mesh(winGeo, MAT_DC_WINDOW);
		strip.position.set(0, 0.25 + i * 0.25, 0.351);
		group.add(strip);
	}
	group.add(body);
	enableShadows(group);
	return group;
}

function createCommercialMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.8), MAT_COMMERCIAL);
	body.position.y = 0.2;
	// Awning overhang
	const awning = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.25), MAT_CHIMNEY);
	awning.position.set(0, 0.42, 0.35);
	group.add(body, awning);
	enableShadows(group);
	return group;
}

function createSchoolMesh(): THREE.Group {
	const group = new THREE.Group();
	// L-shaped: main wing + side wing
	const main = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.5), MAT_SCHOOL);
	main.position.set(0, 0.225, 0);
	const wing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.5), MAT_SCHOOL);
	wing.position.set(-0.3, 0.225, -0.45);
	group.add(main, wing);
	enableShadows(group);
	return group;
}

function createLeisureMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 16), MAT_LEISURE);
	body.position.y = 0.25;
	// Small sign plane on front
	const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.12), MAT_DC_WINDOW);
	sign.position.set(0, 0.45, 0.451);
	group.add(body, sign);
	enableShadows(group);
	return group;
}

function createMetroStationMesh(): THREE.Group {
	const group = new THREE.Group();
	// Rectangular station building
	const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.6), MAT_METRO);
	body.position.y = 0.175;
	// Entrance arch
	const arch = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.1), MAT_CHIMNEY);
	arch.position.set(0, 0.2, 0.35);
	group.add(body, arch);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createTrainStationMesh(): THREE.Group {
	const group = new THREE.Group();
	// Main hall
	const hall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), MAT_TRAIN);
	hall.position.y = 0.3;
	// Arched roof
	const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8, 1, false, 0, Math.PI), MAT_WIND_POLE);
	roof.rotation.z = Math.PI / 2;
	roof.position.y = 0.65;
	group.add(hall, roof);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createCyclePathMesh(): THREE.Group {
	const group = new THREE.Group();
	// Simple post with cycle symbol
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), MAT_CHIMNEY);
	post.position.y = 0.25;
	const sign = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), MAT_CYCLE);
	sign.position.set(0, 0.5, 0.01);
	group.add(post, sign);
	group.scale.setScalar(BUILDING_SCALE);
	enableShadows(group);
	return group;
}

function createParkMesh(): THREE.Group {
	const group = new THREE.Group();
	// Ground disc
	const ground = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 16), MAT_PARK_GROUND);
	ground.position.y = 0.01;
	// Small tree
	const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), MAT_PARK_TRUNK);
	trunk.position.set(0.1, 0.17, 0.05);
	const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 8), MAT_PARK_TREE);
	canopy.position.set(0.1, 0.5, 0.05);
	// Second smaller tree
	const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.22, 6), MAT_PARK_TRUNK);
	trunk2.position.set(-0.2, 0.13, -0.1);
	const canopy2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 8), MAT_PARK_TREE);
	canopy2.position.set(-0.2, 0.38, -0.1);
	group.add(ground, trunk, canopy, trunk2, canopy2);
	enableShadows(group);
	return group;
}

export type BuildingType =
	| 'housing'
	| 'dataCentre'
	| 'solar'
	| 'wind'
	| 'gas'
	| 'coal'
	| 'nuclear'
	| 'office'
	| 'commercial'
	| 'school'
	| 'leisure'
	| 'park'
	| 'road'
	| 'metro'
	| 'train'
	| 'cyclePath';

const MESH_CREATORS: Record<BuildingType, () => THREE.Group> = {
	housing: createHousingMesh,
	dataCentre: createDataCentreMesh,
	solar: createSolarMesh,
	wind: createWindMesh,
	gas: createGasMesh,
	coal: createCoalMesh,
	nuclear: createNuclearMesh,
	office: createOfficeMesh,
	commercial: createCommercialMesh,
	school: createSchoolMesh,
	leisure: createLeisureMesh,
	park: createParkMesh,
	metro: createMetroStationMesh,
	train: createTrainStationMesh,
	cyclePath: createCyclePathMesh,
	road: createCyclePathMesh, // Road is edge-based; this mesh is unused but required by type
};

export function createBuildingMesh(type: BuildingType): THREE.Group {
	return MESH_CREATORS[type]();
}

/* ── Cell-filling geometry (nuclear / gas / dataCentre) ─────────── */

function createCellExtrudedGeometry(cell: VoronoiCell, height: number): THREE.BufferGeometry {
	const cx = cell.center.x;
	const cz = cell.center.y;
	const verts = cell.vertices;
	const n = verts.length;

	const positions: number[] = [];
	const normals: number[] = [];

	// Top face (fan from center)
	for (let i = 0; i < n; i++) {
		const a = verts[i];
		const b = verts[(i + 1) % n];
		positions.push(0, height, 0);
		positions.push(a.x - cx, height, a.y - cz);
		positions.push(b.x - cx, height, b.y - cz);
		normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
	}

	// Bottom face (reversed winding)
	for (let i = 0; i < n; i++) {
		const a = verts[i];
		const b = verts[(i + 1) % n];
		positions.push(0, 0, 0);
		positions.push(b.x - cx, 0, b.y - cz);
		positions.push(a.x - cx, 0, a.y - cz);
		normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
	}

	// Side walls
	for (let i = 0; i < n; i++) {
		const a = verts[i];
		const b = verts[(i + 1) % n];
		const ax = a.x - cx, az = a.y - cz;
		const bx = b.x - cx, bz = b.y - cz;

		const edgeX = bx - ax, edgeZ = bz - az;
		const len = Math.hypot(edgeX, edgeZ) || 1;
		const nx = edgeZ / len, nz = -edgeX / len;

		positions.push(ax, 0, az, bx, 0, bz, ax, height, az);
		normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
		positions.push(bx, 0, bz, bx, height, bz, ax, height, az);
		normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	return geometry;
}

function createNuclearCellMesh(cell: VoronoiCell): THREE.Group {
	const height = 5;
	const group = new THREE.Group();

	const base = new THREE.Mesh(createCellExtrudedGeometry(cell, height), MAT_NUCLEAR);
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Cooling tower (truncated cone)
	const cooling = new THREE.Mesh(
		new THREE.CylinderGeometry(0.9, 1.4, 4, 12),
		MAT_WIND_POLE,
	);
	cooling.position.set(1.2, height + 2, 0);
	cooling.castShadow = true;
	group.add(cooling);

	// Containment dome
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
		MAT_NUCLEAR,
	);
	dome.position.set(-1.0, height, 0);
	dome.castShadow = true;
	group.add(dome);

	return group;
}

function createGasCellMesh(cell: VoronoiCell): THREE.Group {
	const height = 3.5;
	const group = new THREE.Group();

	const base = new THREE.Mesh(createCellExtrudedGeometry(cell, height), MAT_GAS);
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Chimney
	const chimney = new THREE.Mesh(
		new THREE.CylinderGeometry(0.35, 0.45, 3, 8),
		MAT_CHIMNEY,
	);
	chimney.position.set(1.0, height + 1.5, 0);
	chimney.castShadow = true;
	group.add(chimney);

	return group;
}

function createDataCentreCellMesh(cell: VoronoiCell): THREE.Group {
	const height = 2.5;
	const group = new THREE.Group();

	const base = new THREE.Mesh(createCellExtrudedGeometry(cell, height), MAT_DATACENTRE);
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Vent boxes on roof
	const ventGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
	const vent1 = new THREE.Mesh(ventGeo, MAT_CHIMNEY);
	vent1.position.set(-0.8, height + 0.2, 0.5);
	vent1.castShadow = true;
	const vent2 = new THREE.Mesh(ventGeo, MAT_CHIMNEY);
	vent2.position.set(0.8, height + 0.2, -0.5);
	vent2.castShadow = true;
	group.add(vent1, vent2);

	// LED indicators on vents
	const ledGeo = new THREE.PlaneGeometry(0.2, 0.2);
	const led1 = new THREE.Mesh(ledGeo, MAT_DC_WINDOW);
	led1.position.set(-0.8, height + 0.2, 0.81);
	const led2 = new THREE.Mesh(ledGeo, MAT_DC_WINDOW);
	led2.position.set(0.8, height + 0.2, -0.19);
	led2.rotation.y = Math.PI;
	group.add(led1, led2);

	return group;
}

const CELL_MESH_CREATORS: Partial<Record<BuildingType, (cell: VoronoiCell) => THREE.Group>> = {
	nuclear: createNuclearCellMesh,
	gas: createGasCellMesh,
	dataCentre: createDataCentreCellMesh,
};

/** Map of BuildingType → AssetCatalog id for GLB-based models. */
const GLB_MODEL_IDS: Partial<Record<BuildingType, string>> = {
	wind: 'wind-turbine',
};

/**
 * Create a building mesh, preferring a loaded GLB model when available.
 * For nuclear, gas, and dataCentre types, generates cell-filling geometry
 * when a VoronoiCell is provided.
 */
export function createBuildingModel(
	type: BuildingType,
	modelFactory?: ModelFactory,
	cell?: VoronoiCell,
): AnimatedModel {
	// Cell-filling buildings (nuclear, gas, dataCentre)
	const cellCreator = CELL_MESH_CREATORS[type];
	if (cell && cellCreator) {
		return { root: cellCreator(cell), mixer: null };
	}

	const catalogId = GLB_MODEL_IDS[type];
	if (catalogId && modelFactory) {
		try {
			return modelFactory.createAnimated(catalogId);
		} catch {
			// Fall back to procedural mesh if asset not loaded
		}
	}
	return { root: MESH_CREATORS[type](), mixer: null };
}

/** Derive the BuildingType from a simulation entity. */
export function buildingTypeFromSimEntity(entity: SimEntity): BuildingType {
	switch (entity.type) {
		case EntityType.Housing:
			return 'housing';
		case EntityType.DataCentre:
			return 'dataCentre';
		case EntityType.EnergyPlant:
			return entity.fuelType as BuildingType;
		case EntityType.Office:
			return 'office';
		case EntityType.Commercial:
			return 'commercial';
		case EntityType.School:
			return 'school';
		case EntityType.Leisure:
			return 'leisure';
		case EntityType.Park:
			return 'park';
		case EntityType.Transport:
			return 'metro'; // default transport visual
		default:
			return 'housing';
	}
}

/** Map a BuildingType back to the simulation factory parameters. */
export function simEntityTypeFromBuildingType(bt: BuildingType): { entityType: string; fuelType?: FuelType } {
	switch (bt) {
		case 'housing':
			return { entityType: EntityType.Housing };
		case 'dataCentre':
			return { entityType: EntityType.DataCentre };
		case 'solar':
			return { entityType: EntityType.EnergyPlant, fuelType: FuelType.Solar };
		case 'wind':
			return { entityType: EntityType.EnergyPlant, fuelType: FuelType.Wind };
		case 'gas':
			return { entityType: EntityType.EnergyPlant, fuelType: FuelType.Gas };
		case 'coal':
			return { entityType: EntityType.EnergyPlant, fuelType: FuelType.Coal };
		case 'nuclear':
			return { entityType: EntityType.EnergyPlant, fuelType: FuelType.Nuclear };
		case 'office':
			return { entityType: EntityType.Office };
		case 'commercial':
			return { entityType: EntityType.Commercial };
		case 'school':
			return { entityType: EntityType.School };
		case 'leisure':
			return { entityType: EntityType.Leisure };
		case 'park':
			return { entityType: EntityType.Park };
		case 'metro':
			return { entityType: EntityType.Transport };
		case 'train':
			return { entityType: EntityType.Transport };
		case 'cyclePath':
			return { entityType: EntityType.Transport };
		case 'road':
			return { entityType: EntityType.Transport };
	}
}

export const BUILDING_LABELS: Record<BuildingType, string> = {
	housing: 'Housing',
	dataCentre: 'Data Centre',
	solar: 'Solar Plant',
	wind: 'Wind Farm',
	gas: 'Gas Plant',
	coal: 'Coal Plant',
	nuclear: 'Nuclear Plant',
	office: 'Office',
	commercial: 'Commercial',
	school: 'School',
	leisure: 'Leisure',
	park: 'Park',
	metro: 'Metro Station',
	train: 'Train Station',
	cyclePath: 'Cycle Path',
	road: 'Road',
};

// ── Night-time building lights ───────────────────────────────

function housingGlow(hour: number): number {
	if (hour < 5) return 1.0;
	if (hour < 7) return 1.0 - (hour - 5) / 2;
	if (hour < 17) return 0.0;
	if (hour < 19) return (hour - 17) / 2;
	return 1.0;
}

function dataCentreGlow(hour: number): number {
	// Data centres run 24/7 — keep a faint LED glow even during daylight
	const base = 0.15;
	const nightBoost = 0.85;
	if (hour < 5) return base + nightBoost;
	if (hour < 7) return base + nightBoost * (1.0 - (hour - 5) / 2);
	if (hour < 17) return base;
	if (hour < 19) return base + nightBoost * ((hour - 17) / 2);
	return base + nightBoost;
}

/**
 * Update the shared emissive window / LED materials so buildings glow at
 * dusk, night and dawn.  Call once per frame with the current world hour.
 */
export function updateBuildingLights(hour: number): void {
	MAT_HOUSING_WINDOW.emissiveIntensity = housingGlow(hour);
	MAT_DC_WINDOW.emissiveIntensity = dataCentreGlow(hour);
}
