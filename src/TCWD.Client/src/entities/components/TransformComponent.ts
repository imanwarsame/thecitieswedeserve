import * as THREE from 'three';
import type { Component } from '../Component';
import type { Entity } from '../Entity';

export class TransformComponent implements Component {
	readonly type = 'transform';

	private entity!: Entity;

	init(entity: Entity): void {
		this.entity = entity;
	}

	update(_delta: number): void {
		// Transform sync is handled by Entity.syncTransform()
	}

	setPosition(x: number, y: number, z: number): void {
		this.entity.position.set(x, y, z);
	}

	translate(offset: THREE.Vector3): void {
		this.entity.position.add(offset);
	}

	lookAt(target: THREE.Vector3): void {
		this.entity.mesh?.lookAt(target);
	}

	dispose(): void {
		// Nothing to clean up
	}
}
