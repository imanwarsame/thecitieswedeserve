import * as THREE from 'three';
import { events } from '../core/Events';
import type { VoronoiCell } from '../grid/types';
import type { SimulationBridge } from '../simulation/bridge/SimulationBridge';
import type { BuildingType } from '../simulation/bridge/BuildingFactory';

// ── Zone Overlay Renderer ─────────────────────────────────────────────────────
//
// Two toggleable overlay modes:
//
//   • Land Use  — translucent cell polygons coloured by BuildingType category.
//   • Energy Use — actual building meshes tinted green → yellow → red by kWh.

export type ZoneOverlayMode = 'landUse' | 'energyUse';

const OVERLAY_Y = 0.06;
const FILL_OPACITY = 0.45;

// ── Land-use colour palette ─────────────────────────────────

type LandUseCategory =
	| 'residential'
	| 'commercial'
	| 'office'
	| 'industrial'
	| 'energy'
	| 'civic'
	| 'green'
	| 'transport';

const LAND_USE_COLORS: Record<LandUseCategory, number> = {
	residential: 0x5b9bd5, // soft blue
	commercial:  0xed7d31, // warm orange
	office:      0xffc000, // golden yellow
	industrial:  0x808080, // neutral grey
	energy:      0xa855f7, // purple
	civic:       0x70ad47, // olive-green
	green:       0x2ecc71, // vivid green
	transport:   0x95a5a6, // silver
};

function buildingTypeToCategory(bt: BuildingType): LandUseCategory {
	switch (bt) {
		case 'housing':      return 'residential';
		case 'commercial':   return 'commercial';
		case 'office':       return 'office';
		case 'dataCentre':   return 'industrial';
		case 'solar':
		case 'wind':
		case 'gas':
		case 'coal':
		case 'nuclear':      return 'energy';
		case 'school':
		case 'leisure':      return 'civic';
		case 'park':         return 'green';
		case 'road':
		case 'metro':
		case 'train':
		case 'cyclePath':    return 'transport';
		default:             return 'residential';
	}
}

/** Green (low) → yellow → red (high energy). */
function energyToColor(normalized: number): THREE.Color {
	const hue = (1 - Math.min(normalized, 1)) * (120 / 360);
	return new THREE.Color().setHSL(hue, 0.85, 0.50);
}

// ── Saved material state for restoring after energy overlay ──

interface SavedMaterial {
	material: THREE.MeshStandardMaterial;
	color: THREE.Color;
	emissive: THREE.Color;
	emissiveIntensity: number;
}

// ── Renderer ────────────────────────────────────────────────

export class ZoneOverlayRenderer {
	// Land use overlay scene (cell polygons)
	private overlayScene = new THREE.Scene();
	private group: THREE.Group;
	private mesh: THREE.Mesh | null = null;
	private disposables: (THREE.Material | THREE.BufferGeometry)[] = [];

	private simulationBridge: SimulationBridge;
	private cells: readonly VoronoiCell[];
	private housingGroup: THREE.Group;

	private _mode: ZoneOverlayMode = 'landUse';
	private _visible = false;
	private dirty = true;

	// Energy use — saved material originals for restore
	private savedMaterials: SavedMaterial[] = [];
	private energyActive = false;

	constructor(
		simulationBridge: SimulationBridge,
		cells: readonly VoronoiCell[],
		housingGroup: THREE.Group,
	) {
		this.simulationBridge = simulationBridge;
		this.cells = cells;
		this.housingGroup = housingGroup;

		this.group = new THREE.Group();
		this.group.name = 'zone-overlay';
		this.group.visible = false;
		this.overlayScene.add(this.group);

		events.on('simulation:tick', this.markDirty);
		events.on('building:placed', this.markDirty);
		events.on('building:removed', this.markDirty);
	}

	// ── Public API ───────────────────────────────────────────

	setVisible(visible: boolean): void {
		this._visible = visible;

		if (visible) {
			this.dirty = false;
			this.rebuild();
		} else {
			this.clearLandUse();
			this.restoreEnergyColors();
		}
	}

	isVisible(): boolean {
		return this._visible;
	}

	setMode(mode: ZoneOverlayMode): void {
		if (mode === this._mode && this._visible) return;
		// Tear down old mode
		this.clearLandUse();
		this.restoreEnergyColors();
		this._mode = mode;
		if (this._visible) {
			this.dirty = false;
			this.rebuild();
		}
	}

	getMode(): ZoneOverlayMode {
		return this._mode;
	}

	getOverlayScene(): THREE.Scene {
		return this.overlayScene;
	}

	update(_delta: number): void {
		if (this.dirty && this._visible) {
			this.dirty = false;
			this.rebuild();
		}
	}

	dispose(): void {
		events.off('simulation:tick', this.markDirty);
		events.off('building:placed', this.markDirty);
		events.off('building:removed', this.markDirty);
		this.clearLandUse();
		this.restoreEnergyColors();
		this.group.parent?.remove(this.group);
	}

	/** Legend entries for the current mode — consumed by UI. */
	getLegend(): { label: string; color: string }[] {
		if (this._mode === 'landUse') {
			return [
				{ label: 'Residential', color: '#5b9bd5' },
				{ label: 'Commercial',  color: '#ed7d31' },
				{ label: 'Office',      color: '#ffc000' },
				{ label: 'Industrial',  color: '#808080' },
				{ label: 'Energy',      color: '#a855f7' },
				{ label: 'Civic',       color: '#70ad47' },
				{ label: 'Green Space', color: '#2ecc71' },
				{ label: 'Transport',   color: '#95a5a6' },
			];
		}
		return [
			{ label: 'Low',    color: '#22c55e' },
			{ label: 'Medium', color: '#eab308' },
			{ label: 'High',   color: '#ef4444' },
		];
	}

	// ── Private ──────────────────────────────────────────────

	private markDirty = (): void => {
		this.dirty = true;
	};

	private clearLandUse(): void {
		if (this.mesh) {
			this.group.remove(this.mesh);
			this.mesh = null;
		}
		for (const d of this.disposables) d.dispose();
		this.disposables = [];
		this.group.visible = false;
	}

	private rebuild(): void {
		if (this._mode === 'landUse') {
			this.restoreEnergyColors();
			this.clearLandUse();
			this.buildLandUse();
		} else {
			this.clearLandUse();
			this.applyEnergyColors();
		}
	}

	// ── Land Use (cell polygons in overlay scene) ────────────

	private buildLandUse(): void {
		const cellData = this.simulationBridge.getCellLandUseMap();
		if (cellData.size === 0) return;

		const positions: number[] = [];
		const colors: number[] = [];
		const tmpColor = new THREE.Color();

		for (const [cellIndex, buildingType] of cellData) {
			const cell = this.cells[cellIndex];
			if (!cell?.vertices || cell.vertices.length < 3) continue;

			const category = buildingTypeToCategory(buildingType);
			tmpColor.set(LAND_USE_COLORS[category]);
			this.fanTriangles(cell, tmpColor, positions, colors);
		}

		if (positions.length === 0) return;

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

		const material = new THREE.MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: FILL_OPACITY,
			depthWrite: false,
			depthTest: false,
			side: THREE.DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2,
		});

		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = 'zone-fill';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 5;
		this.group.add(this.mesh);
		this.group.visible = true;

		this.disposables.push(geometry, material);
	}

	/** Fan-triangulate a Voronoi cell into vertex arrays. */
	private fanTriangles(
		cell: VoronoiCell,
		color: THREE.Color,
		positions: number[],
		colors: number[],
	): void {
		const cx = cell.center.x;
		const cz = cell.center.y;
		const verts = cell.vertices;
		const n = verts.length;

		for (let i = 0; i < n; i++) {
			const a = verts[i];
			const b = verts[(i + 1) % n];
			if (!a || !b) continue;

			positions.push(cx, OVERLAY_Y, cz);
			colors.push(color.r, color.g, color.b);
			positions.push(a.x, OVERLAY_Y, a.y);
			colors.push(color.r, color.g, color.b);
			positions.push(b.x, OVERLAY_Y, b.y);
			colors.push(color.r, color.g, color.b);
		}
	}

	// ── Energy Use (tint actual building meshes) ─────────────

	private applyEnergyColors(): void {
		// Restore any previous tinting first
		this.restoreEnergyColors();

		const energyMap = this.simulationBridge.getCellEnergyMap();
		if (energyMap.size === 0) return;

		// Normalise against the highest consumption
		let maxKWh = 1;
		for (const kwh of energyMap.values()) {
			if (kwh > maxKWh) maxKWh = kwh;
		}

		// Tint entity meshes (non-housing buildings)
		const meshMap = this.simulationBridge.getCellEntityMeshMap();
		for (const [cellIndex, obj] of meshMap) {
			const kwh = energyMap.get(cellIndex);
			if (kwh === undefined) continue;
			const norm = Math.min(kwh / maxKWh, 1);
			const tint = energyToColor(norm);
			this.tintObject(obj, tint);
		}

		// Tint housing meshes (named "housing_{cellIndex}:{layer}")
		for (const [cellIndex, kwh] of energyMap) {
			const prefix = `housing_${cellIndex}:`;
			const norm = Math.min(kwh / maxKWh, 1);
			const tint = energyToColor(norm);

			for (const child of this.housingGroup.children) {
				if (child.name.startsWith(prefix)) {
					this.tintObject(child, tint);
				}
			}
		}

		this.energyActive = true;
	}

	private restoreEnergyColors(): void {
		if (!this.energyActive) return;

		for (const saved of this.savedMaterials) {
			saved.material.color.copy(saved.color);
			saved.material.emissive.copy(saved.emissive);
			saved.material.emissiveIntensity = saved.emissiveIntensity;
			saved.material.needsUpdate = true;
		}
		this.savedMaterials = [];
		this.energyActive = false;
	}

	/** Traverse an Object3D, save original material colours, and apply tint. */
	private tintObject(obj: THREE.Object3D, tint: THREE.Color): void {
		obj.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;

			const mats = Array.isArray(child.material) ? child.material : [child.material];
			for (const mat of mats) {
				if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

				// Save original state (only once per material instance)
				if (!this.savedMaterials.some(s => s.material === mat)) {
					this.savedMaterials.push({
						material: mat,
						color: mat.color.clone(),
						emissive: mat.emissive.clone(),
						emissiveIntensity: mat.emissiveIntensity,
					});
				}

				mat.color.copy(tint);
				mat.emissive.set(0x000000);
				mat.emissiveIntensity = 0;
				mat.needsUpdate = true;
			}
		});
	}
}
