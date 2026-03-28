import type { Entity } from './Entity';

export interface Component {
	readonly type: string;
	init(entity: Entity): void;
	update(delta: number): void;
	dispose(): void;
}
