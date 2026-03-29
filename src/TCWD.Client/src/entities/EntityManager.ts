import * as THREE from 'three';
import { Entity } from './Entity';
import { events } from '../core/Events';
import type { ModelFactory } from '../assets/ModelFactory';
import type { MaterialRegistry } from '../rendering/MaterialRegistry';

export class EntityManager {
	private entities = new Map<string, Entity>();
	private cellToEntity = new Map<number, Entity>();
	private meshToEntity = new Map<THREE.Object3D, Entity>();
	private entityGroup: THREE.Group;
	private materialRegistry: MaterialRegistry | null = null;

	constructor(entityGroup: THREE.Group) {
		this.entityGroup = entityGroup;
	}

	setMaterialRegistry(registry: MaterialRegistry): void {
		this.materialRegistry = registry;
	}

	spawn(entity: Entity): Entity {
		if (this.entities.has(entity.id)) {
			console.warn(`[EntityManager] Entity "${entity.id}" already exists.`);
			return entity;
		}

		entity.init();

		if (entity.mesh) {
			this.entityGroup.add(entity.mesh);
			this.meshToEntity.set(entity.mesh, entity);
		}

		this.entities.set(entity.id, entity);
		if (entity.cellIndex >= 0) {
			this.cellToEntity.set(entity.cellIndex, entity);
		}
		events.emit('entity:spawned', entity);
		return entity;
	}

	/**
	 * Register an entity whose mesh is already parented elsewhere (e.g. Forma GLB group).
	 * The mesh is NOT re-parented to the entity group, but the entity participates in
	 * all lookups (by id, cell, and mesh).
	 */
	spawnExternal(entity: Entity): Entity {
		if (this.entities.has(entity.id)) {
			console.warn(`[EntityManager] Entity "${entity.id}" already exists.`);
			return entity;
		}

		entity.init();

		if (entity.mesh) {
			this.meshToEntity.set(entity.mesh, entity);
		}

		this.entities.set(entity.id, entity);
		if (entity.cellIndex >= 0) {
			this.cellToEntity.set(entity.cellIndex, entity);
		}
		events.emit('entity:spawned', entity);
		return entity;
	}

	remove(id: string): void {
		const entity = this.entities.get(id);
		if (!entity) return;

		if (entity.mesh) {
			this.meshToEntity.delete(entity.mesh);
			if (entity.externalMesh) {
				// External mesh: remove from its current parent (Forma group)
				entity.mesh.parent?.remove(entity.mesh);
			} else {
				this.entityGroup.remove(entity.mesh);
			}
			if (this.materialRegistry) {
				this.materialRegistry.disposeModelMaterials(entity.mesh);
			}
		}

		if (entity.cellIndex >= 0) {
			this.cellToEntity.delete(entity.cellIndex);
		}
		entity.dispose();
		this.entities.delete(id);
		events.emit('entity:removed', id);
	}

	spawnFromCatalog(
		catalogId: string,
		position: THREE.Vector3,
		factory: ModelFactory,
		options?: { rotationY?: number; scale?: number; materialPreset?: string; cellIndex?: number },
	): Entity {
		const mesh = factory.create(catalogId, options);
		const entity = new Entity({
			catalogId,
			mesh,
			position,
			cellIndex: options?.cellIndex ?? -1,
		});
		entity.position.y = 0;
		return this.spawn(entity);
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

	swapMaterialsForType(catalogId: string, newPreset: string, registry: MaterialRegistry): void {
		for (const entity of this.entities.values()) {
			if (entity.catalogId === catalogId && entity.mesh) {
				registry.swapModelMaterials(entity.mesh, newPreset);
			}
		}
	}

	clear(): void {
		for (const [id] of this.entities) {
			this.remove(id);
		}
		this.meshToEntity.clear();
	}

	count(): number {
		return this.entities.size;
	}

	getEntityAtCell(cellIndex: number): Entity | null {
		return this.cellToEntity.get(cellIndex) ?? null;
	}

	/** Resolve a THREE.Object3D (entity root mesh) back to its owning Entity. */
	getEntityByMesh(mesh: THREE.Object3D): Entity | undefined {
		return this.meshToEntity.get(mesh);
	}
}
