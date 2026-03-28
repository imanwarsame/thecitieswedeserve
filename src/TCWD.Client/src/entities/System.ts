import type { Entity } from './Entity';

export interface System {
	readonly name: string;
	init(): void;
	update(delta: number, entities: Entity[]): void;
	dispose(): void;
}
