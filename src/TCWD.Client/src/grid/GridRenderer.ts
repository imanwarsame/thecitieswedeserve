import * as THREE from 'three';
import type { OrganicGrid, VoronoiCell, GridPoint } from './types';
import { Palette } from '../rendering/Palette';
import { terrainHeight, CLIFF_DEPTH } from './TerrainHeight';
import { GridConfig } from './GridConfig';
import { insideHex } from './TownMesh';
import { patchMaterialUniforms } from '../rendering/RadialFog';

/* ── helpers ─────────────────────────────────────────────────────── */

function yAt(x: number, z: number): number {
	return terrainHeight(x, z);
}

/** Hex radius at a given angle (flat-topped). */
function hexRadiusAt(angle: number, R: number): number {
	const sector = ((angle % (Math.PI / 3)) + Math.PI * 2) % (Math.PI / 3) - Math.PI / 6;
	return R * Math.cos(Math.PI / 6) / Math.cos(sector);
}

/** Clamp a point to the hex boundary if it's outside. */
function clampToHex(px: number, pz: number, R: number): [number, number] {
	if (insideHex(px, pz, R)) return [px, pz];
	const angle = Math.atan2(pz, px);
	const maxR = hexRadiusAt(angle, R);
	const dist = Math.hypot(px, pz);
	const s = maxR / dist;
	return [px * s, pz * s];
}

export class GridRenderer {
	private edgeMesh: THREE.LineSegments | null = null;
	private cellFillMesh: THREE.Mesh | null = null;
	private hexCapMesh: THREE.Mesh | null = null;
	private cliffMesh: THREE.Mesh | null = null;
	private delaunayDebugMesh: THREE.LineSegments | null = null;
	private centerPointsMesh: THREE.Points | null = null;

	/* ── grid edge lines ──────────────────────────────────────────── */

	buildEdgeLines(grid: OrganicGrid): THREE.LineSegments {
		const R = GridConfig.townHexRadius;
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

		const material = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Color(0xcccccc) },
				uOpacity: { value: 0.4 },
				uFadeStart: { value: R * 0.55 },
				uFadeEnd: { value: R * 0.95 },
			},
			vertexShader: /* glsl */ `
				varying float vDist;
				void main() {
					vec4 worldPos = modelMatrix * vec4(position, 1.0);
					vDist = length(worldPos.xz);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: /* glsl */ `
				uniform vec3 uColor;
				uniform float uOpacity;
				uniform float uFadeStart;
				uniform float uFadeEnd;
				varying float vDist;
				void main() {
					float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, vDist);
					gl_FragColor = vec4(uColor, uOpacity * fade);
				}
			`,
			transparent: true,
			depthWrite: false,
		});

		this.edgeMesh = new THREE.LineSegments(geometry, material);
		this.edgeMesh.name = 'organicGridEdges';
		return this.edgeMesh;
	}

	/* ── cell fills (terrain surface) ─────────────────────────────── */

	buildCellFills(grid: OrganicGrid): THREE.Mesh {
		const R = GridConfig.townHexRadius;
		const positions: number[] = [];
		const colors: number[] = [];

		const colorA = new THREE.Color(Palette.ground);
		const colorB = new THREE.Color(Palette.ground).multiplyScalar(0.97);

		for (const cell of grid.cells) {
			const color = cell.index % 2 === 0 ? colorA : colorB;
			const [cx, cz] = clampToHex(cell.center.x, cell.center.y, R);
			const cy = yAt(cx, cz);
			const verts = cell.vertices;

			for (let i = 0; i < verts.length; i++) {
				const [ax, az] = clampToHex(verts[i].x, verts[i].y, R);
				const [bx, bz] = clampToHex(verts[(i + 1) % verts.length].x,
					verts[(i + 1) % verts.length].y, R);

				positions.push(cx, cy, cz);
				positions.push(bx, yAt(bx, bz), bz);
				positions.push(ax, yAt(ax, az), az);

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
		});
		patchMaterialUniforms(material);

		this.cellFillMesh = new THREE.Mesh(geometry, material);
		this.cellFillMesh.receiveShadow = true;
		this.cellFillMesh.name = 'organicGridCells';
		return this.cellFillMesh;
	}

	/* ── hex ground cap (fills any gaps under cells) ──────────────── */

	buildHexCap(): THREE.Mesh {
		const R = GridConfig.townHexRadius;
		const SEGMENTS = 180;

		const positions: number[] = [];
		const color = new THREE.Color(Palette.ground);

		for (let i = 0; i < SEGMENTS; i++) {
			const a0 = (i / SEGMENTS) * Math.PI * 2;
			const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;

			const r0 = hexRadiusAt(a0, R);
			const r1 = hexRadiusAt(a1, R);

			const x0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0;
			const x1 = Math.cos(a1) * r1, z1 = Math.sin(a1) * r1;

			// Fan triangle: center → p1 → p0  (normals up)
			positions.push(0, yAt(0, 0) - 0.05, 0);
			positions.push(x1, yAt(x1, z1) - 0.05, z1);
			positions.push(x0, yAt(x0, z0) - 0.05, z0);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.computeVertexNormals();

		const material = new THREE.MeshLambertMaterial({ color });
		patchMaterialUniforms(material);

		this.hexCapMesh = new THREE.Mesh(geometry, material);
		this.hexCapMesh.receiveShadow = true;
		this.hexCapMesh.name = 'hexGroundCap';
		return this.hexCapMesh;
	}

	/* ── cliff sides (smooth hex ring extruded down) ──────────────── */

	buildCliffSides(): THREE.Mesh {
		const R = GridConfig.townHexRadius;
		const SEGMENTS = 180;
		const bottomY = -CLIFF_DEPTH;

		const positions: number[] = [];
		const normals: number[] = [];

		// Smooth hex ring
		const ring: { x: number; z: number; nx: number; nz: number }[] = [];
		for (let i = 0; i < SEGMENTS; i++) {
			const angle = (i / SEGMENTS) * Math.PI * 2;
			const hR = hexRadiusAt(angle, R);
			const x = Math.cos(angle) * hR;
			const z = Math.sin(angle) * hR;
			ring.push({ x, z, nx: Math.cos(angle), nz: Math.sin(angle) });
		}

		// Wall quads
		for (let i = 0; i < SEGMENTS; i++) {
			const c = ring[i];
			const n = ring[(i + 1) % SEGMENTS];
			const cY = yAt(c.x, c.z);
			const nY = yAt(n.x, n.z);

			positions.push(c.x, cY, c.z, n.x, nY, n.z, c.x, bottomY, c.z);
			normals.push(c.nx, 0, c.nz, n.nx, 0, n.nz, c.nx, 0, c.nz);

			positions.push(n.x, nY, n.z, n.x, bottomY, n.z, c.x, bottomY, c.z);
			normals.push(n.nx, 0, n.nz, n.nx, 0, n.nz, c.nx, 0, c.nz);
		}

		// Bottom cap
		for (let i = 0; i < SEGMENTS; i++) {
			const c = ring[i];
			const n = ring[(i + 1) % SEGMENTS];
			positions.push(0, bottomY, 0, n.x, bottomY, n.z, c.x, bottomY, c.z);
			normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

		const material = new THREE.MeshLambertMaterial({
			color: new THREE.Color(Palette.detail),
		});
		patchMaterialUniforms(material);

		this.cliffMesh = new THREE.Mesh(geometry, material);
		this.cliffMesh.castShadow = true;
		this.cliffMesh.receiveShadow = true;
		this.cliffMesh.name = 'terrainCliffs';
		return this.cliffMesh;
	}

	/* ── debug overlays ───────────────────────────────────────────── */

	buildDelaunayDebug(grid: OrganicGrid): THREE.LineSegments {
		const positions: number[] = [];
		for (const tri of grid.triangles) {
			const a = grid.points[tri.a], b = grid.points[tri.b], c = grid.points[tri.c];
			positions.push(a.x, yAt(a.x, a.y) + 0.1, a.y, b.x, yAt(b.x, b.y) + 0.1, b.y);
			positions.push(b.x, yAt(b.x, b.y) + 0.1, b.y, c.x, yAt(c.x, c.y) + 0.1, c.y);
			positions.push(c.x, yAt(c.x, c.y) + 0.1, c.y, a.x, yAt(a.x, a.y) + 0.1, a.y);
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		const material = new THREE.LineBasicMaterial({
			color: 0xFF4444, transparent: true, opacity: 0.25, depthWrite: false,
		});
		this.delaunayDebugMesh = new THREE.LineSegments(geometry, material);
		this.delaunayDebugMesh.name = 'delaunayDebug';
		this.delaunayDebugMesh.visible = false;
		return this.delaunayDebugMesh;
	}

	buildCenterPoints(grid: OrganicGrid): THREE.Points {
		const positions = new Float32Array(grid.points.length * 3);
		for (let i = 0; i < grid.points.length; i++) {
			const p = grid.points[i];
			positions[i * 3] = p.x;
			positions[i * 3 + 1] = yAt(p.x, p.y) + 0.1;
			positions[i * 3 + 2] = p.y;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const material = new THREE.PointsMaterial({
			color: Palette.shadow, size: 3.0, sizeAttenuation: true,
			transparent: true, opacity: 0.3,
		});
		this.centerPointsMesh = new THREE.Points(geometry, material);
		this.centerPointsMesh.name = 'cellCenters';
		this.centerPointsMesh.visible = false;
		return this.centerPointsMesh;
	}

	/* ── utilities ─────────────────────────────────────────────────── */

	setOpacity(o: number): void {
		if (this.edgeMesh) {
			const mat = this.edgeMesh.material as THREE.ShaderMaterial;
			if (mat.uniforms?.uOpacity) mat.uniforms.uOpacity.value = o;
		}
	}
	setVisible(v: boolean): void {
		if (this.edgeMesh) this.edgeMesh.visible = v;
	}

	dispose(): void {
		for (const mesh of [this.edgeMesh, this.cellFillMesh, this.hexCapMesh,
			this.cliffMesh, this.delaunayDebugMesh, this.centerPointsMesh]) {
			if (mesh) {
				mesh.geometry.dispose();
				const mat = mesh.material;
				if (Array.isArray(mat)) mat.forEach(m => m.dispose());
				else (mat as THREE.Material).dispose();
			}
		}
	}

	private collectUniqueEdges(cells: VoronoiCell[]): [GridPoint, GridPoint][] {
		const seen = new Set<string>();
		const edges: [GridPoint, GridPoint][] = [];
		for (const cell of cells) {
			const verts = cell.vertices;
			for (let i = 0; i < verts.length; i++) {
				const a = verts[i], b = verts[(i + 1) % verts.length];
				const ka = `${a.x.toFixed(4)},${a.y.toFixed(4)}`;
				const kb = `${b.x.toFixed(4)},${b.y.toFixed(4)}`;
				const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
				if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
			}
		}
		return edges;
	}
}
