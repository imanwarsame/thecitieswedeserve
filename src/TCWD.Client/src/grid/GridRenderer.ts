import * as THREE from 'three';
import type { OrganicGrid, VoronoiCell, GridPoint } from './types';
import { Palette } from '../rendering/Palette';

export class GridRenderer {
	private edgeMesh: THREE.LineSegments | null = null;
	private cellFillMesh: THREE.Mesh | null = null;
	private delaunayDebugMesh: THREE.LineSegments | null = null;
	private centerPointsMesh: THREE.Points | null = null;

	buildEdgeLines(grid: OrganicGrid): THREE.LineSegments {
		const edges = this.collectUniqueEdges(grid.cells);
		const positions = new Float32Array(edges.length * 6);

		let idx = 0;
		for (const [a, b] of edges) {
			positions[idx++] = a.x;
			positions[idx++] = 0.02;
			positions[idx++] = a.y;
			positions[idx++] = b.x;
			positions[idx++] = 0.02;
			positions[idx++] = b.y;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		const material = new THREE.LineBasicMaterial({
			color: 0xc5bfb5,
			transparent: true,
			opacity: 0.35,
			depthWrite: false,
		});

		this.edgeMesh = new THREE.LineSegments(geometry, material);
		this.edgeMesh.name = 'organicGridEdges';
		return this.edgeMesh;
	}

	buildCellFills(grid: OrganicGrid): THREE.Mesh {
		const positions: number[] = [];
		const colors: number[] = [];

		const colorA = new THREE.Color(Palette.ground);
		const colorB = new THREE.Color(Palette.ground).multiplyScalar(0.97);

		for (const cell of grid.cells) {
			const color = cell.index % 2 === 0 ? colorA : colorB;
			const cx = cell.center.x;
			const cz = cell.center.y;
			const verts = cell.vertices;

			for (let i = 0; i < verts.length; i++) {
				const a = verts[i];
				const b = verts[(i + 1) % verts.length];

				positions.push(cx, 0.005, cz);
				positions.push(a.x, 0.005, a.y);
				positions.push(b.x, 0.005, b.y);

				colors.push(color.r, color.g, color.b);
				colors.push(color.r, color.g, color.b);
				colors.push(color.r, color.g, color.b);
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geometry.computeVertexNormals();

		const material = new THREE.MeshLambertMaterial({
			vertexColors: true,
			transparent: false,
		});

		this.cellFillMesh = new THREE.Mesh(geometry, material);
		this.cellFillMesh.receiveShadow = true;
		this.cellFillMesh.name = 'organicGridCells';
		return this.cellFillMesh;
	}

	buildDelaunayDebug(grid: OrganicGrid): THREE.LineSegments {
		const positions: number[] = [];

		for (const tri of grid.triangles) {
			const a = grid.points[tri.a];
			const b = grid.points[tri.b];
			const c = grid.points[tri.c];

			positions.push(a.x, 0.03, a.y, b.x, 0.03, b.y);
			positions.push(b.x, 0.03, b.y, c.x, 0.03, c.y);
			positions.push(c.x, 0.03, c.y, a.x, 0.03, a.y);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

		const material = new THREE.LineBasicMaterial({
			color: 0xFF4444,
			transparent: true,
			opacity: 0.25,
			depthWrite: false,
		});

		this.delaunayDebugMesh = new THREE.LineSegments(geometry, material);
		this.delaunayDebugMesh.name = 'delaunayDebug';
		this.delaunayDebugMesh.visible = false;
		return this.delaunayDebugMesh;
	}

	buildCenterPoints(grid: OrganicGrid): THREE.Points {
		const positions = new Float32Array(grid.points.length * 3);

		for (let i = 0; i < grid.points.length; i++) {
			positions[i * 3] = grid.points[i].x;
			positions[i * 3 + 1] = 0.04;
			positions[i * 3 + 2] = grid.points[i].y;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		const material = new THREE.PointsMaterial({
			color: Palette.shadow,
			size: 0.15,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.3,
		});

		this.centerPointsMesh = new THREE.Points(geometry, material);
		this.centerPointsMesh.name = 'cellCenters';
		this.centerPointsMesh.visible = false;
		return this.centerPointsMesh;
	}

	setOpacity(opacity: number): void {
		if (this.edgeMesh) {
			(this.edgeMesh.material as THREE.LineBasicMaterial).opacity = opacity;
		}
	}

	setVisible(visible: boolean): void {
		if (this.edgeMesh) {
			this.edgeMesh.visible = visible;
		}
	}

	dispose(): void {
		if (this.edgeMesh) {
			this.edgeMesh.geometry.dispose();
			(this.edgeMesh.material as THREE.Material).dispose();
		}
		if (this.cellFillMesh) {
			this.cellFillMesh.geometry.dispose();
			(this.cellFillMesh.material as THREE.Material).dispose();
		}
		if (this.delaunayDebugMesh) {
			this.delaunayDebugMesh.geometry.dispose();
			(this.delaunayDebugMesh.material as THREE.Material).dispose();
		}
		if (this.centerPointsMesh) {
			this.centerPointsMesh.geometry.dispose();
			(this.centerPointsMesh.material as THREE.Material).dispose();
		}
	}

	private collectUniqueEdges(cells: VoronoiCell[]): [GridPoint, GridPoint][] {
		const seen = new Set<string>();
		const edges: [GridPoint, GridPoint][] = [];

		for (const cell of cells) {
			const verts = cell.vertices;
			for (let i = 0; i < verts.length; i++) {
				const a = verts[i];
				const b = verts[(i + 1) % verts.length];

				const keyA = `${a.x.toFixed(4)},${a.y.toFixed(4)}`;
				const keyB = `${b.x.toFixed(4)},${b.y.toFixed(4)}`;
				const key = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;

				if (!seen.has(key)) {
					seen.add(key);
					edges.push([a, b]);
				}
			}
		}

		return edges;
	}
}
