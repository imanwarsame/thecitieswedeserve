import * as THREE from 'three';
import type { VoronoiCell } from './types';

const COLOR_DEFAULT = 0xffffff;
const COLOR_BUILD = 0xd0d0d0;   // light gray — "can build here"
const COLOR_OCCUPIED = 0xb0b0b0; // mid gray — "already has housing"

const OPACITY_FILL = 0.15;
const OPACITY_OUTLINE = 0.5;

export class GridHighlighter {
	private highlightMesh: THREE.Mesh;
	private outlineMesh: THREE.LineLoop;
	private currentCell: number = -1;
	private fillMaterial: THREE.MeshBasicMaterial;
	private outlineMaterial: THREE.LineBasicMaterial;

	constructor() {
		this.fillMaterial = new THREE.MeshBasicMaterial({
			color: COLOR_DEFAULT,
			transparent: true,
			opacity: OPACITY_FILL,
			depthWrite: false,
			side: THREE.DoubleSide,
		});

		this.outlineMaterial = new THREE.LineBasicMaterial({
			color: COLOR_DEFAULT,
			transparent: true,
			opacity: OPACITY_OUTLINE,
			depthWrite: false,
		});

		this.highlightMesh = new THREE.Mesh(
			new THREE.BufferGeometry(),
			this.fillMaterial,
		);
		this.highlightMesh.name = 'cellHighlight';
		this.highlightMesh.renderOrder = 1;
		this.highlightMesh.visible = false;

		this.outlineMesh = new THREE.LineLoop(
			new THREE.BufferGeometry(),
			this.outlineMaterial,
		);
		this.outlineMesh.name = 'cellOutline';
		this.outlineMesh.renderOrder = 2;
		this.outlineMesh.visible = false;
	}

	private currentHeight = 0;

	/**
	 * Show highlight for a cell at a given Y height.
	 * @param cell - The cell to highlight, or null to clear.
	 * @param height - Y offset (0 = ground, or top of existing building).
	 */
	setCell(cell: VoronoiCell | null, height = 0): void {
		if (!cell) {
			this.highlightMesh.visible = false;
			this.outlineMesh.visible = false;
			this.currentCell = -1;
			this.currentHeight = 0;
			return;
		}

		if (cell.index === this.currentCell && height === this.currentHeight) return;
		this.currentCell = cell.index;
		this.currentHeight = height;

		const y = height + 0.015;
		const yOutline = height + 0.025;

		const cx = cell.center.x;
		const cz = cell.center.y;
		const verts = cell.vertices;

		// Fill geometry (fan from center)
		const fillPositions: number[] = [];
		for (let i = 0; i < verts.length; i++) {
			const a = verts[i];
			const b = verts[(i + 1) % verts.length];
			fillPositions.push(cx, y, cz);
			fillPositions.push(a.x, y, a.y);
			fillPositions.push(b.x, y, b.y);
		}

		this.highlightMesh.geometry.dispose();
		this.highlightMesh.geometry = new THREE.BufferGeometry();
		this.highlightMesh.geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(fillPositions, 3)
		);
		this.highlightMesh.visible = true;

		// Outline geometry
		const outlinePositions: number[] = [];
		for (const v of verts) {
			outlinePositions.push(v.x, yOutline, v.y);
		}

		this.outlineMesh.geometry.dispose();
		this.outlineMesh.geometry = new THREE.BufferGeometry();
		this.outlineMesh.geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(outlinePositions, 3)
		);
		this.outlineMesh.visible = true;
	}

	/** Set the highlight style based on context. */
	setMode(mode: 'default' | 'build' | 'occupied'): void {
		switch (mode) {
			case 'build':
				this.fillMaterial.color.setHex(COLOR_BUILD);
				this.outlineMaterial.color.setHex(COLOR_BUILD);
				this.fillMaterial.opacity = 0.2;
				break;
			case 'occupied':
				this.fillMaterial.color.setHex(COLOR_OCCUPIED);
				this.outlineMaterial.color.setHex(COLOR_OCCUPIED);
				this.fillMaterial.opacity = 0.18;
				break;
			default:
				this.fillMaterial.color.setHex(COLOR_DEFAULT);
				this.outlineMaterial.color.setHex(COLOR_DEFAULT);
				this.fillMaterial.opacity = OPACITY_FILL;
				break;
		}
	}

	getObjects(): THREE.Object3D[] {
		return [this.highlightMesh, this.outlineMesh];
	}

	getCurrentCell(): number {
		return this.currentCell;
	}

	dispose(): void {
		this.highlightMesh.geometry.dispose();
		this.fillMaterial.dispose();
		this.outlineMesh.geometry.dispose();
		this.outlineMaterial.dispose();
	}
}
