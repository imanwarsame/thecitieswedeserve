import * as Y from 'yjs';
import type { Socket } from 'socket.io-client';

/**
 * Lightweight Yjs provider that syncs a Y.Doc over an existing Socket.IO connection.
 * Binary Uint8Array payloads — no base64 encoding needed (Socket.IO handles binary natively).
 */
export class YjsSocketProvider {
  readonly doc: Y.Doc;
  private socket: Socket;
  private _synced = false;
  private _onUpdate: (update: Uint8Array, origin: unknown) => void;
  private _onSyncResponse: (data: ArrayBuffer) => void;
  private _onRemoteUpdate: (data: ArrayBuffer) => void;

  constructor(
    doc: Y.Doc,
    socket: Socket,
  ) {
    this.doc = doc;
    this.socket = socket;
    // Local doc changes → emit to server
    this._onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return; // don't echo back remote updates
      this.socket.emit('yjs-update', update);
    };

    // Server sends full state or diff
    this._onSyncResponse = (data: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(data), 'remote');
      this._synced = true;
    };

    // Server relays another client's update
    this._onRemoteUpdate = (data: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(data), 'remote');
    };
  }

  get synced() {
    return this._synced;
  }

  connect() {
    this.socket.on('yjs-sync-response', this._onSyncResponse);
    this.socket.on('yjs-update', this._onRemoteUpdate);
    this.doc.on('update', this._onUpdate);

    // Request sync — send our state vector so server sends the diff
    const sv = Y.encodeStateVector(this.doc);
    this.socket.emit('yjs-sync-request', sv);
  }

  disconnect() {
    this.socket.off('yjs-sync-response', this._onSyncResponse);
    this.socket.off('yjs-update', this._onRemoteUpdate);
    this.doc.off('update', this._onUpdate);
  }

  destroy() {
    this.disconnect();
  }
}
