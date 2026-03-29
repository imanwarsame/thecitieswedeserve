import type { SimulationConfig } from '../config/types.ts';
import { DEFAULT_CONFIG } from '../config/defaults.ts';
import { Clock } from './Clock.ts';
import type { ClockState } from './Clock.ts';
import { LayerRegistry } from '../layers/Layer.ts';
import { EnergyLayer } from '../layers/EnergyLayer.ts';
import { CityLayer } from '../layers/CityLayer.ts';
import { TransportLayer } from '../layers/TransportLayer.ts';
import { WaterLayer } from '../layers/WaterLayer.ts';
import type { Entity } from '../entities/types.ts';
import type { TransportModule } from '../transport/TransportModule.ts';
import type {
	EnergyMetrics,
	EconomicMetrics,
	CityMetrics,
	EnergyLayerOutput,
	TransportMetrics,
	WaterMetrics,
} from '../metrics/types.ts';
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

const NULL_CITY: CityMetrics = {
	gdp: 0,
	landValue: 0,
	taxRevenue: 0,
	healthIndex: 0.7,
	crimeIndex: 0.3,
	tourismIndex: 0.4,
};

const NULL_TRANSPORT: TransportMetrics = {
	totalPassengersPerHour: 0,
	averageCommuteMins: 0,
	congestionIndex: 0,
	evAdoptionRate: 0,
	modalSplit: {},
};

const NULL_WATER: WaterMetrics = {
	totalDemandLitres: 0,
	totalSupplyLitres: 0,
	waterQualityIndex: 0,
	wastewaterTreatedPct: 0,
};

// ── Simulation Engine ───────────────────────────────────────

export class SimulationEngine {
	private readonly config: SimulationConfig;
	private readonly clock: Clock;
	private readonly registry: LayerRegistry;
	private readonly transportLayer: TransportLayer;

	private entities: Entity[];
	private currentEnergy: EnergyMetrics;
	private currentEconomics: EconomicMetrics;
	private currentCity: CityMetrics;
	private currentTransport: TransportMetrics;
	private currentWater: WaterMetrics;
	private history: StepRecord[];

	constructor(
		config: Partial<SimulationConfig> = {},
		entities: Entity[] = []
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.clock = new Clock(this.config);

		// Register layers in execution order — downstream layers
		// can read upstream outputs via the LayerOutputMap.
		this.registry = new LayerRegistry();
		this.registry.register('energy', new EnergyLayer());
		this.registry.register('city', new CityLayer());
		this.transportLayer = new TransportLayer();
		this.registry.register('transport', this.transportLayer);
		this.registry.register('water', new WaterLayer());

		this.entities = [...entities];
		this.currentEnergy = NULL_ENERGY;
		this.currentEconomics = NULL_ECONOMICS;
		this.currentCity = NULL_CITY;
		this.currentTransport = NULL_TRANSPORT;
		this.currentWater = NULL_WATER;
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

	/** Inject the transport module so the transport layer can produce real metrics. */
	setTransportModule(module: TransportModule): void {
		this.transportLayer.setModule(module);
	}

	/**
	 * Recompute metrics for the current clock state WITHOUT advancing.
	 * Use after adding / removing entities to get an immediate snapshot.
	 */
	recompute(): SimulationState {
		const clockState = this.clock.toState();
		this.runLayers(clockState);
		return this.buildState(clockState);
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
		this.currentCity = NULL_CITY;
		this.currentTransport = NULL_TRANSPORT;
		this.currentWater = NULL_WATER;
		this.history = [];
	}

	// ── Internal ────────────────────────────────────────────

	private stepInternal(): void {
		this.clock.advance();

		const clockState = this.clock.toState();
		this.runLayers(clockState);

		const record: StepRecord = {
			tick: clockState.tick,
			hour: clockState.hour,
			day: clockState.day,
			year: clockState.year,
			energy: this.currentEnergy,
			economics: this.currentEconomics,
			city: this.currentCity,
			transport: this.currentTransport,
			water: this.currentWater,
		};

		this.history.push(record);
		this.history = trimHistory(this.history, this.config.maxHistoryLength);
	}

	/** Run all registered layers and update current metric state. */
	private runLayers(clockState: ClockState): void {
		const outputs = this.registry.computeAll(this.entities, clockState, this.config);

		const energyOutput = outputs['energy'] as EnergyLayerOutput;
		this.currentEnergy = energyOutput.energy;
		this.currentEconomics = energyOutput.economics;
		this.currentCity = outputs['city'] as CityMetrics;
		this.currentTransport = outputs['transport'] as TransportMetrics;
		this.currentWater = outputs['water'] as WaterMetrics;
	}

	private buildState(clockState: ClockState): SimulationState {
		return {
			clock: { ...clockState },
			energy: { ...this.currentEnergy },
			economics: { ...this.currentEconomics },
			city: { ...this.currentCity },
			transport: { ...this.currentTransport },
			water: { ...this.currentWater },
			entities: [...this.entities],
			history: [...this.history]
		};
	}
}
