import * as THREE from 'three';
import { Input } from '../core/Input';
import { events } from '../core/Events';
import type { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

const RAYCAST_THROTTLE = 3; // raycast every N frames

export class SelectionManager {
	private raycaster = new THREE.Raycaster();
	private input!: Input;
	private camera!: THREE.Camera;
	private entityGroup!: THREE.Group;
	private formaGroup: THREE.Group | null = null;
	private hoverOutline!: OutlinePass;
	private selectOutline!: OutlinePass;

	private hoveredObject: THREE.Object3D | null = null;
	private selectedObject: THREE.Object3D | null = null;
	private frameCounter = 0;

	init(
		input: Input,
		camera: THREE.Camera,
		entityGroup: THREE.Group,
		hoverOutline: OutlinePass,
		selectOutline: OutlinePass,
	): void {
		this.input = input;
		this.camera = camera;
		this.entityGroup = entityGroup;
		this.hoverOutline = hoverOutline;
		this.selectOutline = selectOutline;
	}

	/** Set the GLB container so individual meshes inside it can be hovered/selected. */
	setFormaGroup(group: THREE.Group): void {
		this.formaGroup = group;
	}

	update(): void {
		this.frameCounter++;

		// Throttle raycasting
		if (this.frameCounter % RAYCAST_THROTTLE !== 0) return;

		const hit = this.raycastAll();

		if (hit !== this.hoveredObject) {
			const previous = this.hoveredObject;
			this.hoveredObject = hit;

			events.emit('selection:hover', { object: hit, previous });
			this.updateHoverOutline();
		}
	}

	/** Run hover raycast only — does NOT consume clicks. */
	updateHoverOnly(): void {
		this.frameCounter++;
		if (this.frameCounter % RAYCAST_THROTTLE !== 0) return;

		const hit = this.raycastAll();

		if (hit !== this.hoveredObject) {
			const previous = this.hoveredObject;
			this.hoveredObject = hit;
			events.emit('selection:hover', { object: hit, previous });
			this.updateHoverOutline();
		}
	}

	getHovered(): THREE.Object3D | null {
		return this.hoveredObject;
	}

	getSelected(): THREE.Object3D | null {
		return this.selectedObject;
	}

	setSelected(object: THREE.Object3D | null): void {
		if (object === this.selectedObject) return;

		if (object) {
			this.selectedObject = object;
			this.selectOutline.selectedObjects = [object];
			events.emit('selection:select', { object });
		} else {
			if (this.selectedObject) {
				events.emit('selection:deselect', { object: this.selectedObject });
			}
			this.selectedObject = null;
			this.selectOutline.selectedObjects = [];
		}

		this.updateHoverOutline();
	}

	clearSelection(): void {
		this.setSelected(null);
	}

	dispose(): void {
		this.hoveredObject = null;
		this.selectedObject = null;
		this.hoverOutline.selectedObjects = [];
		this.selectOutline.selectedObjects = [];
	}

	private updateHoverOutline(): void {
		if (this.hoveredObject && this.hoveredObject !== this.selectedObject) {
			this.hoverOutline.selectedObjects = [this.hoveredObject];
		} else {
			this.hoverOutline.selectedObjects = [];
		}
	}

	/**
	 * Raycast against both entity group (resolve to entity root) and
	 * forma group (resolve to individual mesh). Returns the closest hit.
	 */
	private raycastAll(): THREE.Object3D | null {
		this.raycaster.setFromCamera(this.input.mouse, this.camera);

		let bestHit: THREE.Object3D | null = null;
		let bestDist = Infinity;

		// Entity group — resolve to top-level entity
		const entityHits = this.raycaster.intersectObjects(this.entityGroup.children, true);
		if (entityHits.length > 0) {
			bestHit = this.resolveTopLevelObject(entityHits[0].object);
			bestDist = entityHits[0].distance;
		}

		// Forma group — resolve to individual mesh
		if (this.formaGroup) {
			const formaHits = this.raycaster.intersectObject(this.formaGroup, true);
			if (formaHits.length > 0 && formaHits[0].distance < bestDist) {
				bestHit = this.resolveMesh(formaHits[0].object);
			}
		}

		return bestHit;
	}

	/** Walk up to the direct child of entityGroup (the entity root mesh) */
	private resolveTopLevelObject(object: THREE.Object3D): THREE.Object3D {
		let current = object;
		while (current.parent && current.parent !== this.entityGroup) {
			current = current.parent;
		}
		return current;
	}

	/** Resolve to the nearest Mesh ancestor (individual GLB mesh). */
	private resolveMesh(object: THREE.Object3D): THREE.Object3D {
		if (object instanceof THREE.Mesh) return object;
		let current = object;
		while (current.parent) {
			if (current instanceof THREE.Mesh) return current;
			current = current.parent;
		}
		return object;
	}
}
