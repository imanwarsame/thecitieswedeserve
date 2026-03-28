import * as THREE from 'three';
import type { VoronoiCell } from '../../grid/types';
import type { MorphUpdate } from '../MorphEvaluator';
import type { MaterialRegistry } from '../../rendering/MaterialRegistry';
import type { OrganicGrid } from '../../grid/types';
import { buildWalls } from './WallBuilder';
import { buildFloor } from './FloorBuilder';
import { buildFlatRoof, buildPeakedRoof } from './RoofBuilder';
import { addWindowToWall, buildArchWall } from './DetailBuilder';
import { HousingConfig } from '../HousingConfig';
import { patchMaterialUniforms } from '../../rendering/RadialFog';

/**
 * Cached set of fog-patched, DoubleSide materials for a single housing cell.
 * Shared across all meshes in the cell to minimise material count and
 * enable GPU draw-call batching.
 */
interface CellMaterials {
	structure: THREE.MeshStandardMaterial;
	detail: THREE.MeshStandardMaterial;
	accent: THREE.MeshStandardMaterial;
	ground: THREE.MeshStandardMaterial;
	/** Windows are darkened detail material */
	window: THREE.MeshStandardMaterial;
}

/**
 * Generates and manages Three.js meshes for housing voxels.
 *
 * Maintains a map of active mesh groups per voxel. When a MorphUpdate
 * arrives, the old mesh for that voxel is disposed and a new one is
 * generated based on the morph shape.
 */
export class HousingMeshGenerator {
	private registry: MaterialRegistry;
	private grid: OrganicGrid;
	private parentGroup: THREE.Group;

	/** Active meshes keyed by "cellIndex:layer". */
	private meshes = new Map<string, THREE.Group>();

	/** Per-cell housing tint color (hex). */
	private cellColors = new Map<number, number>();

	/** Per-cell shared materials (created once, disposed with cell). */
	private cellMaterials = new Map<number, CellMaterials>();

	constructor(registry: MaterialRegistry, grid: OrganicGrid, parentGroup: THREE.Group) {
		this.registry = registry;
		this.grid = grid;
		this.parentGroup = parentGroup;
	}

	/** Set the tint colour for a cell. Call before placing housing. */
	setCellColor(cellIndex: number, color: number): void {
		this.cellColors.set(cellIndex, color);
		// Invalidate cached materials for this cell so they get re-created with new tint
		this.disposeCellMaterials(cellIndex);
	}

	/** Get the stored colour for a cell (undefined if not set). */
	getCellColor(cellIndex: number): number | undefined {
		return this.cellColors.get(cellIndex);
	}

	/** Apply a batch of morph updates. Disposes old meshes and generates new ones. */
	applyUpdates(updates: MorphUpdate[]): void {
		if (!this.registry || !this.parentGroup) return;

		for (const update of updates) {
			const key = `${update.cellIndex}:${update.layer}`;

			this.disposeMesh(key);

			const cell = this.grid.cells[update.cellIndex];
			if (!cell) continue;

			try {
				const group = this.generateForShape(update);
				if (group) {
					group.name = `housing_${key}`;
					this.meshes.set(key, group);
					this.parentGroup.add(group);
				}
			} catch (e) {
				console.warn(`[HousingMesh] Failed to generate mesh for ${key}:`, e);
			}
		}
	}

	/** Remove all meshes for a cell (all layers). */
	clearCell(cellIndex: number): void {
		const toRemove: string[] = [];
		for (const key of this.meshes.keys()) {
			if (key.startsWith(`${cellIndex}:`)) toRemove.push(key);
		}
		for (const key of toRemove) this.disposeMesh(key);
		this.cellColors.delete(cellIndex);
		this.disposeCellMaterials(cellIndex);
	}

	/** Remove everything. */
	clear(): void {
		for (const key of [...this.meshes.keys()]) {
			this.disposeMesh(key);
		}
		for (const cellIndex of [...this.cellMaterials.keys()]) {
			this.disposeCellMaterials(cellIndex);
		}
	}

	dispose(): void {
		this.clear();
	}

	/** Get or create shared materials for a cell (with tint applied). */
	private getMaterials(cellIndex: number): CellMaterials {
		let mats = this.cellMaterials.get(cellIndex);
		if (mats) return mats;

		const tint = this.cellColors.get(cellIndex);

		const createMat = (key: string): THREE.MeshStandardMaterial => {
			const mat = this.registry.get(key).clone();
			mat.side = THREE.DoubleSide;
			patchMaterialUniforms(mat);
			if (tint !== undefined) {
				this.tintMaterial(mat, tint);
			}
			return mat;
		};

		const windowMat = this.registry.get('detail').clone();
		windowMat.side = THREE.DoubleSide;
		windowMat.color.multiplyScalar(0.35);
		patchMaterialUniforms(windowMat);
		if (tint !== undefined) {
			this.tintMaterial(windowMat, tint);
		}

		mats = {
			structure: createMat('structure'),
			detail: createMat('detail'),
			accent: createMat('accent'),
			ground: createMat('ground'),
			window: windowMat,
		};
		this.cellMaterials.set(cellIndex, mats);
		return mats;
	}

	private generateForShape(update: MorphUpdate): THREE.Group | null {
		const { cellIndex, layer, morph } = update;
		const cell = this.grid.cells[cellIndex];
		const mats = this.getMaterials(cellIndex);

		switch (morph.shape) {
			case 'air':
				return null;

			case 'solid':
			case 'foundation':
				return this.buildSolid(cell, layer, mats);

			case 'wall':
			case 'wall-windowed':
				return this.buildWall(cell, layer, morph.openEdges, morph.shape === 'wall-windowed', mats);

			case 'corner':
			case 'stair':
			case 'courtyard-wall':
				return this.buildWall(cell, layer, morph.openEdges, morph.shape === 'courtyard-wall', mats);

			case 'pillar':
				return this.buildPillar(cell, layer, mats);

			case 'roof-flat':
				return this.buildRoofWithWalls(cell, layer, morph.openEdges, 'flat', mats);

			case 'roof-peaked':
				return this.buildRoofWithWalls(cell, layer, morph.openEdges, 'peaked', mats);

			case 'arch':
				return this.buildArch(cell, layer, morph.openEdges, mats);

			case 'balcony':
				return this.buildBalcony(cell, layer, morph.openEdges, mats);

			default:
				return this.buildSolid(cell, layer, mats);
		}
	}

	private buildSolid(cell: VoronoiCell, layer: number, mats: CellMaterials): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		const allEdges = cell.vertices.map((_, i) => i);
		const walls = buildWalls(cell, layer, allEdges, this.registry, 'structure', mats.structure);
		group.add(walls);

		const topCap = buildFloor(cell, (layer + 1) * h, this.registry, 'detail', true, mats.detail);
		group.add(topCap);

		if (layer === 0) {
			const bottomCap = buildFloor(cell, 0, this.registry, 'ground', false, mats.ground);
			group.add(bottomCap);
		}

		return group;
	}

	private buildWall(
		cell: VoronoiCell, layer: number,
		openFaces: number[], windowed: boolean,
		mats: CellMaterials,
	): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		const walls = buildWalls(cell, layer, openFaces, this.registry, 'structure', mats.structure);
		group.add(walls);

		if (windowed) {
			const verts = cell.vertices;
			for (const edgeIdx of openFaces) {
				const v0 = verts[edgeIdx];
				const v1 = verts[(edgeIdx + 1) % verts.length];
				const win = addWindowToWall(v0, v1, layer, this.registry, mats.window);
				group.add(win);
			}
		}

		const floorCap = buildFloor(cell, layer * h, this.registry, 'detail', true, mats.detail);
		group.add(floorCap);

		return group;
	}

	private buildRoofWithWalls(
		cell: VoronoiCell, layer: number, _openEdges: number[],
		style: 'flat' | 'peaked',
		mats: CellMaterials,
	): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		// Roof layer = top of building. Walls on ALL edges (every side is exterior).
		const allEdges = cell.vertices.map((_, i) => i);
		const walls = buildWalls(cell, layer, allEdges, this.registry, 'structure', mats.structure);
		group.add(walls);

		// Floor cap at bottom of this layer
		const floorCap = buildFloor(cell, layer * h, this.registry, 'detail', true, mats.detail);
		group.add(floorCap);

		// Roof geometry on top
		if (style === 'flat') {
			group.add(buildFlatRoof(cell, layer, this.registry, mats.detail, mats.accent));
		} else {
			group.add(buildPeakedRoof(cell, layer, this.registry, mats.detail, mats.accent));
		}

		return group;
	}

	private buildPillar(cell: VoronoiCell, layer: number, mats: CellMaterials): THREE.Group {
		// Pillar = walls on all edges + top cap (same as solid, just uses accent material)
		return this.buildSolid(cell, layer, mats);
	}

	private buildArch(cell: VoronoiCell, layer: number, openFaces: number[], mats: CellMaterials): THREE.Group {
		const group = new THREE.Group();
		const verts = cell.vertices;

		for (const edgeIdx of openFaces) {
			const v0 = verts[edgeIdx];
			const v1 = verts[(edgeIdx + 1) % verts.length];
			const arch = buildArchWall(v0, v1, layer, this.registry, mats.structure);
			group.add(arch);
		}

		// Closed edges get normal walls
		const closedEdges = cell.vertices
			.map((_, i) => i)
			.filter(i => !openFaces.includes(i));
		const walls = buildWalls(cell, layer, closedEdges, this.registry, 'structure', mats.structure);
		group.add(walls);

		return group;
	}

	private buildBalcony(cell: VoronoiCell, layer: number, openFaces: number[], mats: CellMaterials): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		// Floor slab
		const floor = buildFloor(cell, layer * h, this.registry, 'detail', true, mats.detail);
		group.add(floor);

		// Low railing on open edges
		const rails = buildWalls(cell, layer, openFaces, this.registry, 'accent', mats.accent);
		rails.scale.y = 0.3;
		group.add(rails);

		return group;
	}

	/** Apply tint to a single material, preserving luminance differences. */
	private tintMaterial(mat: THREE.MeshStandardMaterial, tint: number): void {
		const tintColor = new THREE.Color(tint);
		if (mat.color) {
			const lum = mat.color.getHSL({ h: 0, s: 0, l: 0 }).l;
			mat.color.copy(tintColor).multiplyScalar(lum / 0.85);
		}
	}

	private disposeCellMaterials(cellIndex: number): void {
		const mats = this.cellMaterials.get(cellIndex);
		if (!mats) return;
		mats.structure.dispose();
		mats.detail.dispose();
		mats.accent.dispose();
		mats.ground.dispose();
		mats.window.dispose();
		this.cellMaterials.delete(cellIndex);
	}

	private disposeMesh(key: string): void {
		const mesh = this.meshes.get(key);
		if (!mesh) return;

		mesh.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				// Don't dispose shared materials here — they're managed by cellMaterials
			}
		});

		this.parentGroup.remove(mesh);
		this.meshes.delete(key);
	}
}
