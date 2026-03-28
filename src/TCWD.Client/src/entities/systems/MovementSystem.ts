import type { System } from '../System';
import type { Entity } from '../Entity';

export class MovementSystem implements System {
	readonly name = 'movement';

	init(): void {
		// Placeholder
	}

	update(_delta: number, _entities: Entity[]): void {
		// Future: process entities with velocity components
	}

	dispose(): void {
		// Placeholder
	}
}
