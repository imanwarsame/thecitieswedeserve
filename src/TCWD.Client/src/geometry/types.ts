export interface ExtrudeParams {
	/** Polygon vertices (2D, in world XZ plane). Ordered CCW. */
	footprint: { x: number; y: number }[];
	/** Height of the extrusion (Y axis). */
	height: number;
	/** Material key for walls. Default 'structure'. */
	wallMaterial?: string;
	/** Material key for the top face. Default 'detail'. */
	roofMaterial?: string;
	/** If set, adds a slight inset to the roof polygon. Default 0. */
	roofInset?: number;
}

export interface BoxParams {
	width: number;
	height: number;
	depth: number;
	material?: string;
}

export interface CylinderParams {
	radiusTop: number;
	radiusBottom: number;
	height: number;
	segments?: number;
	material?: string;
}

export interface WallParams {
	/** Start point on XZ plane */
	from: { x: number; y: number };
	/** End point on XZ plane */
	to: { x: number; y: number };
	height: number;
	thickness: number;
	material?: string;
}
