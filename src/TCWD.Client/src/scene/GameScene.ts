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

	initEnvironmentMap(renderer: THREE.WebGLRenderer): void {
		this.lighting.initEnvironmentMap(renderer, this.root);
	}

	async loadEnvironmentHdr(renderer: THREE.WebGLRenderer, path: string): Promise<void> {
		await this.lighting.loadEnvironmentHdr(renderer, this.root, path);
	}

	private loadFormaModels(): void {
		const formaIds = ['roads', 'water', 'buildings', 'comercial', 'housing'];

		const container = new THREE.Group();
		container.name = 'forma-models';

		let loaded = 0;
		for (const id of formaIds) {
			const entry = getCatalogEntry(id);
			if (!entry) {
				console.warn(`[GameScene] No catalog entry for "${id}"`);
				continue;
			}
			try {
				const model = this.modelFactory.create(id);
				container.add(model);
				loaded++;
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

		console.log(`[GameScene] Loaded ${loaded} Forma models + vegetation`);
		console.log(`[GameScene]   Extent: ${size.x.toFixed(0)}m × ${size.z.toFixed(0)}m, center offset: (${center.x.toFixed(0)}, ${center.z.toFixed(0)})`);
	}

	/** Raycast against Forma models; remove the hit mesh. Returns true if something was removed. */
	removeFormaMeshAt(raycaster: THREE.Raycaster): boolean {
		if (!this.formaGroup) return false;

		const hits = raycaster.intersectObject(this.formaGroup, true);
		if (hits.length === 0) return false;

		const mesh = hits[0].object;
		if (mesh instanceof THREE.Mesh) {
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
