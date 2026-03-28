import type { GridPoint, OrganicGrid, Triangle } from './types';
import { Delaunay } from 'd3-delaunay';

/* ═══════════════════════════════════════════════════════════════════
   Townscaper-style mesh pipeline
   ─────────────────────────────────────────────────────────────────
   1. Equilateral-triangle lattice
   2. Random triangle-pairing → quads
   3. Conway Ortho subdivision  → all-quad mesh
   4. Laplacian relaxation      → organic smoothing
   5. Conversion to OrganicGrid → drop-in for existing systems
   ═══════════════════════════════════════════════════════════════════ */

/** Intermediate mesh: vertices + variable-polygon faces. */
export interface TownMeshData {
	vertices: GridPoint[];
	/** Each face is an array of vertex indices with CCW winding (3 = tri, 4 = quad). */
	faces: number[][];
}

/* ── helpers ──────────────────────────────────────────────────────── */

function createRNG(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function edgeKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const SQRT3 = Math.sqrt(3);

/**
 * Point-in-hex test for a flat-topped regular hexagon centred at origin.
 * Circumradius R = distance from center to vertex.
 */
export function insideHex(x: number, y: number, R: number): boolean {
	const ay = Math.abs(y);
	const inradius = R * SQRT3 / 2;
	return ay <= inradius
		&& Math.abs(x * SQRT3 + y) <= R * SQRT3
		&& Math.abs(x * SQRT3 - y) <= R * SQRT3;
}

/* ── 1. Triangle lattice ─────────────────────────────────────────── */

/**
 * Generate an equilateral-triangle lattice covering a hexagonal region.
 *
 * Uses axial coordinates on the standard triangular lattice:
 *   vertex(i, j) = (i·e + j·e/2,  j·e·√3/2)
 *
 * Up-triangle  at (i,j): vertices (i,j), (i+1,j), (i,j+1)   — CCW
 * Down-triangle at (i,j): vertices (i+1,j), (i+1,j+1), (i,j+1) — CCW
 *
 * Triangles are clipped to a flat-topped hex of circumradius `hexRadius` + padding.
 */
export function generateTriangleLattice(
	hexRadius: number,
	edgeLength: number,
	padding = -1,
): TownMeshData {
	if (padding < 0) padding = edgeLength * 2;

	const e = edgeLength;
	const h = e * SQRT3 / 2;
	// bounding box of the hex + padding
	const extentX = hexRadius + padding;
	const extentY = hexRadius * SQRT3 / 2 + padding;
	const clipR = hexRadius + padding * 0.8; // hex clip radius for lattice

	/* ── vertices on the triangular lattice ── */
	const vertices: GridPoint[] = [];
	const idx = new Map<string, number>();

	const jMin = Math.floor(-extentY / h) - 1;
	const jMax = Math.ceil(extentY / h) + 1;

	for (let j = jMin; j <= jMax; j++) {
		const iMin = Math.floor((-extentX - j * e / 2) / e) - 1;
		const iMax = Math.ceil((extentX - j * e / 2) / e) + 1;
		for (let i = iMin; i <= iMax; i++) {
			const key = `${i},${j}`;
			idx.set(key, vertices.length);
			vertices.push({ x: i * e + j * e / 2, y: j * h });
		}
	}

	/* ── form triangles, clip to padded hex ── */
	const faces: number[][] = [];

	for (let j = jMin; j < jMax; j++) {
		const iMin = Math.floor((-extentX - j * e / 2) / e) - 1;
		const iMax = Math.ceil((extentX - j * e / 2) / e) + 1;

		for (let i = iMin; i < iMax; i++) {
			const v00 = idx.get(`${i},${j}`);
			const v10 = idx.get(`${i + 1},${j}`);
			const v01 = idx.get(`${i},${j + 1}`);
			const v11 = idx.get(`${i + 1},${j + 1}`);

			// Up triangle: (i,j) → (i+1,j) → (i,j+1)
			if (v00 !== undefined && v10 !== undefined && v01 !== undefined) {
				const cx = (vertices[v00].x + vertices[v10].x + vertices[v01].x) / 3;
				const cy = (vertices[v00].y + vertices[v10].y + vertices[v01].y) / 3;
				if (insideHex(cx, cy, clipR)) {
					faces.push([v00, v10, v01]);
				}
			}

			// Down triangle: (i+1,j) → (i+1,j+1) → (i,j+1)
			if (v10 !== undefined && v11 !== undefined && v01 !== undefined) {
				const cx = (vertices[v10].x + vertices[v11].x + vertices[v01].x) / 3;
				const cy = (vertices[v10].y + vertices[v11].y + vertices[v01].y) / 3;
				if (insideHex(cx, cy, clipR)) {
					faces.push([v10, v11, v01]);
				}
			}
		}
	}

	return { vertices, faces };
}

/* ── 2. Random pairing ───────────────────────────────────────────── */

/**
 * Randomly merge adjacent triangle pairs into quads.
 * Uses Fisher-Yates shuffle + greedy matching. Unpaired triangles are kept.
 *
 * Quad winding is CCW, derived from the two source triangles' shared edge.
 */
export function randomPairing(mesh: TownMeshData, seed: number): TownMeshData {
	const rng = createRNG(seed);

	// edge → face indices sharing it
	const edgeFaces = new Map<string, number[]>();
	for (let fi = 0; fi < mesh.faces.length; fi++) {
		const face = mesh.faces[fi];
		for (let i = 0; i < face.length; i++) {
			const key = edgeKey(face[i], face[(i + 1) % face.length]);
			let list = edgeFaces.get(key);
			if (!list) {
				list = [];
				edgeFaces.set(key, list);
			}
			list.push(fi);
		}
	}

	// collect internal edges (shared by exactly 2 triangles)
	const pairs: { key: string; f1: number; f2: number }[] = [];
	for (const [key, fl] of edgeFaces) {
		if (fl.length === 2) pairs.push({ key, f1: fl[0], f2: fl[1] });
	}

	// shuffle (Fisher-Yates)
	for (let i = pairs.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[pairs[i], pairs[j]] = [pairs[j], pairs[i]];
	}

	// greedy merge
	const used = new Set<number>();
	const newFaces: number[][] = [];

	for (const { key, f1, f2 } of pairs) {
		if (used.has(f1) || used.has(f2)) continue;

		const face1 = mesh.faces[f1];
		const face2 = mesh.faces[f2];
		const [ea, eb] = key.split(':').map(Number);

		// non-shared vertices
		const v1 = face1.find(v => v !== ea && v !== eb)!;
		const v2 = face2.find(v => v !== ea && v !== eb)!;

		// determine CCW quad ordering from face1's winding
		const pos = face1.indexOf(v1);
		const next = face1[(pos + 1) % face1.length];

		newFaces.push(next === ea ? [v1, ea, v2, eb] : [v1, eb, v2, ea]);
		used.add(f1);
		used.add(f2);
	}

	// keep unpaired faces
	for (let fi = 0; fi < mesh.faces.length; fi++) {
		if (!used.has(fi)) newFaces.push([...mesh.faces[fi]]);
	}

	return { vertices: mesh.vertices, faces: newFaces };
}

/* ── 3. Conway Ortho subdivision ─────────────────────────────────── */

/**
 * Subdivide every face into quads.
 *
 * For each n-gon face:
 *   - add a centroid vertex
 *   - add (or reuse) midpoints on each edge
 *   - create n quads: [corner_i, mid_i, centroid, mid_{i-1}]
 *
 * Triangles → 3 quads, quads → 4 quads. Result is all-quad.
 */
export function conwayOrtho(mesh: TownMeshData): TownMeshData {
	const newVerts: GridPoint[] = [...mesh.vertices];
	const newFaces: number[][] = [];
	const midCache = new Map<string, number>();

	function mid(a: number, b: number): number {
		const key = edgeKey(a, b);
		let mi = midCache.get(key);
		if (mi !== undefined) return mi;
		mi = newVerts.length;
		newVerts.push({
			x: (mesh.vertices[a].x + mesh.vertices[b].x) / 2,
			y: (mesh.vertices[a].y + mesh.vertices[b].y) / 2,
		});
		midCache.set(key, mi);
		return mi;
	}

	for (const face of mesh.faces) {
		const n = face.length;

		// centroid
		let cx = 0, cy = 0;
		for (const vi of face) {
			cx += mesh.vertices[vi].x;
			cy += mesh.vertices[vi].y;
		}
		const cIdx = newVerts.length;
		newVerts.push({ x: cx / n, y: cy / n });

		// edge midpoints
		const mids = face.map((_, i) => mid(face[i], face[(i + 1) % n]));

		// one quad per corner: [corner_i, mid_i, centroid, mid_{i-1}]
		for (let i = 0; i < n; i++) {
			newFaces.push([face[i], mids[i], cIdx, mids[(i - 1 + n) % n]]);
		}
	}

	return { vertices: newVerts, faces: newFaces };
}

/* ── 4. Laplacian relaxation ─────────────────────────────────────── */

/**
 * Smooth vertex positions by iteratively averaging with neighbours.
 * Boundary vertices (on edges belonging to only one face) are pinned.
 */
export function relaxMesh(
	mesh: TownMeshData,
	iterations: number,
	_gridSize: number,
): TownMeshData {
	// vertex adjacency
	const adj: Set<number>[] = mesh.vertices.map(() => new Set());
	for (const face of mesh.faces) {
		for (let i = 0; i < face.length; i++) {
			const a = face[i], b = face[(i + 1) % face.length];
			adj[a].add(b);
			adj[b].add(a);
		}
	}

	// boundary detection
	const edgeCount = new Map<string, number>();
	for (const face of mesh.faces) {
		for (let i = 0; i < face.length; i++) {
			const key = edgeKey(face[i], face[(i + 1) % face.length]);
			edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
		}
	}
	const boundary = new Set<number>();
	for (const [key, count] of edgeCount) {
		if (count === 1) {
			const [a, b] = key.split(':').map(Number);
			boundary.add(a);
			boundary.add(b);
		}
	}

	let verts = mesh.vertices.map(v => ({ ...v }));

	for (let iter = 0; iter < iterations; iter++) {
		const next = verts.map((v, i) => {
			if (boundary.has(i)) return v;
			const nbrs = adj[i];
			if (nbrs.size === 0) return v;
			let sx = 0, sy = 0;
			for (const n of nbrs) {
				sx += verts[n].x;
				sy += verts[n].y;
			}
			const cnt = nbrs.size;
			return { x: sx / cnt, y: sy / cnt };
		});
		verts = next;
	}

	return { vertices: verts, faces: mesh.faces };
}

/* ── 5. Convert to OrganicGrid ───────────────────────────────────── */

/**
 * Convert the relaxed all-quad mesh into an OrganicGrid compatible with
 * GridQuery, GridPathfinder, GridRenderer, and the housing system.
 *
 * Clips cells to a flat-topped hex of the given circumradius.
 */
export function meshToOrganicGrid(mesh: TownMeshData, hexRadius: number): OrganicGrid {
	// identify valid faces (centroid within hex boundary)
	const validFI: number[] = [];
	const fiToCI = new Map<number, number>();

	for (let fi = 0; fi < mesh.faces.length; fi++) {
		const face = mesh.faces[fi];
		let cx = 0, cy = 0;
		for (const vi of face) {
			cx += mesh.vertices[vi].x;
			cy += mesh.vertices[vi].y;
		}
		cx /= face.length;
		cy /= face.length;

		if (insideHex(cx, cy, hexRadius)) {
			fiToCI.set(fi, validFI.length);
			validFI.push(fi);
		}
	}

	// edge → face adjacency (all faces, not just valid ones — for neighbor detection)
	const edgeFacesMap = new Map<string, number[]>();
	for (let fi = 0; fi < mesh.faces.length; fi++) {
		const face = mesh.faces[fi];
		for (let i = 0; i < face.length; i++) {
			const key = edgeKey(face[i], face[(i + 1) % face.length]);
			let list = edgeFacesMap.get(key);
			if (!list) {
				list = [];
				edgeFacesMap.set(key, list);
			}
			list.push(fi);
		}
	}

	// build cells
	const cells = validFI.map((fi, ci) => {
		const face = mesh.faces[fi];
		let cx = 0, cy = 0;
		for (const vi of face) {
			cx += mesh.vertices[vi].x;
			cy += mesh.vertices[vi].y;
		}
		cx /= face.length;
		cy /= face.length;

		// neighbours = cells sharing an edge
		const neighbors: number[] = [];
		for (let i = 0; i < face.length; i++) {
			const key = edgeKey(face[i], face[(i + 1) % face.length]);
			for (const adjFi of edgeFacesMap.get(key) || []) {
				if (adjFi === fi) continue;
				const adjCi = fiToCI.get(adjFi);
				if (adjCi !== undefined && !neighbors.includes(adjCi)) {
					neighbors.push(adjCi);
				}
			}
		}

		return {
			index: ci,
			center: { x: cx, y: cy },
			vertices: face.map(vi => ({ ...mesh.vertices[vi] })),
			neighbors,
		};
	});

	const points = cells.map(c => c.center);

	// Delaunay triangulation of cell centres (for GridQuery compatibility)
	const delaunay = Delaunay.from(points, p => p.x, p => p.y);
	const triangles: Triangle[] = [];
	for (let i = 0; i < delaunay.triangles.length; i += 3) {
		triangles.push({
			a: delaunay.triangles[i],
			b: delaunay.triangles[i + 1],
			c: delaunay.triangles[i + 2],
		});
	}

	// Hex AABB (flat-topped: width=2R, height=√3·R)
	const inradius = hexRadius * SQRT3 / 2;

	return {
		points,
		triangles,
		cells,
		bounds: { minX: -hexRadius, maxX: hexRadius, minY: -inradius, maxY: inradius },
	};
}
