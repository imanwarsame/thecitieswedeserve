/** Socket type identifiers. Two faces are compatible if their sockets match. */
export type SocketId = string;

/**
 * Vertical socket compatibility (top/bottom faces — load-bearing).
 */
export const VERTICAL_COMPAT: Record<SocketId, SocketId[]> = {
	'solid':   ['solid'],
	'open':    ['open'],
	'arch-t':  ['arch-b'],
	'arch-b':  ['arch-t'],
	'window':  ['window', 'solid'],
	'floor':   ['floor'],
	'roof':    ['air'],
	'air':     ['air', 'roof'],
	'any':     ['solid', 'open', 'arch-t', 'arch-b', 'window', 'floor', 'roof', 'air', 'any'],
};

/**
 * Horizontal socket compatibility (side faces — adjacency).
 * Symmetric: if A connects to B, B connects to A.
 */
export const HORIZONTAL_COMPAT: Record<SocketId, SocketId[]> = {
	'solid':   ['solid', 'window'],
	'open':    ['open', 'arch-t', 'arch-b'],
	'arch-t':  ['arch-t', 'open', 'solid'],
	'arch-b':  ['arch-b', 'open'],
	'window':  ['window', 'solid'],
	'floor':   ['floor'],
	'roof':    ['roof', 'air'],
	'air':     ['air', 'open', 'roof'],
	'any':     ['solid', 'open', 'arch-t', 'arch-b', 'window', 'floor', 'roof', 'air', 'any'],
};

export function socketsCompatible(a: SocketId, b: SocketId, horizontal = false): boolean {
	if (a === 'any' || b === 'any') return true;
	const table = horizontal ? HORIZONTAL_COMPAT : VERTICAL_COMPAT;
	return table[a]?.includes(b) ?? false;
}
