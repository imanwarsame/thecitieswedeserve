import * as THREE from 'three';
import type { Component } from './Component';

let nextId = 0;

export class Entity {
	readonly id: string;
	name: string;
	readonly position: THREE.Vector3;
	readonly rotation: THREE.Euler;
	readonly scale: THREE.Vector3;
	mesh: THREE.Object3D | null;
	active: boolean;

	private components = new Map<string, Component>();

	cellIndex: number;

	constructor(options: {
		id?: string;
		name?: string;
		mesh?: THREE.Object3D;
		position?: THREE.Vector3;
		cellIndex?: number;
	} = {}) {
		this.id = options.id ?? `entity_${nextId++}`;
		this.name = options.name ?? this.id;
		this.mesh = options.mesh ?? null;
		this.position = options.position?.clone() ?? new THREE.Vector3();
		this.rotation = new THREE.Euler();
		this.scale = new THREE.Vector3(1, 1, 1);
		this.active = true;
		this.cellIndex = options.cellIndex ?? -1;
	}

	init(): void {
		this.syncTransform();
		for (const component of this.components.values()) {
			component.init(this);
		}
	}

	update(delta: number): void {
		if (!this.active) return;
		for (const component of this.components.values()) {
			component.update(delta);
		}
		this.syncTransform();
	}

	dispose(): void {
		for (const component of this.components.values()) {
			component.dispose();
		}
		this.components.clear();

		if (this.mesh) {
			this.mesh.traverse(child => {
				if (child instanceof THREE.Mesh) {
					child.geometry.dispose();
					if (Array.isArray(child.material)) {
						child.material.forEach(m => m.dispose());
					} else {
						child.material.dispose();
					}
				}
			});
		}
	}

	addComponent(component: Component): void {
		this.components.set(component.type, component);
	}

	getComponent<T extends Component>(type: string): T {
		const comp = this.components.get(type);
		if (!comp) {
			throw new Error(`[Entity "${this.id}"] Component "${type}" not found.`);
		}
		return comp as T;
	}

	hasComponent(type: string): boolean {
		return this.components.has(type);
	}

	removeComponent(type: string): void {
		const comp = this.components.get(type);
		if (comp) {
			comp.dispose();
			this.components.delete(type);
		}
	}

	private syncTransform(): void {
		if (!this.mesh) return;
		this.mesh.position.copy(this.position);
		this.mesh.rotation.copy(this.rotation);
		this.mesh.scale.copy(this.scale);
	}
}
