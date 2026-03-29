import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Terrain } from './Terrain';
import { Lighting } from './Lighting';
import { Environment } from './Environment';
import { CelestialBodies } from './CelestialBodies';
import { Palette } from '../rendering/Palette';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';
import { WorldClock } from '../gameplay/WorldClock';
import { AssetManager } from '../assets/AssetManager';
import type { ModelFactory } from '../assets/ModelFactory';

import type { GeometryFactory } from '../geometry/GeometryFactory';
import { EntityManager } from '../entities/EntityManager';

import { GridHighlighter } from '../grid/GridHighlighter';
import { GridPlacement } from '../grid/GridPlacement';
import type { BuiltGrid } from '../grid/GridBuilder';
import { VegetationInstancer } from './VegetationInstancer';
import { getCatalogEntry } from '../assets/AssetCatalog';
import type { BuildingType } from '../simulation/bridge/BuildingFactory';


/** Describes a batch of Forma meshes that map to a simulation entity type. */
export interface FormaManifestEntry {
	catalogId: string;
	simulationType: BuildingType;
	meshCount: number;
	/** World-space positions of individual meshes (computed after centering transform). */
	positions: THREE.Vector3[];
	/** References to individual meshes so each can become its own entity. */
	meshes: THREE.Mesh[];
}

const GROUPS = ['environment', 'terrain', 'entity', 'effects', 'debug'] as const;

export class GameScene {
	readonly root: THREE.Scene;
	private graph: SceneGraph;
	private terrain: Terrain;
	private lighting: Lighting;
	private environment: Environment;
	private celestialBodies: CelestialBodies;
	private assetManager: AssetManager;
	private materialRegistry: MaterialRegistry;
	private modelFactory: ModelFactory;
	private geometryFactory: GeometryFactory;
	private entityManager!: EntityManager;
	private grid: BuiltGrid;
	private gridHighlighter: GridHighlighter;
	private gridPlacement: GridPlacement;
	private vegetation: VegetationInstancer;
	private formaGroup: THREE.Group | null = null;
	private formaManifest: FormaManifestEntry[] = [];
	private formaRoadPositions: THREE.Vector3[] = [];

	constructor(assetManager: AssetManager, grid: BuiltGrid, materialRegistry: MaterialRegistry, modelFactory: ModelFactory, geometryFactory: GeometryFactory) {
		this.root = new THREE.Scene();
		this.root.background = new THREE.Color(Palette.background);

		this.graph = new SceneGraph(this.root);
		this.terrain = new Terrain();
		this.lighting = new Lighting();
		this.environment = new Environment();
		this.celestialBodies = new CelestialBodies();
		this.assetManager = assetManager;
		this.materialRegistry = materialRegistry;
		this.modelFactory = modelFactory;
		this.geometryFactory = geometryFactory;
		this.grid = grid;
		this.gridHighlighter = new GridHighlighter();
		this.gridPlacement = new GridPlacement(grid);
		this.vegetation = new VegetationInstancer();
	}

	init(): void {
		for (const name of GROUPS) {
			this.graph.createGroup(name);
		}

		this.entityManager = new EntityManager(this.graph.getGroup('entity'));
		this.entityManager.setMaterialRegistry(this.materialRegistry);

		this.terrain.init(this.graph, this.grid);
		this.lighting.init(this.graph);
		this.lighting.setCelestialBodies(this.celestialBodies);
		this.environment.init(this.root);
		this.celestialBodies.init(this.graph);

		// Add cell highlighter objects to the effects group
		for (const obj of this.gridHighlighter.getObjects()) {
			this.graph.addToGroup('effects', obj);
		}

		// Load Forma GLB models + instanced vegetation into a shared container
		// (same centering + scaling transform applied to all)
		this.loadFormaModels();

		console.log('[GameScene] Initialized.');
	}

	setWorldClock(clock: WorldClock): void {
		this.lighting.setWorldClock(clock);
		this.environment.setWorldClock(clock);
		this.celestialBodies.setWorldClock(clock);
	}

	update(delta: number): void {
		this.entityManager.update(delta);
		this.celestialBodies.update();
		this.lighting.update(delta);
		this.environment.update(delta);
	}

	getGroup(name: string): THREE.Group {
		return this.graph.getGroup(name);
	}

	getEnvironment(): Environment {
		return this.environment;
	}

	getAssetManager(): AssetManager {
		return this.assetManager;
	}

	getEntityManager(): EntityManager {
		return this.entityManager;
	}

	getGrid(): BuiltGrid {
		return this.grid;
	}

	getGridHighlighter(): GridHighlighter {
		return this.gridHighlighter;
	}

	getMaterialRegistry(): MaterialRegistry {
		return this.materialRegistry;
	}

	getModelFactory(): ModelFactory {
		return this.modelFactory;
	}

	getGeometryFactory(): GeometryFactory {
		return this.geometryFactory;
	}

	getGridPlacement(): GridPlacement {
		return this.gridPlacement;
	}

	getLighting(): Lighting {
		return this.lighting;
	}

	getFormaGroup(): THREE.Group | null {
		return this.formaGroup;
	}

	/** Remove all children from the Forma models group (imported GLBs, Copenhagen city model, vegetation). */
	clearFormaModels(): void {
		if (!this.formaGroup) return;
		// Dispose vegetation instancer first (nulls its mesh refs)
		this.vegetation.dispose();
		// Dispose geometry/materials for every descendant mesh
		this.formaGroup.traverse((obj) => {
			if (obj instanceof THREE.Mesh) {
				obj.geometry?.dispose();
				if (Array.isArray(obj.material)) {
					for (const m of obj.material) m.dispose();
				} else if (obj.material) {
					obj.material.dispose();
				}
			}
		});
		this.formaGroup.clear();
	}

	/** Manifest of Forma GLB models that have simulation type mappings. */
	getFormaManifest(): readonly FormaManifestEntry[] {
		return this.formaManifest;
	}

	/** World-space positions of Forma road meshes (for transport network registration). */
	getFormaRoadPositions(): readonly THREE.Vector3[] {
		return this.formaRoadPositions;
	}

	initEnvironmentMap(renderer: THREE.WebGLRenderer): void {
		this.lighting.initEnvironmentMap(renderer, this.root);
	}

	async loadEnvironmentHdr(renderer: THREE.WebGLRenderer, path: string): Promise<void> {
		await this.lighting.loadEnvironmentHdr(renderer, this.root, path);
	}

	private loadFormaModels(): void {
		const formaIds = ['roads', 'water', 'buildings', 'comercial', 'housing', 'leasure', 'school'];

		const container = new THREE.Group();
		container.name = 'forma-models';

		// Track which models have simulation mappings (positions collected after centering)
		const simModels: { id: string; simulationType: BuildingType; model: THREE.Object3D }[] = [];
		let roadsModel: THREE.Object3D | null = null;

		let loaded = 0;
		for (const id of formaIds) {
			const entry = getCatalogEntry(id);
			if (!entry) {
				console.warn(`[GameScene] No catalog entry for "${id}"`);
				continue;
			}
			try {
				const model = this.modelFactory.create(id);

				// Strip flat fill-rectangle meshes from Forma exports.
				// Water: never strip (all meshes are legitimate water bodies).
				// Roads: strip low-vertex-count rectangles (fills have large area
				//   but only 4-8 verts; real road segments are narrow → small area).
				// Other models: strip anything > 50m footprint and < 0.5m height.
				const isRoads = id === 'roads';
				const isWater = id === 'water';
				const toRemove: THREE.Mesh[] = [];
				if (!isWater) model.traverse((child) => {
					if (!(child instanceof THREE.Mesh)) return;
					child.geometry.computeBoundingBox();
					const bb = child.geometry.boundingBox;
					if (!bb) return;
					const sx = bb.max.x - bb.min.x;
					const sy = bb.max.y - bb.min.y;
					const sz = bb.max.z - bb.min.z;
					const footprint = Math.max(sx, sz);

					if (isRoads) {
						// Fill patches are big rectangles with few verts (area > 2000m², ≤ 8 verts).
						// Real roads are narrow, so area stays small even when long.
						const verts = child.geometry.getAttribute('position')?.count ?? 0;
						const areaM2 = (sx / 1000) * (sz / 1000);
						if (areaM2 > 2000 && verts <= 8) {
							toRemove.push(child);
						}
					} else if (sy < 400 && footprint > 3000 && bb.max.y < 1000) {
						// Flat surface (< 0.4m tall), wider than 3m, at ground level (top < 1m).
						// Catches Forma ground fills that sit between/under buildings.
						toRemove.push(child);
					}
				});
				for (const m of toRemove) {
					m.geometry.dispose();
					m.parent?.remove(m);
				}
				if (toRemove.length > 0) {
					console.log(`[GameScene] Stripped ${toRemove.length} ground surfaces from "${id}"`);
				}

				container.add(model);
				loaded++;

				if (entry.simulationType) {
					simModels.push({ id, simulationType: entry.simulationType, model });
				}
				if (id === 'roads') {
					roadsModel = model;
				}

				console.log(`[GameScene] Created model "${id}" — children: ${model.children.length}`);
			} catch (e) {
				console.warn(`[GameScene] Skipped "${id}":`, e);
			}
		}

		// Add instanced vegetation (same mm coordinate space as GLB models)
		this.vegetation.init(container);

		if (container.children.length === 0) {
			console.warn('[GameScene] No models loaded — nothing to show.');
			return;
		}

		// Everything in the container is in mm. Scale to meters.
		container.scale.setScalar(0.001);

		// Compute bounding box in world space (now meters) and center at origin
		const box = new THREE.Box3().setFromObject(container);
		if (box.isEmpty()) {
			console.warn('[GameScene] Bounding box is empty after loading models.');
			this.graph.getGroup('environment').add(container);
			return;
		}

		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());
		container.position.set(-center.x, 0, -center.z);

		this.formaGroup = container;
		this.graph.getGroup('environment').add(container);

		// Compute world-space mesh positions for simulation-mapped models
		// BEFORE merging (merging destroys individual mesh transforms).
		// Use bounding-box centers, not getWorldPosition(), because Forma GLBs
		// bake vertex positions into geometry — mesh nodes have identity transforms.
		container.updateMatrixWorld(true);
		const meshBox = new THREE.Box3();
		for (const { id, simulationType, model } of simModels) {
			const positions: THREE.Vector3[] = [];
			const meshes: THREE.Mesh[] = [];
			model.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					meshBox.setFromObject(child);
					if (!meshBox.isEmpty()) {
						positions.push(meshBox.getCenter(new THREE.Vector3()));
						meshes.push(child);
					}
				}
			});
			this.formaManifest.push({
				catalogId: id,
				simulationType,
				meshCount: positions.length,
				positions,
				meshes,
			});
		}

		// Collect road mesh world-space positions for transport network registration
		if (roadsModel) {
			roadsModel.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					meshBox.setFromObject(child);
					if (!meshBox.isEmpty()) {
						this.formaRoadPositions.push(meshBox.getCenter(new THREE.Vector3()));
					}
				}
			});
			console.log(`[GameScene] Collected ${this.formaRoadPositions.length} road mesh positions`);
		}


		console.log(`[GameScene] Loaded ${loaded} Forma models + vegetation`);
		console.log(`[GameScene]   Extent: ${size.x.toFixed(0)}m × ${size.z.toFixed(0)}m, center offset: (${center.x.toFixed(0)}, ${center.z.toFixed(0)})`);

		// Block grid cells that overlap water meshes
		this.blockWaterCells(container);
	}

	/** Find grid cells whose centers fall inside water mesh bounding boxes and mark them occupied. */
	private blockWaterCells(container: THREE.Group): void {
		// Collect world-space bounding boxes of all water meshes
		const waterBoxes: THREE.Box3[] = [];
		container.updateMatrixWorld(true);
		container.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;
			// Find meshes belonging to the water model
			let node: THREE.Object3D | null = child;
			while (node && node !== container) {
				if (node.name === 'model_water') {
					const box = new THREE.Box3().setFromObject(child);
					waterBoxes.push(box);
					break;
				}
				node = node.parent;
			}
		});

		if (waterBoxes.length === 0) return;

		// Test each grid cell center against water bounding boxes
		let blocked = 0;
		const testPoint = new THREE.Vector3();
		for (const cell of this.grid.cells) {
			testPoint.set(cell.center.x, 0, cell.center.y);
			for (const box of waterBoxes) {
				if (testPoint.x >= box.min.x && testPoint.x <= box.max.x &&
					testPoint.z >= box.min.z && testPoint.z <= box.max.z) {
					this.gridPlacement.markWater(cell.index);
					blocked++;
					break;
				}
			}
		}

		console.log(`[GameScene] Marked ${blocked} water cells (${waterBoxes.length} water meshes)`);

		// Build white fill under water cells to hide grid lines behind water
		const waterSet = this.gridPlacement.getWaterCells();
		if (waterSet.size > 0) {
			const mask = this.terrain.getGridRenderer().buildWaterMask(this.grid, waterSet as Set<number>);
			if (mask) {
				this.graph.getGroup('terrain').add(mask);
			}
		}
	}

	/** Raycast against Forma models; remove the hit mesh. Protects water and road meshes. */
	removeFormaMeshAt(raycaster: THREE.Raycaster): boolean {
		if (!this.formaGroup) return false;

		const hits = raycaster.intersectObject(this.formaGroup, true);
		for (const hit of hits) {
			const mesh = hit.object;
			if (!(mesh instanceof THREE.Mesh)) continue;

			// Walk up to check if this mesh belongs to a protected model
			let node: THREE.Object3D | null = mesh;
			let isProtected = false;
			while (node && node !== this.formaGroup) {
				if (node.name === 'model_water' || node.name === 'model_roads') {
					isProtected = true;
					break;
				}
				node = node.parent;
			}
			if (isProtected) continue;

			mesh.geometry.dispose();
			if (mesh.parent) mesh.parent.remove(mesh);
			console.log(`[GameScene] Removed Forma mesh: ${mesh.name || '(unnamed)'}`);
			return true;
		}
		return false;
	}

	/** Get the terrain grid renderer to control line opacity. */
	getGridRenderer() {
		return this.terrain.getGridRenderer();
	}

	dispose(): void {
		this.vegetation.dispose();
		this.lighting.dispose();
		this.celestialBodies.dispose();
		this.terrain.dispose();
		this.gridHighlighter.dispose();
		this.entityManager.clear();
		this.graph.dispose();
		console.log('[GameScene] Disposed.');
	}
}
