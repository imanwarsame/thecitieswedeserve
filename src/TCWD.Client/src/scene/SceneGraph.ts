import * as THREE from 'three';

export class SceneGraph {
	private root: THREE.Scene;
	private groups = new Map<string, THREE.Group>();

	constructor(root: THREE.Scene) {
		this.root = root;
	}

	createGroup(name: string): THREE.Group {
		if (this.groups.has(name)) {
			return this.groups.get(name)!;
		}
		const group = new THREE.Group();
		group.name = name;
		this.groups.set(name, group);
		this.root.add(group);
		return group;
	}

	getGroup(name: string): THREE.Group {
		const group = this.groups.get(name);
		if (!group) {
			throw new Error(`[SceneGraph] Group "${name}" not found.`);
		}
		return group;
	}

	addToGroup(name: string, object: THREE.Object3D): void {
		this.getGroup(name).add(object);
	}

	removeFromGroup(name: string, object: THREE.Object3D): void {
		this.getGroup(name).remove(object);
	}

	setGroupVisibility(name: string, visible: boolean): void {
		this.getGroup(name).visible = visible;
	}

	dispose(): void {
		for (const group of this.groups.values()) {
			group.traverse(child => {
				if (child instanceof THREE.Mesh) {
					child.geometry.dispose();
					if (Array.isArray(child.material)) {
						child.material.forEach(m => m.dispose());
					} else {
						child.material.dispose();
					}
				}
			});
			this.root.remove(group);
		}
		this.groups.clear();
	}
}
