import type { Component } from '../Component';
import type { Entity } from '../Entity';
import type { GLTF } from '../../assets/loaders/ModelLoader';

export class ModelComponent implements Component {
	readonly type = 'model';

	private gltf: GLTF;

	constructor(gltf: GLTF) {
		this.gltf = gltf;
	}

	init(entity: Entity): void {
		const model = this.gltf.scene.clone();
		entity.mesh = model;
	}

	update(_delta: number): void {
		// Future: animation mixer updates
	}

	dispose(): void {
		// Mesh disposal handled by Entity
	}
}
