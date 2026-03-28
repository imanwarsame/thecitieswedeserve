import {
	generateTriangleLattice,
	randomPairing,
	conwayOrtho,
	relaxMesh,
	meshToOrganicGrid,
} from './TownMesh';
import { GridConfig } from './GridConfig';
import { GridQuery } from './GridQuery';
import { GridPathfinder } from './GridPathfinder';
import type { BuiltGrid } from './GridBuilder';

/**
 * Build a Townscaper-style grid:
 *   triangle lattice → random pairing → Conway Ortho → relax → OrganicGrid
 *
 * Produces an all-quad mesh with organic smoothing, compatible with the
 * existing grid systems (query, pathfinding, rendering, housing).
 */
export function buildTownGrid(): BuiltGrid {
	const { seed, townHexRadius, townTriEdge, townRelaxIterations, size } = GridConfig;

	// 1. Equilateral-triangle lattice clipped to hex boundary
	let mesh = generateTriangleLattice(townHexRadius, townTriEdge);
	console.log(
		`[TownGrid] Lattice: ${mesh.vertices.length} verts, ${mesh.faces.length} tris`,
	);

	// 2. Random pairing (triangles → quads)
	mesh = randomPairing(mesh, seed);
	const nq = mesh.faces.filter(f => f.length === 4).length;
	const nt = mesh.faces.filter(f => f.length === 3).length;
	console.log(`[TownGrid] Paired: ${nq} quads, ${nt} remaining tris`);

	// 3. Conway Ortho → all quads
	mesh = conwayOrtho(mesh);
	console.log(
		`[TownGrid] Ortho: ${mesh.vertices.length} verts, ${mesh.faces.length} faces`,
	);

	// 4. Laplacian relaxation (smoothing)
	mesh = relaxMesh(mesh, townRelaxIterations, size);

	// 5. Convert to OrganicGrid (clips to hex)
	const grid = meshToOrganicGrid(mesh, townHexRadius);

	// 6. Attach query + pathfinder
	const query = new GridQuery(grid);
	const pathfinder = new GridPathfinder(grid);

	console.log(`[TownGrid] Final: ${grid.cells.length} cells (hexRadius=${townHexRadius})`);

	return { ...grid, query, pathfinder };
}
