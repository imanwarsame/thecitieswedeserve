export const ISOMETRIC_ANGLE_Y = Math.PI / 4;
export const ISOMETRIC_ANGLE_X = Math.atan(1 / Math.sqrt(2));
export const MAX_DELTA = 0.1;

export const GROUP_NAMES = {
	ENVIRONMENT: 'environment',
	TERRAIN: 'terrain',
	ENTITY: 'entity',
	EFFECTS: 'effects',
	DEBUG: 'debug',
} as const;
