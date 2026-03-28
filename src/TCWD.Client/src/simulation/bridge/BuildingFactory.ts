import * as THREE from 'three';
import { EntityType, FuelType } from '../types';
import type { Entity as SimEntity } from '../entities/types';
import type { ModelFactory, AnimatedModel } from '../../assets/ModelFactory';

/**
 * Creates procedural 3D meshes for simulation entity types.
 * All meshes use monochrome materials consistent with the project's palette.
 */

const MAT_HOUSING = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.9, metalness: 0.0 });
const MAT_DATACENTRE = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.6, metalness: 0.2 });
const MAT_SOLAR = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.3, metalness: 0.4 });
const MAT_WIND_POLE = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.5, metalness: 0.3 });
const MAT_WIND_BLADE = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.4, metalness: 0.2 });
const MAT_GAS = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.8, metalness: 0.1 });
const MAT_COAL = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.9, metalness: 0.05 });
const MAT_NUCLEAR = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.7, metalness: 0.15 });
const MAT_CHIMNEY = new THREE.MeshStandardMaterial({ color: 0x686868, roughness: 0.85, metalness: 0.1 });

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
	group.add(body, roof);
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
	group.add(body, vent, vent2);
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
	| 'nuclear';

const MESH_CREATORS: Record<BuildingType, () => THREE.Group> = {
	housing: createHousingMesh,
	dataCentre: createDataCentreMesh,
	solar: createSolarMesh,
	wind: createWindMesh,
	gas: createGasMesh,
	coal: createCoalMesh,
	nuclear: createNuclearMesh,
};

export function createBuildingMesh(type: BuildingType): THREE.Group {
	return MESH_CREATORS[type]();
}

/** Map of BuildingType → AssetCatalog id for GLB-based models. */
const GLB_MODEL_IDS: Partial<Record<BuildingType, string>> = {
	wind: 'wind-turbine',
};

/**
 * Create a building mesh, preferring a loaded GLB model when available.
 * Returns an AnimatedModel with a mixer if the model has animations.
 */
export function createBuildingModel(
	type: BuildingType,
	modelFactory?: ModelFactory,
): AnimatedModel {
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
};
