import * as THREE from 'three';
import { events } from '../core/Events';

interface CursorData {
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  target: THREE.Vector3;
  lastUpdate: number;
}

const CURSOR_RADIUS = 2.5;
const CURSOR_Y = 0.08;
const STALE_MS = 3000;

/**
 * Renders colored ring cursors for remote collaborators in the 3D scene.
 */
export class CursorRenderer {
  private cursors = new Map<string, CursorData>();
  private group: THREE.Group;
  private handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];

  constructor(parentScene: THREE.Object3D) {
    this.group = new THREE.Group();
    this.group.name = 'collab-cursors';
    parentScene.add(this.group);

    const onCursorMove = (...args: unknown[]) => {
      const data = args[0] as { userId: string; color: string; name: string; x: number; y: number; z: number };
      this.updateCursor(data.userId, data.color, data.name, data.x, data.y, data.z);
    };
    events.on('collab:cursorMove', onCursorMove);
    this.handlers.push({ event: 'collab:cursorMove', fn: onCursorMove });
  }

  private updateCursor(userId: string, color: string, name: string, x: number, y: number, z: number) {
    let cursor = this.cursors.get(userId);

    if (!cursor) {
      cursor = this.createCursor(color, name);
      this.cursors.set(userId, cursor);
      this.group.add(cursor.mesh);
      this.group.add(cursor.label);
    }

    cursor.target.set(x, y + CURSOR_Y, z);
    cursor.lastUpdate = performance.now();

    // Update label text if name changed
    this.updateLabel(cursor.label, name, color);
  }

  private createCursor(color: string, name: string): CursorData {
    // Ring geometry
    const geo = new THREE.RingGeometry(CURSOR_RADIUS * 0.6, CURSOR_RADIUS, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;

    // Name label sprite
    const label = this.createLabel(name, color);

    return { mesh, label, target: new THREE.Vector3(), lastUpdate: performance.now() };
  }

  private createLabel(name: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(5, 1.25, 1);
    return sprite;
  }

  private updateLabel(sprite: THREE.Sprite, name: string, color: string) {
    const mat = sprite.material as THREE.SpriteMaterial;
    const tex = mat.map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32);
    tex.needsUpdate = true;
  }

  /** Call each frame to lerp cursors and remove stale ones. */
  update(_delta: number) {
    const now = performance.now();
    for (const [userId, cursor] of this.cursors) {
      // Remove stale cursors
      if (now - cursor.lastUpdate > STALE_MS) {
        this.group.remove(cursor.mesh);
        this.group.remove(cursor.label);
        (cursor.mesh.material as THREE.Material).dispose();
        cursor.mesh.geometry.dispose();
        (cursor.label.material as THREE.SpriteMaterial).map?.dispose();
        (cursor.label.material as THREE.Material).dispose();
        this.cursors.delete(userId);
        continue;
      }

      // Smooth lerp
      cursor.mesh.position.lerp(cursor.target, 0.15);
      cursor.label.position.copy(cursor.mesh.position);
      cursor.label.position.y += 2.5;
    }
  }

  dispose() {
    for (const { event, fn } of this.handlers) {
      events.off(event, fn);
    }
    this.handlers = [];

    for (const [, cursor] of this.cursors) {
      (cursor.mesh.material as THREE.Material).dispose();
      cursor.mesh.geometry.dispose();
      (cursor.label.material as THREE.SpriteMaterial).map?.dispose();
      (cursor.label.material as THREE.Material).dispose();
    }
    this.cursors.clear();
    this.group.parent?.remove(this.group);
  }
}
