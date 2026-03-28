/** A 2D point on the ground plane (x maps to Three.js x, y maps to Three.js z) */
export interface GridPoint {
	x: number;
	y: number;
}

/** A triangle defined by three point indices */
export interface Triangle {
	a: number;
	b: number;
	c: number;
}

/** A Voronoi cell (polygon) defined by its center point and ordered vertex positions */
export interface VoronoiCell {
	index: number;           // which seed point this cell belongs to
	center: GridPoint;       // the seed point
	vertices: GridPoint[];   // ordered polygon vertices (CCW)
	neighbors: number[];     // indices of adjacent cells
}

/** The complete grid data after generation */
export interface OrganicGrid {
	points: GridPoint[];           // seed points (after relaxation)
	triangles: Triangle[];         // Delaunay triangles
	cells: VoronoiCell[];          // Voronoi cells
	bounds: {                      // world-space bounds
		minX: number; maxX: number;
		minY: number; maxY: number;
	};
}
