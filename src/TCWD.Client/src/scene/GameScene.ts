import * as THREE from 'three';
import { SceneGraph } from './SceneGraph';
import { Terrain } from './Terrain';
import { Lighting } from './Lighting';
import { Environment } from './Environment';
import { WorldClock } from '../gameplay/WorldClock';
import { AssetManager } from '../assets/AssetManager';
import { EntityManager } from '../entities/EntityManager';
import { Entity } from '../entities/Entity';

const GROUPS = ['environment', 'terrain', 'entity', 'effects', 'debug'] as const;

export class GameScene {
	readonly root: THREE.Scene;
	private graph: SceneGraph;
	private terrain: Terrain;
	private lighting: Lighting;
	private environment: Environment;
	private assetManager: AssetManager;
	private entityManager!: EntityManager;

	constructor(assetManager: AssetManager) {
		this.root = new THREE.Scene();
		this.root.background = new THREE.Color(0x1a1a2e);

		this.graph = new SceneGraph(this.root);
		this.terrain = new Terrain();
		this.lighting = new Lighting();
		this.environment = new Environment();
		this.assetManager = assetManager;
	}

	init(): void {
		for (const name of GROUPS) {
			this.graph.createGroup(name);
		}

		this.entityManager = new EntityManager(this.graph.getGroup('entity'));

		this.terrain.init(this.graph);
		this.lighting.init(this.graph);
		this.environment.init(this.root);

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

	dispose(): void {
		this.entityManager.clear();
		this.graph.dispose();
		console.log('[GameScene] Disposed.');
	}

	private spawnTestEntities(): void {
		const colors = [0x6a5acd, 0xcd5a5a, 0x5acd6a];
		const positions: [number, number, number][] = [
			[0, 0.5, 0],
			[3, 0.5, -2],
			[-3, 0.5, 2],
		];

		for (let i = 0; i < 3; i++) {
			const geometry = new THREE.BoxGeometry(1, 1, 1);
			const material = new THREE.MeshStandardMaterial({ color: colors[i] });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;

			const entity = new Entity({
				name: `test-cube-${i}`,
				mesh,
				position: new THREE.Vector3(...positions[i]),
			});

			this.entityManager.spawn(entity);
		}

		console.log(`[GameScene] Spawned ${this.entityManager.count()} test entities.`);
	}
}
