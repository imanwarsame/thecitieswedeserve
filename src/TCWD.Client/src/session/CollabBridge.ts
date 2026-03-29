import * as THREE from 'three';
import * as Y from 'yjs';
import { events } from '../core/Events';
import { CursorRenderer } from './CursorRenderer';
import { YjsSocketProvider } from './YjsSocketProvider';
import type { Engine } from '../core/Engine';
import type { Socket } from 'socket.io-client';
import type { BuildingType } from '../simulation/bridge/BuildingFactory';

const CURSOR_THROTTLE_MS = 66; // ~15fps

const LOCAL_ORIGIN = 'local';

/**
 * Bridges collab state to the Engine via Yjs CRDT.
 * - Owns a Y.Doc with a shared "cells" Y.Map
 * - Writes local actions (housing, buildings) to the Y.Map
 * - Observes remote + undo changes and replays them into the Engine
 * - Per-user undo/redo via Y.UndoManager
 * - Cursor broadcasting stays on raw Socket.IO
 */
export class CollabBridge {
  private engine: Engine;
  private cursorRenderer: CursorRenderer;
  private handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];
  private lastCursorEmit = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Yjs
  private doc: Y.Doc;
  private cells: Y.Map<Y.Map<unknown>>;
  private undoManager: Y.UndoManager;
  private provider: YjsSocketProvider | null = null;

  // Prevent re-entrant observer → engine → event → Y.Map loops
  private applyingRemote = false;

  constructor(engine: Engine) {
    this.engine = engine;
    this.cursorRenderer = new CursorRenderer(engine.getScene().root);

    // Yjs document
    this.doc = new Y.Doc();
    this.cells = this.doc.getMap('cells');
    this.undoManager = new Y.UndoManager(this.cells, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });

    this.observeCells();
    this.listenLocalActions();
    this.listenSocket();
    this.listenUndoRedo();
    this.startCursorTracking();
  }

  // ── Yjs observer: replay remote & undo changes into Engine ──

  private observeCells() {
    this.cells.observeDeep((yEvents, transaction) => {
      // Skip local user actions — engine already applied them
      if (transaction.origin === LOCAL_ORIGIN) return;

      this.applyingRemote = true;
      try {
        for (const yEvent of yEvents) {
          if (!(yEvent instanceof Y.YMapEvent)) continue;
          const target = yEvent.target;

          // Top-level cells map: entries added or deleted
          if (target === this.cells) {
            for (const [key, change] of yEvent.changes.keys) {
              const cellIndex = Number(key);
              if (isNaN(cellIndex)) continue;

              if (change.action === 'add') {
                const cell = this.cells.get(key);
                if (!cell) continue;
                this.replayAdd(cellIndex, cell);
              } else if (change.action === 'delete') {
                this.replayDelete(cellIndex, change.oldValue as Y.Map<unknown>);
              }
            }
          } else {
            // Nested cell map changed (e.g. height update)
            this.replayUpdate(target as Y.Map<unknown>);
          }
        }
      } finally {
        this.applyingRemote = false;
      }
    });
  }

  private replayAdd(cellIndex: number, cell: Y.Map<unknown>) {
    const type = cell.get('type') as string;
    if (type === 'housing') {
      const height = (cell.get('height') as number) ?? 1;
      const current = this.engine.getHousingSystem().getHeight(cellIndex);
      for (let i = current; i < height; i++) {
        this.engine.getHousingSystem().placeHousing(cellIndex);
      }
    } else if (type === 'building') {
      const buildingType = cell.get('buildingType') as BuildingType;
      if (buildingType) {
        this.engine.getSimulationBridge().addBuilding(buildingType, cellIndex);
      }
    }
  }

  private replayDelete(cellIndex: number, oldCell: Y.Map<unknown>) {
    const type = oldCell?.get?.('type') as string | undefined;
    if (type === 'housing') {
      this.engine.getHousingSystem().demolish(cellIndex);
    } else if (type === 'building') {
      const entityManager = this.engine.getScene().getEntityManager();
      const entity = entityManager.getEntityAtCell(cellIndex);
      if (entity) {
        this.engine.getSimulationBridge().removeBuilding(entity.id);
      }
    }
  }

  private replayUpdate(cellMap: Y.Map<unknown>) {
    // Find the cell index by scanning (cellMap is a child of this.cells)
    let cellIndex = -1;
    for (const [key, val] of this.cells.entries()) {
      if (val === cellMap) { cellIndex = Number(key); break; }
    }
    if (cellIndex < 0) return;

    const type = cellMap.get('type') as string;
    if (type === 'housing') {
      const targetHeight = (cellMap.get('height') as number) ?? 0;
      const currentHeight = this.engine.getHousingSystem().getHeight(cellIndex);

      if (targetHeight > currentHeight) {
        for (let i = currentHeight; i < targetHeight; i++) {
          this.engine.getHousingSystem().placeHousing(cellIndex);
        }
      } else if (targetHeight < currentHeight) {
        // Remove layers (demolish removes all, so we demolish then re-place)
        if (targetHeight <= 0) {
          this.engine.getHousingSystem().demolish(cellIndex);
        } else {
          this.engine.getHousingSystem().demolish(cellIndex);
          for (let i = 0; i < targetHeight; i++) {
            this.engine.getHousingSystem().placeHousing(cellIndex);
          }
        }
      }
    }
  }

  // ── Local action listeners: write to Y.Map ──

  private listenLocalActions() {
    const onHousingPlaced = (...args: unknown[]) => {
      if (this.applyingRemote) return;
      const { cellIndex } = args[0] as { cellIndex: number; height: number };
      const key = String(cellIndex);
      this.doc.transact(() => {
        let cell = this.cells.get(key);
        if (!cell) {
          cell = new Y.Map<unknown>();
          cell.set('type', 'housing');
          cell.set('height', 1);
          this.cells.set(key, cell);
        } else if (cell.get('type') === 'housing') {
          cell.set('height', (cell.get('height') as number) + 1);
        }
      }, LOCAL_ORIGIN);
    };

    const onHousingDemolished = (...args: unknown[]) => {
      if (this.applyingRemote) return;
      const { cellIndex } = args[0] as { cellIndex: number };
      const key = String(cellIndex);
      this.doc.transact(() => {
        this.cells.delete(key);
      }, LOCAL_ORIGIN);
    };

    const onBuildingPlaced = (...args: unknown[]) => {
      if (this.applyingRemote) return;
      const { type, cellIndex } = args[0] as { type: string; cellIndex: number; entityId: string; simId: string };
      const key = String(cellIndex);
      this.doc.transact(() => {
        const cell = new Y.Map<unknown>();
        cell.set('type', 'building');
        cell.set('buildingType', type);
        this.cells.set(key, cell);
      }, LOCAL_ORIGIN);
    };

    this.on('housing:placed', onHousingPlaced);
    this.on('housing:demolished', onHousingDemolished);
    this.on('building:placed', onBuildingPlaced);
  }

  // ── Socket lifecycle (collab:socketReady / collab:socketDisconnected) ──

  private listenSocket() {
    const onSocketReady = (...args: unknown[]) => {
      const socket = args[0] as Socket;
      if (this.provider) {
        this.provider.destroy();
      }
      this.provider = new YjsSocketProvider(this.doc, socket);
      this.provider.connect();
    };

    const onSocketDisconnected = () => {
      if (this.provider) {
        this.provider.destroy();
        this.provider = null;
      }
    };

    this.on('collab:socketReady', onSocketReady);
    this.on('collab:socketDisconnected', onSocketDisconnected);
  }

  // ── Undo / Redo ──

  private listenUndoRedo() {
    const onUndo = () => this.undoManager.undo();
    const onRedo = () => this.undoManager.redo();

    this.on('collab:undo', onUndo);
    this.on('collab:redo', onRedo);
  }

  undo() { this.undoManager.undo(); }
  redo() { this.undoManager.redo(); }

  // ── Cursor tracking (unchanged — stays on raw Socket.IO) ──

  private startCursorTracking() {
    this.engine.registerUpdate(() => {
      this.cursorRenderer.update(0);
      this.emitLocalCursor();
    });
  }

  private emitLocalCursor() {
    const now = performance.now();
    if (now - this.lastCursorEmit < CURSOR_THROTTLE_MS) return;
    this.lastCursorEmit = now;

    const input = this.engine.getInput();
    const camera = this.engine.getIsometricCamera().getCamera();
    this.raycaster.setFromCamera(input.mouse, camera);

    const intersection = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersection);
    if (hit) {
      events.emit('collab:localCursor', { x: intersection.x, y: intersection.y, z: intersection.z });
    }
  }

  // ── Helpers ──

  private on(event: string, fn: (...args: unknown[]) => void) {
    events.on(event, fn);
    this.handlers.push({ event, fn });
  }

  dispose() {
    for (const { event, fn } of this.handlers) {
      events.off(event, fn);
    }
    this.handlers = [];
    this.cursorRenderer.dispose();
    this.provider?.destroy();
    this.undoManager.destroy();
    this.doc.destroy();
  }
}
