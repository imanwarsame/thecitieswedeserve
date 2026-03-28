import { Renderer } from './Renderer';
import { Loop } from './Loop';
import { Time } from './Time';
import { Events, events } from './Events';
import { SceneManager } from './SceneManager';
import { GameScene } from '../scene/GameScene';
import { IsometricCamera } from '../camera/IsometricCamera';
import { CameraController } from '../camera/CameraController';
import { WorldClock } from '../gameplay/WorldClock';
import { TimeController } from '../gameplay/TimeController';
import { AssetManager } from '../assets/AssetManager';
import { RenderPipeline } from '../rendering/RenderPipeline';
import type { UpdateCallback } from './Loop';

export class Engine {
	private renderer: Renderer;
	private renderPipeline!: RenderPipeline;
	private loop!: Loop;
	private time: Time;
	private worldClock: WorldClock;
	private timeController!: TimeController;
	private isoCamera!: IsometricCamera;
	private cameraController!: CameraController;
	private resizeObserver!: ResizeObserver;
	private sceneManager: SceneManager;
	private assetManager: AssetManager;

	constructor() {
		this.renderer = new Renderer();
		this.sceneManager = new SceneManager();
		this.time = new Time();
		this.worldClock = new WorldClock();
		this.assetManager = new AssetManager();
	}

	async init(canvas: HTMLCanvasElement): Promise<void> {
		await this.renderer.init(canvas);

		this.timeController = new TimeController(this.time, this.worldClock);

		await this.assetManager.preload();

		const gameScene = new GameScene(this.assetManager);
		this.sceneManager.loadScene(gameScene);
		gameScene.setWorldClock(this.worldClock);

		this.isoCamera = new IsometricCamera(canvas.clientWidth, canvas.clientHeight);
		const camera = this.isoCamera.getCamera();

		this.cameraController = new CameraController();
		this.cameraController.init(this.isoCamera, canvas);

		this.renderPipeline = new RenderPipeline(this.renderer);
		this.renderPipeline.init(this.renderer.getWebGLRenderer(), gameScene.root, camera);

		this.loop = new Loop(this.renderPipeline, gameScene.root, camera, this.time);

		// Update loop order per Phase 10 spec:
		// 1. time.update()        — handled by Loop internally
		// 2. worldClock.update    — advance in-game time
		// 3. sceneManager.update  — entities, lighting, environment
		// 4. cameraController     — uses unscaledDelta for smooth movement during pause
		// 5. render               — handled by Loop internally
		this.loop.register((delta, unscaledDelta) => {
			this.worldClock.update(delta);
			this.sceneManager.update(delta);
			this.cameraController.update(unscaledDelta);
		});

		this.resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width === 0 || height === 0) continue;
				this.renderPipeline.resize(width, height);
				this.isoCamera.resize(width, height);
			}
		});
		this.resizeObserver.observe(canvas);

		console.log('[Engine] Initialized.');
	}

	start(): void {
		this.loop.start();
		console.log('[Engine] Started.');
	}

	stop(): void {
		this.loop?.stop();
		this.cameraController?.dispose();
		this.resizeObserver?.disconnect();
		this.sceneManager.dispose();
		this.assetManager.dispose();
		this.renderPipeline?.dispose();
		this.renderer.dispose();
		events.clear();
		console.log('[Engine] Stopped.');
	}

	pause(): void {
		this.time.pause();
	}

	resume(): void {
		this.time.resume();
	}

	registerUpdate(callback: UpdateCallback): void {
		this.loop.register(callback);
	}

	getRenderer(): Renderer {
		return this.renderer;
	}

	getRenderPipeline(): RenderPipeline {
		return this.renderPipeline;
	}

	getTime(): Time {
		return this.time;
	}

	getEvents(): Events {
		return events;
	}

	getWorldClock(): WorldClock {
		return this.worldClock;
	}

	getTimeController(): TimeController {
		return this.timeController;
	}

	getAssetManager(): AssetManager {
		return this.assetManager;
	}

	getScene(): GameScene {
		return this.sceneManager.getActiveScene();
	}

	getIsometricCamera(): IsometricCamera {
		return this.isoCamera;
	}

	getCameraController(): CameraController {
		return this.cameraController;
	}

	getLoop(): Loop {
		return this.loop;
	}

	getSceneManager(): SceneManager {
		return this.sceneManager;
	}
}
