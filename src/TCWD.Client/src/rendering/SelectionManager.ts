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

	update(): void {
		this.frameCounter++;

		// Handle clicks every frame for responsiveness
		if (this.input.consumeClick()) {
			this.handleClick();
		}

		// Throttle raycasting
		if (this.frameCounter % RAYCAST_THROTTLE !== 0) return;

		this.raycaster.setFromCamera(this.input.mouse, this.camera);
		const intersects = this.raycaster.intersectObjects(this.entityGroup.children, true);

		const hit = intersects.length > 0 ? this.resolveTopLevelObject(intersects[0].object) : null;

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

	clearSelection(): void {
		if (this.selectedObject) {
			const prev = this.selectedObject;
			this.selectedObject = null;
			this.selectOutline.selectedObjects = [];
			events.emit('selection:deselect', { object: prev });
		}
	}

	dispose(): void {
		this.hoveredObject = null;
		this.selectedObject = null;
		this.hoverOutline.selectedObjects = [];
		this.selectOutline.selectedObjects = [];
	}

	private handleClick(): void {
		if (this.hoveredObject) {
			if (this.selectedObject === this.hoveredObject) {
				// Clicking same object deselects
				this.clearSelection();
			} else {
				// Select new object
				this.selectedObject = this.hoveredObject;
				this.selectOutline.selectedObjects = [this.selectedObject];
				events.emit('selection:select', { object: this.selectedObject });
			}
		} else {
			// Clicking empty space deselects
			this.clearSelection();
		}
		this.updateHoverOutline();
	}

	private updateHoverOutline(): void {
		if (this.hoveredObject && this.hoveredObject !== this.selectedObject) {
			this.hoverOutline.selectedObjects = [this.hoveredObject];
		} else {
			this.hoverOutline.selectedObjects = [];
		}
	}

	/** Walk up to the direct child of entityGroup (the entity root mesh) */
	private resolveTopLevelObject(object: THREE.Object3D): THREE.Object3D {
		let current = object;
		while (current.parent && current.parent !== this.entityGroup) {
			current = current.parent;
		}
		return current;
	}
}
