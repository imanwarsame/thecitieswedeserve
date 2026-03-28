import type { Entity } from '../entities/types.ts';
import type { ClockState } from '../engine/Clock.ts';
import type { SimulationConfig } from '../config/types.ts';

// ── Layer interface ─────────────────────────────────────────

/**
 * A simulation layer computes a typed output from the current entity set,
 * clock state, and configuration.  Layers execute in registration order
 * so downstream layers may consume upstream results via `upstreamOutputs`.
 */
export interface Layer<TOutput> {
	compute(
		entities: readonly Entity[],
		clock: ClockState,
		config: SimulationConfig,
		upstreamOutputs: LayerOutputMap,
	): TOutput;
}

// ── Layer output map ────────────────────────────────────────

/** String-keyed map of all layer outputs produced so far in the current tick. */
export type LayerOutputMap = Readonly<Record<string, unknown>>;

// ── Layer registry ──────────────────────────────────────────

interface RegisteredLayer {
	readonly key: string;
	readonly layer: Layer<unknown>;
}

/**
 * Ordered registry of simulation layers.
 *
 * Layers are executed sequentially in registration order.  Each layer
 * receives the accumulated outputs of all layers that ran before it,
 * keyed by their registration key.
 */
export class LayerRegistry {
	private layers: RegisteredLayer[] = [];

	/** Register a layer under a unique key.  Order of registration = execution order. */
	register<T>(key: string, layer: Layer<T>): void {
		this.layers.push({ key, layer });
	}

	/**
	 * Execute all registered layers in order.
	 * Returns a map of `{ [key]: layerOutput }`.
	 */
	computeAll(
		entities: readonly Entity[],
		clock: ClockState,
		config: SimulationConfig,
	): Record<string, unknown> {
		const outputs: Record<string, unknown> = {};

		for (const { key, layer } of this.layers) {
			outputs[key] = layer.compute(entities, clock, config, outputs);
		}

		return outputs;
	}
}
