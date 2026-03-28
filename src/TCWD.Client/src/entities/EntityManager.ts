import * as THREE from 'three';
import { Entity } from './Entity';
import { events } from '../core/Events';

export class EntityManager {
	private entities = new Map<string, Entity>();
	private entityGroup: THREE.Group;

	constructor(entityGroup: THREE.Group) {
		this.entityGroup = entityGroup;
	}

	spawn(entity: Entity): Entity {
		if (this.entities.has(entity.id)) {
			console.warn(`[EntityManager] Entity "${entity.id}" already exists.`);
			return entity;
		}

		entity.init();

		if (entity.mesh) {
			this.entityGroup.add(entity.mesh);
		}

		this.entities.set(entity.id, entity);
		events.emit('entity:spawned', entity);
		return entity;
	}

	remove(id: string): void {
		const entity = this.entities.get(id);
		if (!entity) return;

		if (entity.mesh) {
			this.entityGroup.remove(entity.mesh);
		}

		entity.dispose();
		this.entities.delete(id);
		events.emit('entity:removed', id);
	}

	get(id: string): Entity | undefined {
		return this.entities.get(id);
	}

	getAll(): Entity[] {
		return Array.from(this.entities.values());
	}

	update(delta: number): void {
		for (const entity of this.entities.values()) {
			if (entity.active) {
				entity.update(delta);
			}
		}
	}

	clear(): void {
		for (const [id] of this.entities) {
			this.remove(id);
		}
	}

	count(): number {
		return this.entities.size;
	}

	getEntityAtCell(cellIndex: number): Entity | null {
		for (const entity of this.entities.values()) {
			if (entity.cellIndex === cellIndex) return entity;
		}
		return null;
	}
}
