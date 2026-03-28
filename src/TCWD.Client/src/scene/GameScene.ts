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
	}

	init(): void {
		for (const name of GROUPS) {
			this.graph.createGroup(name);
		}

		this.entityManager = new EntityManager(this.graph.getGroup('entity'));
		this.entityManager.setMaterialRegistry(this.materialRegistry);

		this.terrain.init(this.graph, this.grid);
		this.lighting.init(this.graph);
		this.environment.init(this.root);
		this.celestialBodies.init(this.graph);

		// Add cell highlighter objects to the effects group
		for (const obj of this.gridHighlighter.getObjects()) {
			this.graph.addToGroup('effects', obj);
		}

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

	dispose(): void {
		this.lighting.dispose();
		this.celestialBodies.dispose();
		this.terrain.dispose();
		this.gridHighlighter.dispose();
		this.entityManager.clear();
		this.graph.dispose();
		console.log('[GameScene] Disposed.');
	}
}
