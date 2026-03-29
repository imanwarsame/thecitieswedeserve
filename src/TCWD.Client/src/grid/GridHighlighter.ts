import * as THREE from 'three';
import type { VoronoiCell } from './types';

const COLOR_DEFAULT = 0xffffff;
const COLOR_BUILD = 0xd0d0d0;   // light gray — "can build here"
const COLOR_OCCUPIED = 0xb0b0b0; // mid gray — "already has housing"

const OPACITY_FILL = 0.15;
const OPACITY_OUTLINE = 0.5;

// Max vertices a cell polygon can have (Voronoi cells rarely exceed 10)
const MAX_CELL_VERTS = 16;
// Fill fan: 3 verts per triangle × MAX_CELL_VERTS triangles
const MAX_FILL_FLOATS = MAX_CELL_VERTS * 3 * 3;
// Outline: one vertex per edge
const MAX_OUTLINE_FLOATS = MAX_CELL_VERTS * 3;

export class GridHighlighter {
	private highlightMesh: THREE.Mesh;
	private outlineMesh: THREE.LineLoop;
	private currentCell: number = -1;
	private fillMaterial: THREE.MeshBasicMaterial;
	private outlineMaterial: THREE.LineBasicMaterial;

	// Pre-allocated buffers — reused every hover, no allocation
	private fillArray = new Float32Array(MAX_FILL_FLOATS);
	private outlineArray = new Float32Array(MAX_OUTLINE_FLOATS);
	private fillAttr: THREE.BufferAttribute;
	private outlineAttr: THREE.BufferAttribute;

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

		// Create geometry with pre-allocated attributes
		this.fillAttr = new THREE.BufferAttribute(this.fillArray, 3);
		this.fillAttr.setUsage(THREE.DynamicDrawUsage);
		const fillGeo = new THREE.BufferGeometry();
		fillGeo.setAttribute('position', this.fillAttr);

		this.highlightMesh = new THREE.Mesh(fillGeo, this.fillMaterial);
		this.highlightMesh.name = 'cellHighlight';
		this.highlightMesh.renderOrder = 1;
		this.highlightMesh.visible = false;
		this.highlightMesh.frustumCulled = false;

		this.outlineAttr = new THREE.BufferAttribute(this.outlineArray, 3);
		this.outlineAttr.setUsage(THREE.DynamicDrawUsage);
		const outlineGeo = new THREE.BufferGeometry();
		outlineGeo.setAttribute('position', this.outlineAttr);

		this.outlineMesh = new THREE.LineLoop(outlineGeo, this.outlineMaterial);
		this.outlineMesh.name = 'cellOutline';
		this.outlineMesh.renderOrder = 2;
		this.outlineMesh.visible = false;
		this.outlineMesh.frustumCulled = false;
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
		const n = Math.min(verts.length, MAX_CELL_VERTS);

		// Fill geometry (fan from center) — write into pre-allocated buffer
		let fi = 0;
		for (let i = 0; i < n; i++) {
			const a = verts[i];
			const b = verts[(i + 1) % n];
			this.fillArray[fi++] = cx;  this.fillArray[fi++] = y; this.fillArray[fi++] = cz;
			this.fillArray[fi++] = a.x; this.fillArray[fi++] = y; this.fillArray[fi++] = a.y;
			this.fillArray[fi++] = b.x; this.fillArray[fi++] = y; this.fillArray[fi++] = b.y;
		}
		this.fillAttr.needsUpdate = true;
		this.highlightMesh.geometry.setDrawRange(0, n * 3);
		this.highlightMesh.visible = true;

		// Outline geometry — write into pre-allocated buffer
		let oi = 0;
		for (let i = 0; i < n; i++) {
			this.outlineArray[oi++] = verts[i].x;
			this.outlineArray[oi++] = yOutline;
			this.outlineArray[oi++] = verts[i].y;
		}
		this.outlineAttr.needsUpdate = true;
		this.outlineMesh.geometry.setDrawRange(0, n);
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
