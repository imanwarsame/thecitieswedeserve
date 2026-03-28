/** Socket type identifiers. Two faces are compatible if their sockets match. */
export type SocketId = string;

/**
 * Socket compatibility table.
 * Each socket lists which other sockets it can connect to.
 */
export const SOCKET_COMPAT: Record<SocketId, SocketId[]> = {
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

export function socketsCompatible(a: SocketId, b: SocketId): boolean {
	if (a === 'any' || b === 'any') return true;
	return SOCKET_COMPAT[a]?.includes(b) ?? false;
}
