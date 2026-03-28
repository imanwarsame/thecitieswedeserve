import * as THREE from 'three';
import { events } from '../core/Events';
import { CursorRenderer } from './CursorRenderer';
import type { Engine } from '../core/Engine';

const CURSOR_THROTTLE_MS = 66; // ~15fps

/**
 * Bridges collab socket events to the Engine.
 * - Replays remote scene deltas locally
 * - Handles state requests / sync for late joiners
 * - Broadcasts local cursor position
 * - Renders remote cursors in 3D
 */
export class CollabBridge {
  private engine: Engine;
  private cursorRenderer: CursorRenderer;
  private handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];
  private lastCursorEmit = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(engine: Engine) {
    this.engine = engine;
    this.cursorRenderer = new CursorRenderer(engine.getScene().root);
    this.listen();
    this.startCursorTracking();
  }

  private listen() {
    const onRemoteDelta = (...args: unknown[]) => {
      const delta = args[0] as {
        type: string;
        cellIndex: number;
        buildingType?: string;
      };

      switch (delta.type) {
        case 'housing:place':
          this.engine.getHousingSystem().placeHousing(delta.cellIndex);
          break;
        case 'housing:demolish':
          this.engine.getHousingSystem().demolish(delta.cellIndex);
          break;
        case 'building:place':
          if (delta.buildingType) {
            const bridge = this.engine.getSimulationBridge();
            bridge.addBuilding(
              delta.buildingType as Parameters<typeof bridge.addBuilding>[0],
              delta.cellIndex,
            );
          }
          break;
      }
    };

    const onStateRequest = (...args: unknown[]) => {
      const requesterId = args[0] as string;
      const housingSystem = this.engine.getHousingSystem();
      const occupiedCells = housingSystem.getOccupiedCells();

      const housing: Array<{ cellIndex: number; height: number }> = [];
      for (const cellIndex of occupiedCells) {
        housing.push({ cellIndex, height: housingSystem.getHeight(cellIndex) });
      }

      events.emit('collab:sendState', { targetId: requesterId, state: { housing } });
    };

    const onSyncState = (...args: unknown[]) => {
      const fullState = args[0] as { housing: Array<{ cellIndex: number; height: number }> };
      if (!fullState?.housing) return;

      const housingSystem = this.engine.getHousingSystem();
      for (const { cellIndex, height } of fullState.housing) {
        for (let i = 0; i < height; i++) {
          housingSystem.placeHousing(cellIndex);
        }
      }
    };

    this.on('collab:remoteDelta', onRemoteDelta);
    this.on('collab:stateRequest', onStateRequest);
    this.on('collab:syncState', onSyncState);
  }

  private startCursorTracking() {
    // Register an update callback on the engine loop to broadcast cursor + update remote cursors
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
  }
}
