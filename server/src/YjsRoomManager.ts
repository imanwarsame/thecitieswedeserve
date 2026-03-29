import * as Y from 'yjs';
import type { Server, Socket } from 'socket.io';
import type { SessionStore } from './SessionStore.js';

const PERSIST_DEBOUNCE_MS = 2000;

/**
 * Manages one Y.Doc per session room.
 * - Syncs Yjs state over Socket.IO (binary Uint8Array payloads)
 * - Persists document snapshots to Redis via SessionStore
 */
export class YjsRoomManager {
  private docs = new Map<string, Y.Doc>();
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private io: Server,
    private store: SessionStore,
  ) {}

  /** Create or restore a Y.Doc for a session. */
  async getOrCreateDoc(sessionId: string): Promise<Y.Doc> {
    let doc = this.docs.get(sessionId);
    if (doc) return doc;

    doc = new Y.Doc();
    this.docs.set(sessionId, doc);

    // Restore from Redis if available
    const saved = await this.store.loadYDoc(sessionId);
    if (saved) {
      Y.applyUpdate(doc, saved);
    }

    // Persist on every update (debounced)
    doc.on('update', () => {
      this.schedulePersist(sessionId, doc!);
    });

    return doc;
  }

  /** Wire Yjs sync events onto a socket that just joined a room. */
  bindSocket(socket: Socket, sessionId: string) {
    const doc = this.docs.get(sessionId);
    if (!doc) return;

    // Client requests sync: sends its state vector, we reply with the diff
    socket.on('yjs-sync-request', (stateVector: ArrayBuffer) => {
      const sv = new Uint8Array(stateVector);
      const diff = Y.encodeStateAsUpdate(doc, sv);
      socket.emit('yjs-sync-response', diff);
    });

    // Client sends incremental update
    socket.on('yjs-update', (update: ArrayBuffer) => {
      const u = new Uint8Array(update);
      Y.applyUpdate(doc, u, 'remote');
      // Broadcast to everyone else in the room
      socket.to(sessionId).emit('yjs-update', u);
    });

    // Send full state to the newly connected client
    const fullState = Y.encodeStateAsUpdate(doc);
    socket.emit('yjs-sync-response', fullState);
  }

  /** Unbind Yjs listeners from a socket. */
  unbindSocket(socket: Socket) {
    socket.removeAllListeners('yjs-sync-request');
    socket.removeAllListeners('yjs-update');
  }

  /** Destroy a room's Y.Doc and flush to Redis. */
  async destroyRoom(sessionId: string) {
    const doc = this.docs.get(sessionId);
    if (!doc) return;

    // Clear pending persist timer
    const timer = this.persistTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(sessionId);
    }

    // Final persist
    await this.store.saveYDoc(sessionId, Y.encodeStateAsUpdate(doc));

    doc.destroy();
    this.docs.delete(sessionId);
  }

  private schedulePersist(sessionId: string, doc: Y.Doc) {
    const existing = this.persistTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.persistTimers.delete(sessionId);
      try {
        await this.store.saveYDoc(sessionId, Y.encodeStateAsUpdate(doc));
      } catch (err) {
        console.error('[YjsRoomManager] persist error:', err);
      }
    }, PERSIST_DEBOUNCE_MS);

    this.persistTimers.set(sessionId, timer);
  }
}
