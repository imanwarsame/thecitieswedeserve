import * as THREE from 'three';
import type { VoronoiCell } from './types';
import { Palette } from '../rendering/Palette';

export class GridHighlighter {
	private highlightMesh: THREE.Mesh;
	private outlineMesh: THREE.LineLoop;
	private currentCell: number = -1;

	constructor() {
		this.highlightMesh = new THREE.Mesh(
			new THREE.BufferGeometry(),
			new THREE.MeshBasicMaterial({
				color: Palette.accent,
				transparent: true,
				opacity: 0.08,
				depthWrite: false,
				side: THREE.DoubleSide,
			})
		);
		this.highlightMesh.name = 'cellHighlight';
		this.highlightMesh.renderOrder = 1;
		this.highlightMesh.visible = false;

		this.outlineMesh = new THREE.LineLoop(
			new THREE.BufferGeometry(),
			new THREE.LineBasicMaterial({
				color: Palette.selectGlow,
				transparent: true,
				opacity: 0.25,
				depthWrite: false,
			})
		);
		this.outlineMesh.name = 'cellOutline';
		this.outlineMesh.renderOrder = 2;
		this.outlineMesh.visible = false;
	}

	setCell(cell: VoronoiCell | null): void {
		if (!cell) {
			this.highlightMesh.visible = false;
			this.outlineMesh.visible = false;
			this.currentCell = -1;
			return;
		}

		if (cell.index === this.currentCell) return;
		this.currentCell = cell.index;

		// Build fill geometry (fan triangulation from center)
		const fillPositions: number[] = [];
		const cx = cell.center.x;
		const cz = cell.center.y;
		const verts = cell.vertices;

		for (let i = 0; i < verts.length; i++) {
			const a = verts[i];
			const b = verts[(i + 1) % verts.length];
			fillPositions.push(cx, 0.015, cz);
			fillPositions.push(a.x, 0.015, a.y);
			fillPositions.push(b.x, 0.015, b.y);
		}

		this.highlightMesh.geometry.dispose();
		this.highlightMesh.geometry = new THREE.BufferGeometry();
		this.highlightMesh.geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(fillPositions, 3)
		);
		this.highlightMesh.visible = true;

		// Build outline geometry
		const outlinePositions: number[] = [];
		for (const v of verts) {
			outlinePositions.push(v.x, 0.025, v.y);
		}

		this.outlineMesh.geometry.dispose();
		this.outlineMesh.geometry = new THREE.BufferGeometry();
		this.outlineMesh.geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(outlinePositions, 3)
		);
		this.outlineMesh.visible = true;
	}

	getObjects(): THREE.Object3D[] {
		return [this.highlightMesh, this.outlineMesh];
	}

	getCurrentCell(): number {
		return this.currentCell;
	}

	dispose(): void {
		this.highlightMesh.geometry.dispose();
		(this.highlightMesh.material as THREE.Material).dispose();
		this.outlineMesh.geometry.dispose();
		(this.outlineMesh.material as THREE.Material).dispose();
	}
}
