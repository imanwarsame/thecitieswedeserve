import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Terrain } from './Terrain';
import { Lighting } from './Lighting';
import { Environment } from './Environment';
import { Palette } from '../rendering/Palette';
import { createStructureMaterial, createDetailMaterial, createAccentMaterial } from '../rendering/Materials';
import { WorldClock } from '../gameplay/WorldClock';
import { AssetManager } from '../assets/AssetManager';
import { EntityManager } from '../entities/EntityManager';
import { Entity } from '../entities/Entity';
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
	private assetManager: AssetManager;
	private entityManager!: EntityManager;
	private grid: BuiltGrid;
	private gridHighlighter: GridHighlighter;
	private gridPlacement: GridPlacement;

	constructor(assetManager: AssetManager, grid: BuiltGrid) {
		this.root = new THREE.Scene();
		this.root.background = new THREE.Color(Palette.background);

		this.graph = new SceneGraph(this.root);
		this.terrain = new Terrain();
		this.lighting = new Lighting();
		this.environment = new Environment();
		this.assetManager = assetManager;
		this.grid = grid;
		this.gridHighlighter = new GridHighlighter();
		this.gridPlacement = new GridPlacement(grid);
	}

	init(): void {
		for (const name of GROUPS) {
			this.graph.createGroup(name);
		}

		this.entityManager = new EntityManager(this.graph.getGroup('entity'));

		this.terrain.init(this.graph, this.grid);
		this.lighting.init(this.graph);
		this.environment.init(this.root);

		// Add cell highlighter objects to the effects group
		for (const obj of this.gridHighlighter.getObjects()) {
			this.graph.addToGroup('effects', obj);
		}

		this.spawnTestEntities();

		console.log('[GameScene] Initialized.');
	}

	setWorldClock(clock: WorldClock): void {
		this.lighting.setWorldClock(clock);
		this.environment.setWorldClock(clock);
	}

	update(delta: number): void {
		this.entityManager.update(delta);
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
		this.terrain.dispose();
		this.gridHighlighter.dispose();
		this.entityManager.clear();
		this.graph.dispose();
		console.log('[GameScene] Disposed.');
	}

	private spawnTestEntities(): void {
		const materials = [
			createStructureMaterial(),
			createDetailMaterial(),
			createAccentMaterial(),
		];

		// Place test entities on grid cells near the center
		const testCells = this.grid.query.findNearestCells(0, 0, 3);

		for (let i = 0; i < testCells.length; i++) {
			const cell = testCells[i];
			const worldPos = this.gridPlacement.getCellWorldPosition(cell.index, 0.5);
			if (!worldPos) continue;

			const geometry = new THREE.BoxGeometry(1, 1, 1);
			const mesh = new THREE.Mesh(geometry, materials[i]);
			mesh.castShadow = true;
			mesh.receiveShadow = true;

			const entity = new Entity({
				name: `test-cube-${i}`,
				mesh,
				position: worldPos,
				cellIndex: cell.index,
			});

			this.gridPlacement.occupyCell(cell.index);
			this.entityManager.spawn(entity);
		}

		console.log(`[GameScene] Spawned ${this.entityManager.count()} test entities on grid cells.`);
	}
}
