import type { SimulationConfig } from '../config/types.ts';
import { DEFAULT_CONFIG } from '../config/defaults.ts';
import { Clock } from './Clock.ts';
import type { ClockState } from './Clock.ts';
import { EnergyLayer } from '../layers/EnergyLayer.ts';
import type { Entity } from '../entities/types.ts';
import type { EnergyMetrics, EconomicMetrics } from '../metrics/types.ts';
import type { SimulationState, StepRecord } from '../state/types.ts';
import { trimHistory } from '../state/snapshot.ts';

// ── Null metrics (initial state before first step) ──────────

const NULL_ENERGY: EnergyMetrics = {
	totalDemandMWh: 0,
	totalSupplyMWh: 0,
	renewableFraction: 0,
	fossilFraction: 0,
	gridStability: 1,
	carbonIntensityPerMWh: 0,
	totalCarbonTonnes: 0,
	operatingCost: 0,
	supplyBreakdown: {},
	demandBreakdown: {}
};

const NULL_ECONOMICS: EconomicMetrics = {
	taxRevenue: 0,
	gdpContribution: 0,
	carbonTaxPaid: 0,
	energyCostBurden: 0
};

// ── Simulation Engine ───────────────────────────────────────

export class SimulationEngine {
	private readonly config: SimulationConfig;
	private readonly clock: Clock;
	private readonly energyLayer: EnergyLayer;

	private entities: Entity[];
	private currentEnergy: EnergyMetrics;
	private currentEconomics: EconomicMetrics;
	private history: StepRecord[];

	constructor(
		config: Partial<SimulationConfig> = {},
		entities: Entity[] = []
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.clock = new Clock(this.config);
		this.energyLayer = new EnergyLayer();

		this.entities = [...entities];
		this.currentEnergy = NULL_ENERGY;
		this.currentEconomics = NULL_ECONOMICS;
		this.history = [];
	}

	// ── Step execution ──────────────────────────────────────

	/** Advance the simulation by one tick and return the new state snapshot. */
	step(): SimulationState {
		this.stepInternal();
		return this.buildState(this.clock.toState());
	}

	/** Advance by N ticks, returning only the final state (skips snapshots for intermediate steps). */
	stepN(n: number): SimulationState {
		for (let i = 0; i < n; i++) {
			this.stepInternal();
		}
		return this.getState();
	}

	// ── State access ────────────────────────────────────────

	/** Return a snapshot of the current state without advancing. */
	getState(): SimulationState {
		return this.buildState(this.clock.toState());
	}

	/** Return the raw history buffer (read-only). */
	getHistory(): readonly StepRecord[] {
		return this.history;
	}

	// ── Entity management ───────────────────────────────────

	/** Add an entity (takes effect on the next step). */
	addEntity(entity: Entity): void {
		this.entities.push(entity);
	}

	/** Remove an entity by ID (takes effect on the next step). */
	removeEntity(id: string): boolean {
		const idx = this.entities.findIndex((e) => e.id === id);
		if (idx === -1) return false;
		this.entities.splice(idx, 1);
		return true;
	}

	/** Return a shallow copy of the current entity list. */
	getEntities(): Entity[] {
		return [...this.entities];
	}

	// ── Reset ───────────────────────────────────────────────

	/** Reset the simulation to its initial state. */
	reset(
		config?: Partial<SimulationConfig>,
		entities?: Entity[]
	): void {
		if (config) {
			Object.assign(this.config, { ...DEFAULT_CONFIG, ...config });
		}
		if (entities) {
			this.entities = [...entities];
		}
		this.clock.reset();
		this.currentEnergy = NULL_ENERGY;
		this.currentEconomics = NULL_ECONOMICS;
		this.history = [];
	}

	// ── Internal ────────────────────────────────────────────

	private stepInternal(): void {
		this.clock.advance();

		const clockState = this.clock.toState();
		const { energy, economics } = this.energyLayer.compute(
			this.entities,
			clockState,
			this.config
		);

		this.currentEnergy = energy;
		this.currentEconomics = economics;

		const record: StepRecord = {
			tick: clockState.tick,
			hour: clockState.hour,
			day: clockState.day,
			year: clockState.year,
			energy,
			economics
		};

		this.history.push(record);
		this.history = trimHistory(this.history, this.config.maxHistoryLength);
	}

	private buildState(clockState: ClockState): SimulationState {
		return {
			clock: { ...clockState },
			energy: { ...this.currentEnergy },
			economics: { ...this.currentEconomics },
			entities: [...this.entities],
			history: [...this.history]
		};
	}
}
