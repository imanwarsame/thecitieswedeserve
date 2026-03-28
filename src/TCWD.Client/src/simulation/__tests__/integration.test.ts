import { describe, it, expect, beforeEach } from 'vitest';
import {
	SimulationEngine,
	FuelType,
	createDataCentre,
	createHousing,
	createEnergyPlant,
} from '../index';
import { events } from '../../core/Events';

// ═══════════════════════════════════════════════════════
// 1. SUPPLY / DEMAND — single entity scenarios
// ═══════════════════════════════════════════════════════

describe('Supply / Demand correctness', () => {
	it('solar-only: supply > 0 at noon, demand = 0', () => {
		const engine = new SimulationEngine(
			{},
			[createEnergyPlant(FuelType.Solar, { capacityMW: 100 })],
		);

		// Advance to noon (tick 12 = hour 12)
		const state = engine.stepN(12);

		expect(state.energy.totalDemandMWh).toBe(0);
		expect(state.energy.totalSupplyMWh).toBeGreaterThan(0);
	});

	it('solar-only: supply = 0 at midnight', () => {
		const engine = new SimulationEngine(
			{},
			[createEnergyPlant(FuelType.Solar, { capacityMW: 100 })],
		);

		// Step 24 times to get back to midnight (hour 0 of next day)
		const state = engine.stepN(24);

		expect(state.energy.totalDemandMWh).toBe(0);
		expect(state.energy.totalSupplyMWh).toBe(0);
	});

	it('dataCentre-only: demand > 0, supply = 0', () => {
		const engine = new SimulationEngine(
			{},
			[createDataCentre({ itLoadMW: 10 })],
		);

		const state = engine.stepN(1);

		expect(state.energy.totalDemandMWh).toBeGreaterThan(0);
		expect(state.energy.totalSupplyMWh).toBe(0);
	});

	it('dataCentre + solar: supply ≠ demand at noon', () => {
		const engine = new SimulationEngine(
			{},
			[
				createDataCentre({ itLoadMW: 10 }),
				createEnergyPlant(FuelType.Solar, { capacityMW: 100 }),
			],
		);

		const state = engine.stepN(12);

		// Solar produces ~20 MWh, DC demands ~14 MWh — they shouldn't match exactly
		expect(state.energy.totalSupplyMWh).not.toBeCloseTo(
			state.energy.totalDemandMWh,
			1,
		);
	});

	it('gas plant ramps to meet demand exactly', () => {
		const engine = new SimulationEngine(
			{},
			[
				createDataCentre({ itLoadMW: 10 }),
				createEnergyPlant(FuelType.Gas, { capacityMW: 200 }),
			],
		);

		const state = engine.stepN(1);

		// Gas is dispatchable — output matches demand
		expect(state.energy.totalSupplyMWh).toBeCloseTo(
			state.energy.totalDemandMWh,
			4,
		);
	});
});

// ═══════════════════════════════════════════════════════
// 2. DYNAMIC ENTITY MANAGEMENT
// ═══════════════════════════════════════════════════════

describe('Dynamic entity add/remove', () => {
	it('adding a plant mid-simulation increases supply', () => {
		const engine = new SimulationEngine({}, [
			createDataCentre({ itLoadMW: 10 }),
		]);

		// Advance to noon
		engine.stepN(12);
		const before = engine.getState();
		expect(before.energy.totalSupplyMWh).toBe(0);

		// Add a solar plant and recompute
		engine.addEntity(createEnergyPlant(FuelType.Solar, { capacityMW: 100 }));
		const after = engine.recompute();

		expect(after.energy.totalSupplyMWh).toBeGreaterThan(0);
	});

	it('removing all consumers brings demand to 0', () => {
		const dc = createDataCentre({ id: 'dc1', itLoadMW: 10 });
		const engine = new SimulationEngine({}, [dc]);

		engine.stepN(1);
		expect(engine.getState().energy.totalDemandMWh).toBeGreaterThan(0);

		engine.removeEntity('dc1');
		const after = engine.recompute();
		expect(after.energy.totalDemandMWh).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════
// 3. EVENT SYSTEM RESILIENCE
// ═══════════════════════════════════════════════════════

describe('Event system resilience', () => {
	beforeEach(() => {
		events.clear();
	});

	it('individual off() does not affect other listeners', () => {
		const log: string[] = [];
		const listener1 = () => log.push('A');
		const listener2 = () => log.push('B');

		events.on('test:event', listener1);
		events.on('test:event', listener2);

		// Remove only listener1
		events.off('test:event', listener1);

		events.emit('test:event');
		expect(log).toEqual(['B']);
	});

	it('listeners survive when other listeners are removed by reference', () => {
		const received: number[] = [];
		const handler1 = (...args: unknown[]) => received.push(args[0] as number);
		const handler2 = (...args: unknown[]) => received.push((args[0] as number) * 10);

		events.on('tick', handler1);
		events.on('tick', handler2);

		// Remove handler1 (simulates Engine1 dispose)
		events.off('tick', handler1);

		events.emit('tick', 5);

		// handler2 should still work
		expect(received).toEqual([50]);
	});

	it('simulated StrictMode lifecycle: Engine2 listeners survive Engine1 dispose', () => {
		// Simulates the mount/unmount/mount cycle in React StrictMode.
		// Engine1 registers listeners, then disposes them.
		// Engine2 registers its own listeners.
		// Engine1's dispose should NOT affect Engine2's listeners.

		const engine1Calls: string[] = [];
		const engine2Calls: string[] = [];

		const engine1Handler = () => engine1Calls.push('tick');
		const engine2Handler = () => engine2Calls.push('tick');

		// Engine1 registers
		events.on('sim:tick', engine1Handler);

		// Engine2 registers
		events.on('sim:tick', engine2Handler);

		// Engine1 disposes its own listener (correct behavior)
		events.off('sim:tick', engine1Handler);

		// Emit event — only Engine2 should receive
		events.emit('sim:tick');

		expect(engine1Calls).toEqual([]);
		expect(engine2Calls).toEqual(['tick']);
	});
});

// ═══════════════════════════════════════════════════════
// 4. HOUSING SIMULATION ENTITY
// ═══════════════════════════════════════════════════════

describe('Housing simulation entity', () => {
	it('housing entity creates demand', () => {
		const engine = new SimulationEngine({}, [
			createHousing({ units: 1000 }),
		]);

		const state = engine.stepN(12); // noon

		expect(state.energy.totalDemandMWh).toBeGreaterThan(0);
	});

	it('housing demand varies by hour (diurnal pattern)', () => {
		const engine = new SimulationEngine({}, [
			createHousing({ units: 1000 }),
		]);

		// Collect demand at every hour
		const demands: number[] = [];
		for (let i = 0; i < 24; i++) {
			const s = engine.step();
			demands.push(s.energy.totalDemandMWh);
		}

		// Night demand should be lower than evening demand
		const nightDemand = demands[2]!; // 3am
		const eveningDemand = demands[18]!; // 7pm
		expect(nightDemand).toBeLessThan(eveningDemand);
	});
});
