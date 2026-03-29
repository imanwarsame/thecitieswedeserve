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
import { MaterialRegistry } from '../rendering/MaterialRegistry';
import { RenderPipeline } from '../rendering/RenderPipeline';
import { SelectionManager } from '../rendering/SelectionManager';
import { installRadialFog } from '../rendering/RadialFog';
import { HOUSING_COLORS } from '../rendering/Palette';
import { InfrastructureRenderer } from '../rendering/InfrastructureRenderer';
import { TransportRenderer } from '../rendering/TransportRenderer';
import { FlowOverlayRenderer } from '../rendering/FlowOverlayRenderer';
import { TransportModule } from '../simulation/transport/TransportModule';
import { ModelFactory } from '../assets/ModelFactory';
import { AssetCatalog, DefaultMaterialPresets } from '../assets/AssetCatalog';
import { GeometryFactory } from '../geometry/GeometryFactory';
import { EngineConfig } from '../app/config';
import { buildGrid, type BuiltGrid } from '../grid/GridBuilder';
import { SimulationBridge } from '../simulation/bridge/SimulationBridge';
import { updateBuildingLights, type BuildingType } from '../simulation/bridge/BuildingFactory';
import { HousingSystem } from '../housing/HousingSystem';
import { HousingController } from '../housing/HousingController';
import { HousingConfig } from '../housing/HousingConfig';
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
	private materialRegistry!: MaterialRegistry;
	private modelFactory!: ModelFactory;
	private geometryFactory!: GeometryFactory;
	private grid!: BuiltGrid;
	private simulationBridge!: SimulationBridge;
	private housingSystem!: HousingSystem;
	private housingController!: HousingController;
	private infrastructureRenderer!: InfrastructureRenderer;
	private transportModule!: TransportModule;
	private transportRenderer!: TransportRenderer;
	private flowOverlayRenderer!: FlowOverlayRenderer;
	private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	private raycaster = new THREE.Raycaster();
	private hoveredCellIndex = -1;
	private selectedCellIndex = -1;
	private _placementMode: BuildingType | null = null;
	/** First cell of a road placement (cell-to-cell). -1 = not started. */
	private _roadStartCell = -1;
	/** Tint applied to the next housing placement at the clicked cell. */
	private _housingColor = HOUSING_COLORS[0].hex;
	private onDeleteKey: (e: KeyboardEvent) => void = () => {};

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

		// Material registry & presets
		this.materialRegistry = new MaterialRegistry();
		for (const preset of DefaultMaterialPresets) {
			this.materialRegistry.definePreset(preset);
		}

		// Model factory & catalog registration
		this.modelFactory = new ModelFactory(this.assetManager, this.materialRegistry);
		this.modelFactory.registerCatalog(AssetCatalog);

		// Geometry factory
		this.geometryFactory = new GeometryFactory(this.materialRegistry);

		await this.assetManager.preload();

		// Build the organic grid
		this.grid = buildGrid();

		const gameScene = new GameScene(this.assetManager, this.grid, this.materialRegistry, this.modelFactory, this.geometryFactory);
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

		// Enable mesh-level selection on Forma GLB models
		const formaGroup = gameScene.getFormaGroup();
		if (formaGroup) this.selectionManager.setFormaGroup(formaGroup);

		// Simulation bridge — connects the 3D world to the headless simulation
		this.simulationBridge = new SimulationBridge(
			gameScene.getEntityManager(),
			gameScene.getGridPlacement(),
			this.worldClock,
			this.modelFactory,
		);

		// Housing system — WFC-driven stackable housing on the Voronoi grid
		const housingGroup = new THREE.Group();
		housingGroup.name = 'housing';
		gameScene.root.add(housingGroup);

		this.housingSystem = new HousingSystem(
			this.grid,
			this.materialRegistry,
			housingGroup,
		);

		this.housingController = new HousingController(
			this.housingSystem,
			gameScene.getGridPlacement(),
		);

		// Connect housing system to simulation so placed housing registers as energy demand
		this.simulationBridge.setHousingSystem(this.housingSystem);

		// Transport module — multi-modal Pop ABM
		this.transportModule = new TransportModule();
		this.transportModule.init(this.grid.cells);
		this.simulationBridge.setTransportModule(this.transportModule);

		// Infrastructure power-line visualisation
		this.infrastructureRenderer = new InfrastructureRenderer(
			gameScene.getGroup('effects'),
			gameScene.root,
			this.simulationBridge,
			gameScene.getEntityManager(),
		);

		// Transport network line visualisation
		this.transportRenderer = new TransportRenderer(
			gameScene.getGroup('effects'),
			this.transportModule,
			this.grid.cells,
		);

		// Population flow / congestion overlay (toggleable)
		this.flowOverlayRenderer = new FlowOverlayRenderer(
			this.transportModule,
			this.grid.cells,
			gameScene.root,
		);
		// Register the overlay's private scene so it renders after the EffectComposer,
		// bypassing GTAO / bloom darkening that was suppressing the ribbon visibility.
		this.renderPipeline.setOverlayScene(this.flowOverlayRenderer.getOverlayScene());

		this.loop = new Loop(this.renderPipeline, gameScene.root, camera, this.time);

		this.loop.register((delta, unscaledDelta) => {
			// Advance world clock each frame so time-of-day and simulation ticks progress
			this.worldClock.update(delta);

			// Sync building window / LED emissive glow to current hour
			updateBuildingLights(this.worldClock.getHour());

			// SelectionManager should NOT consume clicks — updateCellHover handles all click logic
			// Only run selection hover (no click consumption)
			this.selectionManager.updateHoverOnly();
			this.sceneManager.update(delta);
			this.cameraController.update(unscaledDelta);
			this.infrastructureRenderer.update(delta);
			this.transportRenderer.update();
			this.flowOverlayRenderer.update(delta);
			// Use unscaledDelta so animations play regardless of game time speed
			this.simulationBridge.updateAnimations(unscaledDelta);

			// Track fog center and shadow frustum center to camera's ground-plane target
			const env = gameScene.getEnvironment();
			const cameraTarget = this.cameraController.getTargetPosition();
			env.setFogCenter(cameraTarget);
			gameScene.getLighting().setShadowCenter(cameraTarget);

			// Adaptive grid: fade lines based on zoom level
			const zoom = this.isoCamera.getZoom();
			const gridOpacity = THREE.MathUtils.smoothstep(zoom, 0.2, 1.0) * 0.5;
			gameScene.getGridRenderer().setOpacity(gridOpacity);

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

		// Delete/Backspace removes selected Forma mesh
		this.onDeleteKey = (e: KeyboardEvent) => {
			if (e.key === 'Delete' || e.key === 'Backspace') {
				const selected = this.selectionManager.getSelected();
				if (selected && selected instanceof THREE.Mesh) {
					selected.geometry.dispose();
					if (selected.parent) selected.parent.remove(selected);
					this.selectionManager.clearSelection();
					console.log(`[Engine] Deleted mesh: ${selected.name || '(unnamed)'}`);
				}
			}
		};
		window.addEventListener('keydown', this.onDeleteKey);

		console.log('[Engine] Initialized.');
	}

	start(): void {
		this.loop.start();
		// Start with zoom extents so the full scene is visible on page load
		this.cameraController.zoomExtents(this.sceneManager.getActiveScene().root);
		console.log('[Engine] Started.');
	}

	stop(): void {
		this.loop?.stop();
		this.housingController?.dispose();
		this.housingSystem?.dispose();
		this.simulationBridge?.dispose();
		this.transportRenderer?.dispose();
		this.flowOverlayRenderer?.dispose();
		this.infrastructureRenderer?.dispose();
		this.selectionManager?.dispose();
		this.input?.dispose();
		this.cameraController?.dispose();
		this.resizeObserver?.disconnect();
		window.removeEventListener('keydown', this.onDeleteKey);
		this.sceneManager.dispose();
		this.materialRegistry?.dispose();
		this.assetManager.dispose();
		this.renderPipeline?.dispose();
		this.renderer.dispose();
		// NOTE: Do NOT call events.clear() here. Each component's dispose()
		// already removes its own listeners. A blanket clear() on the global
		// singleton destroys listeners belonging to a *new* Engine instance
		// when React StrictMode causes overlapping init/teardown cycles.
		console.log('[Engine] Stopped.');
	}

	/** Remove every user-placed element (buildings, housing, roads, imported models) and reset to a blank slate. */
	clearAll(): void {
		const gameScene = this.sceneManager.getActiveScene();

		// 1. Deselect everything
		this.deselectCell();
		this.selectionManager.clearSelection();
		this._placementMode = null;
		this._roadStartCell = -1;
		this.hoveredCellIndex = -1;

		// 2. Clear simulation bridge (entities ↔ sim mappings, resets sim engine)
		this.simulationBridge.clearAll();

		// 3. Clear 3D entities
		gameScene.getEntityManager().clear();

		// 4. Clear grid placement (occupied cells)
		gameScene.getGridPlacement().clearAll();

		// 5. Clear housing (voxel grid + meshes)
		this.housingSystem.dispose();

		// 6. Re-initialise transport network from grid (clears roads, metro, train)
		this.transportModule.init(this.grid.cells);

		// 7. Clear Forma / imported model meshes
		gameScene.clearFormaModels();

		// 8. Force renderers to rebuild (they'll find nothing to draw)
		events.emit('simulation:tick', this.simulationBridge.getState());
		events.emit('placement:modeChanged', null);

		console.log('[Engine] Cleared all user content.');
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

	getMaterialRegistry(): MaterialRegistry {
		return this.materialRegistry;
	}

	getModelFactory(): ModelFactory {
		return this.modelFactory;
	}

	getGeometryFactory(): GeometryFactory {
		return this.geometryFactory;
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

	getFlowOverlayRenderer(): FlowOverlayRenderer {
		return this.flowOverlayRenderer;
	}

	getHousingSystem(): HousingSystem {
		return this.housingSystem;
	}

	getHousingController(): HousingController {
		return this.housingController;
	}

	getPlacementMode(): BuildingType | null {
		return this._placementMode;
	}

	setPlacementMode(type: BuildingType | null): void {
		this._placementMode = type;
		this._roadStartCell = -1;
		if (type !== 'housing') {
			this.housingController.setAction('none');
		}
		// Auto-show transit lines when entering metro/train drawing mode
		if (type === 'metro' || type === 'train') {
			this.transportRenderer.setTransitLinesVisible(true);
		}
		events.emit('placement:modeChanged', type);
	}

	getTransportRenderer(): TransportRenderer {
		return this.transportRenderer;
	}

	setHousingColor(color: number): void {
		this._housingColor = color;
	}

	getSelectedCellIndex(): number {
		return this.selectedCellIndex;
	}

	getHoveredCellIndex(): number {
		return this.hoveredCellIndex;
	}

	/** Select a cell, always emitting the event (even if already selected — used after placement). */
	forceSelectCell(cellIndex: number): void {
		const prev = this.selectedCellIndex;
		this.selectedCellIndex = cellIndex;
		if (prev !== -1 && prev !== cellIndex) {
			events.emit('grid:cellDeselected', { cellIndex: prev });
		}
		if (cellIndex !== -1) {
			const cell = this.grid.query.getCell(cellIndex);
			const entity = this.sceneManager.getActiveScene().getEntityManager().getEntityAtCell(cellIndex);
			events.emit('grid:cellSelected', { cellIndex, cell, entity });
		}
		this.syncSelectionOutline(cellIndex);
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
		this.syncSelectionOutline(cellIndex);
	}

	deselectCell(): void {
		if (this.selectedCellIndex === -1) return;
		const prev = this.selectedCellIndex;
		this.selectedCellIndex = -1;
		events.emit('grid:cellDeselected', { cellIndex: prev });
		this.selectionManager.setSelected(null);
	}

	private syncSelectionOutline(cellIndex: number): void {
		if (cellIndex === -1) {
			this.selectionManager.setSelected(null);
			return;
		}

		const entity = this.sceneManager.getActiveScene().getEntityManager().getEntityAtCell(cellIndex);
		this.selectionManager.setSelected(entity?.mesh ?? null);
	}

	private updateCellHover(gameScene: GameScene, camera: THREE.Camera): void {
		this.raycaster.setFromCamera(this.input.mouse, camera);

		const intersection = new THREE.Vector3();
		const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersection);

		const highlighter = gameScene.getGridHighlighter();

		if (hit) {
			const cell = this.grid.query.getCellAt(intersection.x, intersection.z);
			const cellIndex = cell ? cell.index : -1;

			// Highlight at building top if housing exists, otherwise ground
			let highlightY = 0;
			if (cell) {
				const h = this.housingSystem.getHeight(cellIndex);
				if (h > 0) highlightY = h * HousingConfig.layerHeight;
			}
			highlighter.setCell(cell, highlightY);

			// Highlight color based on mode
			if (cell && this._placementMode) {
				const isTransitDraw = (this._placementMode === 'metro' || this._placementMode === 'train');
				if (this._placementMode === 'road' as BuildingType && this._roadStartCell !== -1) {
					// Road drawing: show "build" highlight on the hovered cell
					// to signal that clicking will complete the road segment
					const isNeighbor = this.grid.query.getCell(this._roadStartCell)?.neighbors.includes(cellIndex);
					highlighter.setMode(isNeighbor ? 'build' : 'occupied');
				} else if (isTransitDraw && this._roadStartCell !== -1) {
					// Metro/train link drawing: any cell is a valid target
					highlighter.setMode('build');
				} else {
					const hasHousing = this.housingSystem.hasHousing(cellIndex);
					const isFree = gameScene.getGridPlacement().isCellFree(cellIndex);
					if (!isFree && !hasHousing) {
						highlighter.setMode('default');
					} else if (hasHousing) {
						highlighter.setMode('occupied');
					} else {
						highlighter.setMode('build');
					}
				}
			} else {
				highlighter.setMode('default');
			}

			// Hover changed
			if (cellIndex !== this.hoveredCellIndex) {
				this.hoveredCellIndex = cellIndex;
				if (cell) {
					const entity = gameScene.getEntityManager().getEntityAtCell(cellIndex);
					events.emit('grid:cellHovered', { cellIndex, cell, entity });
				}
			}

			// Double-click outside any cell → zoom extents
			if (this.input.consumeDoubleClick()) {
				if (!cell) {
					this.cameraController.zoomExtents(this.sceneManager.getActiveScene().root);
					this.deselectCell();
					return;
				}
			}

			// Shift+Click: remove a Forma model mesh under cursor
			if (this.input.shiftDown && this.input.consumeClick()) {
				this.raycaster.setFromCamera(this.input.mouse, camera);
				gameScene.removeFormaMeshAt(this.raycaster);
				return;
			}

			// Click — Forma mesh selection takes priority over grid cell
			// (skip mesh hover check in road/metro/train mode so cell-filling buildings don't block placement)
			if (this.input.consumeClick()) {
				const skipMeshHover = this._placementMode === 'road' || this._placementMode === 'metro' || this._placementMode === 'train';
				const hoveredMesh = !skipMeshHover ? this.selectionManager.getHovered() : null;
				if (hoveredMesh) {
					// If the hovered mesh belongs to an entity, do a proper cell selection
					// so cell-filling buildings (office, gas, etc.) trigger the info/delete UI.
					const ownedEntity = gameScene.getEntityManager().getEntityByMesh(hoveredMesh);
					if (ownedEntity && ownedEntity.cellIndex >= 0) {
						this.forceSelectCell(ownedEntity.cellIndex);
						return;
					}
					// Otherwise it's a Forma mesh — select it directly
					this.selectionManager.setSelected(hoveredMesh);
					return;
				}

				if (cell) {
					if (this._placementMode) {
						// Road placement: cell-to-cell (click A then adjacent B)
						if (this._placementMode === 'road' as BuildingType) {
							if (this._roadStartCell === -1) {
								// First click — mark start cell
								this._roadStartCell = cellIndex;
								events.emit('transport:roadStarted', { cellIndex });
								return;
							} else {
								const from = this._roadStartCell;
								// Only allow adjacent cells
								const fromCell = this.grid.query.getCell(from);
								if (fromCell && fromCell.neighbors.includes(cellIndex)) {
									this.simulationBridge.addRoad(from, cellIndex);
									// Chain mode: endpoint becomes new start for continuous drawing
									this._roadStartCell = cellIndex;
								} else {
									// Non-adjacent — restart from clicked cell
									this._roadStartCell = cellIndex;
								}
								return;
							}
						}

						// Metro / Train placement: two-click link drawing (no adjacency constraint)
						if (this._placementMode === 'metro' || this._placementMode === 'train') {
							if (this._roadStartCell === -1) {
								// First click — place station and mark start
								const isFree = gameScene.getGridPlacement().isCellFree(cellIndex);
								if (isFree) {
									this.simulationBridge.addBuilding(this._placementMode, cellIndex);
								}
								this._roadStartCell = cellIndex;
								return;
							} else {
								const from = this._roadStartCell;
								if (from !== cellIndex) {
									// Place station at target if the cell is free
									const isFree = gameScene.getGridPlacement().isCellFree(cellIndex);
									if (isFree) {
										this.simulationBridge.addBuilding(this._placementMode, cellIndex);
									}
									// Create the link between the two stations
									if (this._placementMode === 'metro') {
										this.simulationBridge.addMetroLink(from, cellIndex);
									} else {
										this.simulationBridge.addTrainLink(from, cellIndex);
									}
									// Chain mode: endpoint becomes new start
									this._roadStartCell = cellIndex;
								}
								return;
							}
						}

						if (this._placementMode === 'housing') {
							// Housing placement mode — place or stack
							const hasHousing = this.housingSystem.hasHousing(cellIndex);
							const isFree = gameScene.getGridPlacement().isCellFree(cellIndex);
							if (isFree || hasHousing) {
								this.housingSystem.setHousingColor(cellIndex, this._housingColor);
								this.housingController.setAction('build');
								events.emit('grid:cellClicked', { cellIndex, cell, entity: null });
								this.forceSelectCell(cellIndex);
								return;
							}
						} else {
							// Non-housing placement (solar, wind, etc.)
							const placed = this.simulationBridge.addBuilding(this._placementMode, cellIndex);
							if (placed) this.forceSelectCell(cellIndex);
							return;
						}
					}

					const entity = gameScene.getEntityManager().getEntityAtCell(cellIndex);
					events.emit('grid:cellClicked', { cellIndex, cell, entity });
					if (this.selectedCellIndex === cellIndex) {
						this.deselectCell();
					} else {
						this.selectCell(cellIndex);
					}
				}
			}
		} else {
			highlighter.setCell(null);

			if (this.hoveredCellIndex !== -1) {
				this.hoveredCellIndex = -1;
			}

			// Double-click on empty space → zoom extents
			if (this.input.consumeDoubleClick()) {
				this.cameraController.zoomExtents(this.sceneManager.getActiveScene().root);
				this.deselectCell();
				return;
			}

			// Click on empty space — select hovered forma mesh or deselect
			if (this.input.consumeClick()) {
				const hovered = this.selectionManager.getHovered();
				if (hovered) {
					this.selectionManager.setSelected(hovered);
				} else {
					this.deselectCell();
					this.selectionManager.clearSelection();
				}
			}
		}
	}
}
