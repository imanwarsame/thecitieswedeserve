import * as THREE from 'three';
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
import { InfrastructureRenderer } from '../rendering/InfrastructureRenderer';
import { EngineConfig } from '../app/config';
import { buildGrid, type BuiltGrid } from '../grid/GridBuilder';
import { SimulationBridge } from '../simulation/bridge/SimulationBridge';
import type { BuildingType } from '../simulation/bridge/BuildingFactory';
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
	private grid!: BuiltGrid;
	private simulationBridge!: SimulationBridge;
	private infrastructureRenderer!: InfrastructureRenderer;
	private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	private raycaster = new THREE.Raycaster();
	private hoveredCellIndex = -1;
	private selectedCellIndex = -1;
	private _placementMode: BuildingType | null = null;

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

		// Build the organic grid
		this.grid = buildGrid();

		const gameScene = new GameScene(this.assetManager, this.grid);
		this.sceneManager.loadScene(gameScene);
		gameScene.setWorldClock(this.worldClock);

		// Load HDR environment if configured, otherwise use fallback
		if (EngineConfig.environment.hdrPath) {
			await gameScene.loadEnvironmentHdr(
				this.renderer.getWebGLRenderer(),
				EngineConfig.environment.hdrPath,
			);
		} else {
			gameScene.initEnvironmentMap(this.renderer.getWebGLRenderer());
		}

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

		// Simulation bridge — connects the 3D world to the headless simulation
		this.simulationBridge = new SimulationBridge(
			gameScene.getEntityManager(),
			gameScene.getGridPlacement(),
		);

		// Infrastructure power-line visualisation
		this.infrastructureRenderer = new InfrastructureRenderer(
			gameScene.getGroup('effects'),
			this.simulationBridge,
			gameScene.getEntityManager(),
		);

		this.loop = new Loop(this.renderPipeline, gameScene.root, camera, this.time);

		this.loop.register((delta, unscaledDelta) => {
			// Advance world clock each frame so time-of-day and simulation ticks progress
			this.worldClock.update(delta);

			// Only let SelectionManager consume clicks when NOT in placement mode
			if (!this._placementMode) {
				this.selectionManager.update();
			}
			this.sceneManager.update(delta);
			this.cameraController.update(unscaledDelta);
			this.infrastructureRenderer.update(delta);

			// Track fog center to camera's ground-plane target
			const env = gameScene.getEnvironment();
			env.setFogCenter(this.cameraController.getTargetPosition());

			// Cell hover highlight
			this.updateCellHover(gameScene, camera);
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
		this.simulationBridge?.dispose();
		this.infrastructureRenderer?.dispose();
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

	getGrid(): BuiltGrid {
		return this.grid;
	}

	getSceneManager(): SceneManager {
		return this.sceneManager;
	}

	getSimulationBridge(): SimulationBridge {
		return this.simulationBridge;
	}

	getPlacementMode(): BuildingType | null {
		return this._placementMode;
	}

	setPlacementMode(type: BuildingType | null): void {
		this._placementMode = type;
		events.emit('placement:modeChanged', type);
	}

	getSelectedCellIndex(): number {
		return this.selectedCellIndex;
	}

	getHoveredCellIndex(): number {
		return this.hoveredCellIndex;
	}

	selectCell(cellIndex: number): void {
		if (this.selectedCellIndex === cellIndex) return;
		const prev = this.selectedCellIndex;
		this.selectedCellIndex = cellIndex;
		if (prev !== -1) {
			events.emit('grid:cellDeselected', { cellIndex: prev });
		}
		if (cellIndex !== -1) {
			const cell = this.grid.query.getCell(cellIndex);
			const entity = this.sceneManager.getActiveScene().getEntityManager().getEntityAtCell(cellIndex);
			events.emit('grid:cellSelected', { cellIndex, cell, entity });
		}
	}

	deselectCell(): void {
		if (this.selectedCellIndex === -1) return;
		const prev = this.selectedCellIndex;
		this.selectedCellIndex = -1;
		events.emit('grid:cellDeselected', { cellIndex: prev });
	}

	private updateCellHover(gameScene: GameScene, camera: THREE.Camera): void {
		this.raycaster.setFromCamera(this.input.mouse, camera);

		const intersection = new THREE.Vector3();
		const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersection);

		const highlighter = gameScene.getGridHighlighter();

		if (hit) {
			const cell = this.grid.query.getCellAt(intersection.x, intersection.z);
			highlighter.setCell(cell);

			const cellIndex = cell ? cell.index : -1;

			// Hover changed
			if (cellIndex !== this.hoveredCellIndex) {
				this.hoveredCellIndex = cellIndex;
				if (cell) {
					const entity = gameScene.getEntityManager().getEntityAtCell(cellIndex);
					events.emit('grid:cellHovered', { cellIndex, cell, entity });
				}
			}

			// Click
			if (this.input.consumeClick() && cell) {
				// Placement mode: place a building on the clicked cell
				if (this._placementMode) {
					const placed = this.simulationBridge.addBuilding(this._placementMode, cellIndex);
					if (placed) {
						this.selectCell(cellIndex);
					}
					return;
				}

				const entity = gameScene.getEntityManager().getEntityAtCell(cellIndex);
				events.emit('grid:cellClicked', { cellIndex, cell, entity });

				// Toggle selection
				if (this.selectedCellIndex === cellIndex) {
					this.deselectCell();
				} else {
					this.selectCell(cellIndex);
				}
			}
		} else {
			highlighter.setCell(null);

			if (this.hoveredCellIndex !== -1) {
				this.hoveredCellIndex = -1;
			}

			// Click on empty space deselects
			if (this.input.consumeClick()) {
				this.deselectCell();
			}
		}
	}
}
