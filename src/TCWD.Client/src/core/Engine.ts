import { Renderer } from './Renderer';
import { Loop } from './Loop';
import { Time } from './Time';
import { Input } from './Input';
import { Events, events } from './Events';
import { SceneManager } from './SceneManager';
import { GameScene } from '../scene/GameScene';
import { IsometricCamera } from '../camera/IsometricCamera';
import { CameraController } from '../camera/CameraController';
import { WorldClock } from '../gameplay/WorldClock';
import { TimeController } from '../gameplay/TimeController';
import { AssetManager } from '../assets/AssetManager';
import { RenderPipeline } from '../rendering/RenderPipeline';
import { SelectionManager } from '../rendering/SelectionManager';
import { installRadialFog } from '../rendering/RadialFog';
import type { UpdateCallback } from './Loop';

export class Engine {
	private renderer: Renderer;
	private renderPipeline!: RenderPipeline;
	private loop!: Loop;
	private time: Time;
	private input: Input;
	private worldClock: WorldClock;
	private timeController!: TimeController;
	private isoCamera!: IsometricCamera;
	private cameraController!: CameraController;
	private selectionManager!: SelectionManager;
	private resizeObserver!: ResizeObserver;
	private sceneManager: SceneManager;
	private assetManager: AssetManager;

	constructor() {
		this.renderer = new Renderer();
		this.sceneManager = new SceneManager();
		this.time = new Time();
		this.input = new Input();
		this.worldClock = new WorldClock();
		this.assetManager = new AssetManager();
	}

	async init(canvas: HTMLCanvasElement): Promise<void> {
		// Install radial fog shader patches BEFORE any materials are created
		installRadialFog();

		await this.renderer.init(canvas);

		this.timeController = new TimeController(this.time, this.worldClock);

		await this.assetManager.preload();

		const gameScene = new GameScene(this.assetManager);
		this.sceneManager.loadScene(gameScene);
		gameScene.setWorldClock(this.worldClock);
		gameScene.initEnvironmentMap(this.renderer.getWebGLRenderer());

		this.isoCamera = new IsometricCamera(canvas.clientWidth, canvas.clientHeight);
		const camera = this.isoCamera.getCamera();

		this.cameraController = new CameraController();
		this.cameraController.init(this.isoCamera, canvas);

		this.input.init(canvas);

		this.renderPipeline = new RenderPipeline(this.renderer);
		this.renderPipeline.init(this.renderer.getWebGLRenderer(), gameScene.root, camera);

		// Set up selection manager with outline passes
		this.selectionManager = new SelectionManager();
		const pp = this.renderPipeline.getPostProcessing();
		this.selectionManager.init(
			this.input,
			camera,
			gameScene.getGroup('entity'),
			pp.getHoverOutlinePass(),
			pp.getSelectOutlinePass(),
		);

		this.loop = new Loop(this.renderPipeline, gameScene.root, camera, this.time);

		// WorldClock is NOT auto-advanced here — shadows stay fixed at startHour.
		// Call worldClock.setHour() manually to change time of day.
		this.loop.register((delta, unscaledDelta) => {
			this.selectionManager.update();
			this.sceneManager.update(delta);
			this.cameraController.update(unscaledDelta);

			// Track fog center to camera's ground-plane target
			const env = gameScene.getEnvironment();
			env.setFogCenter(this.cameraController.getTargetPosition());
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
		this.selectionManager?.dispose();
		this.input?.dispose();
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

	getInput(): Input {
		return this.input;
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

	getSelectionManager(): SelectionManager {
		return this.selectionManager;
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
