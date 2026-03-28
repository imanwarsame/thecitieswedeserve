import * as THREE from 'three';

export function drawGrid(group: THREE.Group, size = 40, divisions = 40): THREE.GridHelper {
	const grid = new THREE.GridHelper(size, divisions, 0x00ff00, 0x00ff00);
	grid.position.y = 0.02;
	(grid.material as THREE.Material).opacity = 0.2;
	(grid.material as THREE.Material).transparent = true;
	group.add(grid);
	return grid;
}

export function drawAxes(group: THREE.Group, size = 5): THREE.AxesHelper {
	const axes = new THREE.AxesHelper(size);
	group.add(axes);
	return axes;
}

export function drawBounds(object: THREE.Object3D, group: THREE.Group): THREE.Box3Helper {
	const box = new THREE.Box3().setFromObject(object);
	const helper = new THREE.Box3Helper(box, new THREE.Color(0xffff00));
	group.add(helper);
	return helper;
}

export function logSceneGraph(object: THREE.Object3D, indent = 0): void {
	const prefix = '  '.repeat(indent);
	const type = object.constructor.name;
	const name = object.name || '(unnamed)';
	console.log(`${prefix}${type}: ${name}`);
	for (const child of object.children) {
		logSceneGraph(child, indent + 1);
	}
}

export function toggleDebugGroup(scene: THREE.Scene, visible: boolean): void {
	const debug = scene.getObjectByName('debug');
	if (debug) {
		debug.visible = visible;
	}
}
