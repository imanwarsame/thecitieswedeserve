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

	constructor(registry: MaterialRegistry, grid: OrganicGrid, parentGroup: THREE.Group) {
		this.registry = registry;
		this.grid = grid;
		this.parentGroup = parentGroup;
	}

	/** Apply a batch of morph updates. Disposes old meshes and generates new ones. */
	applyUpdates(updates: MorphUpdate[]): void {
		for (const update of updates) {
			const key = `${update.cellIndex}:${update.layer}`;

			this.disposeMesh(key);

			const cell = this.grid.cells[update.cellIndex];
			if (!cell) continue;

			const group = this.generateForShape(update);
			if (group) {
				group.name = `housing_${key}`;
				this.meshes.set(key, group);
				this.parentGroup.add(group);
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
	}

	/** Remove everything. */
	clear(): void {
		for (const key of [...this.meshes.keys()]) {
			this.disposeMesh(key);
		}
	}

	dispose(): void {
		this.clear();
	}

	private generateForShape(update: MorphUpdate): THREE.Group | null {
		const { cellIndex, layer, morph } = update;
		const cell = this.grid.cells[cellIndex];

		switch (morph.shape) {
			case 'air':
				return null;

			case 'solid':
			case 'foundation':
				return this.buildSolid(cell, layer);

			case 'wall':
			case 'wall-windowed':
				return this.buildWall(cell, layer, morph.openEdges, morph.shape === 'wall-windowed');

			case 'corner':
			case 'stair':
			case 'courtyard-wall':
				return this.buildWall(cell, layer, morph.openEdges, morph.shape === 'courtyard-wall');

			case 'pillar':
				return this.buildPillar(cell, layer);

			case 'roof-flat':
				return this.buildRoofWithWalls(cell, layer, morph.openEdges, 'flat');

			case 'roof-peaked':
				return this.buildRoofWithWalls(cell, layer, morph.openEdges, 'peaked');

			case 'arch':
				return this.buildArch(cell, layer, morph.openEdges);

			case 'balcony':
				return this.buildBalcony(cell, layer, morph.openEdges);

			default:
				return this.buildSolid(cell, layer);
		}
	}

	private buildSolid(cell: VoronoiCell, layer: number): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		const allEdges = cell.vertices.map((_, i) => i);
		const walls = buildWalls(cell, layer, allEdges, this.registry);
		group.add(walls);

		const topCap = buildFloor(cell, (layer + 1) * h, this.registry, 'detail', true);
		group.add(topCap);

		if (layer === 0) {
			const bottomCap = buildFloor(cell, 0, this.registry, 'ground', false);
			group.add(bottomCap);
		}

		return group;
	}

	private buildWall(
		cell: VoronoiCell, layer: number,
		openFaces: number[], windowed: boolean,
	): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		const walls = buildWalls(cell, layer, openFaces, this.registry);
		group.add(walls);

		if (windowed) {
			const verts = cell.vertices;
			for (const edgeIdx of openFaces) {
				const v0 = verts[edgeIdx];
				const v1 = verts[(edgeIdx + 1) % verts.length];
				const win = addWindowToWall(v0, v1, layer, this.registry);
				group.add(win);
			}
		}

		const floorCap = buildFloor(cell, layer * h, this.registry, 'detail', true);
		group.add(floorCap);

		return group;
	}

	private buildRoofWithWalls(
		cell: VoronoiCell, layer: number, openEdges: number[],
		style: 'flat' | 'peaked',
	): THREE.Group {
		const group = new THREE.Group();

		// Walls on open edges for this layer (closes the gap below the roof)
		const edgesToWall = openEdges.length > 0
			? openEdges
			: cell.vertices.map((_, i) => i);
		const walls = buildWalls(cell, layer, edgesToWall, this.registry);
		group.add(walls);

		// Roof geometry on top
		if (style === 'flat') {
			const roof = buildFlatRoof(cell, layer, this.registry);
			group.add(roof);
		} else {
			const roof = buildPeakedRoof(cell, layer, this.registry);
			group.add(roof);
		}

		return group;
	}

	private buildPillar(cell: VoronoiCell, layer: number): THREE.Group {
		// Pillar = walls on all edges + top cap (same as solid, just uses accent material)
		return this.buildSolid(cell, layer);
	}

	private buildArch(cell: VoronoiCell, layer: number, openFaces: number[]): THREE.Group {
		const group = new THREE.Group();
		const verts = cell.vertices;

		for (const edgeIdx of openFaces) {
			const v0 = verts[edgeIdx];
			const v1 = verts[(edgeIdx + 1) % verts.length];
			const arch = buildArchWall(v0, v1, layer, this.registry);
			group.add(arch);
		}

		// Closed edges get normal walls
		const closedEdges = cell.vertices
			.map((_, i) => i)
			.filter(i => !openFaces.includes(i));
		const walls = buildWalls(cell, layer, closedEdges, this.registry);
		group.add(walls);

		return group;
	}

	private buildBalcony(cell: VoronoiCell, layer: number, openFaces: number[]): THREE.Group {
		const group = new THREE.Group();
		const h = HousingConfig.layerHeight;

		// Floor slab
		const floor = buildFloor(cell, layer * h, this.registry, 'detail', true);
		group.add(floor);

		// Low railing on open edges
		const rails = buildWalls(cell, layer, openFaces, this.registry, 'accent');
		rails.scale.y = 0.3;
		group.add(rails);

		return group;
	}

	private disposeMesh(key: string): void {
		const mesh = this.meshes.get(key);
		if (!mesh) return;

		mesh.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach(m => m.dispose());
				} else {
					child.material.dispose();
				}
			}
		});

		this.parentGroup.remove(mesh);
		this.meshes.delete(key);
	}
}
