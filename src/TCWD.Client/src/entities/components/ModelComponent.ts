import * as THREE from 'three';
import type { Component } from '../Component';
import type { Entity } from '../Entity';
import type { GLTF } from '../../assets/loaders/ModelLoader';

export class ModelComponent implements Component {
	readonly type = 'model';

	private gltf: GLTF;
	private mixer: THREE.AnimationMixer | null = null;

	constructor(gltf: GLTF) {
		this.gltf = gltf;
	}

	init(entity: Entity): void {
		const model = this.gltf.scene.clone();
		entity.mesh = model;

		// Auto-play all embedded animations
		if (this.gltf.animations.length > 0) {
			this.mixer = new THREE.AnimationMixer(model);
			for (const clip of this.gltf.animations) {
				this.mixer.clipAction(clip).play();
			}
		}
	}

	update(delta: number): void {
		this.mixer?.update(delta);
	}

	dispose(): void {
		this.mixer?.stopAllAction();
		this.mixer = null;
	}
}
