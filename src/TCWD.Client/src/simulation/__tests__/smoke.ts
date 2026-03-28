/**
 * Smoke test — validates the simulation engine end-to-end.
 *
 * Run with:  npx tsx src/simulation/__tests__/smoke.ts
 */

import {
	SimulationEngine,
	FuelType,
	createDataCentre,
	createHousing,
	createEnergyPlant,
	createTransport
} from '../index.ts';

declare const process: { exitCode: number };

// ── Setup ───────────────────────────────────────────────────

const entities = [
	createHousing({ id: 'h1', name: 'Residential North', units: 2_000 }),
	createHousing({ id: 'h2', name: 'Residential South', units: 1_500 }),
	createDataCentre({ id: 'dc1', name: 'CloudCore DC', rackCount: 400, itLoadMW: 8 }),
	createEnergyPlant(FuelType.Solar, { id: 'solar1', name: 'Solar Farm Alpha', capacityMW: 120 }),
	createEnergyPlant(FuelType.Gas, { id: 'gas1', name: 'Gas Peaker', capacityMW: 150 }),
	createTransport({ id: 'tr1', name: 'Metro Hub', peakDemandMW: 12 })
];

const engine = new SimulationEngine({}, entities);

// ── Helpers ─────────────────────────────────────────────────

function pad(s: string | number, n: number): string {
	return String(s).padStart(n, ' ');
}

function fmt(n: number, decimals: number = 2): string {
	return n.toFixed(decimals);
}

// ── Day simulation (24 steps) ───────────────────────────────

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  DIGITAL TWIN SIMULATOR — ENERGY LAYER SMOKE TEST');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('── 24-Hour Cycle ──────────────────────────────────────────────────────────');
console.log(
	`${pad('Hour', 5)} | ${pad('Demand', 10)} | ${pad('Supply', 10)} | ` +
	`${pad('Stability', 10)} | ${pad('Renew%', 8)} | ${pad('CO₂/MWh', 9)} | ${pad('Cost', 12)} | ${pad('Tax/hr', 12)}`
);
console.log('-'.repeat(95));

const hourlyDemands: number[] = [];

for (let i = 0; i < 24; i++) {
	const state = engine.step();
	const e = state.energy;
	const ec = state.economics;
	hourlyDemands.push(e.totalDemandMWh);

	console.log(
		`${pad(state.clock.hour, 5)} | ` +
		`${pad(fmt(e.totalDemandMWh), 10)} | ` +
		`${pad(fmt(e.totalSupplyMWh), 10)} | ` +
		`${pad(fmt(e.gridStability, 3), 10)} | ` +
		`${pad(fmt(e.renewableFraction * 100, 1), 8)} | ` +
		`${pad(fmt(e.carbonIntensityPerMWh, 4), 9)} | ` +
		`${pad(fmt(e.operatingCost), 12)} | ` +
		`${pad(fmt(ec.taxRevenue), 12)}`
	);
}

// ── Daily assertions ────────────────────────────────────────

console.log('');
console.log('── Invariant Checks (24h) ─────────────────────────────────────────────────');

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`  ✗ FAIL: ${message}`);
		process.exitCode = 1;
	} else {
		console.log(`  ✓ PASS: ${message}`);
	}
}

const dayState = engine.getState();
const lastEnergy = dayState.energy;

assert(lastEnergy.totalDemandMWh > 0, 'Demand > 0');
assert(lastEnergy.totalSupplyMWh > 0, 'Supply > 0');
assert(lastEnergy.renewableFraction >= 0 && lastEnergy.renewableFraction <= 1, 'Renewable fraction ∈ [0,1]');
assert(lastEnergy.gridStability > 0, 'Grid stability > 0');
assert(lastEnergy.carbonIntensityPerMWh >= 0, 'Carbon intensity ≥ 0');
assert(lastEnergy.operatingCost >= 0, 'Operating cost ≥ 0');

// Diurnal pattern: demand at hour 3 (index 2) < demand at hour 18 (index 17)
assert(hourlyDemands[2]! < hourlyDemands[17]!, 'Demand at 3am < demand at 6pm (diurnal pattern)');

// Solar patterns — check history
const history = dayState.history;
const midnight = history.find((r) => r.hour === 0);
const noon = history.find((r) => r.hour === 12);

if (midnight && noon) {
	const solarAtMidnight = midnight.energy.supplyBreakdown['Solar'] ?? 0;
	const solarAtNoon = noon.energy.supplyBreakdown['Solar'] ?? 0;
	assert(solarAtMidnight === 0, 'Solar output at midnight = 0');
	assert(solarAtNoon > 0, 'Solar output at noon > 0');
}

// JSON round-trip
const json = JSON.stringify(dayState);
const parsed = JSON.parse(json);
assert(parsed.clock.tick === dayState.clock.tick, 'JSON round-trip preserves clock tick');
assert(parsed.energy.totalDemandMWh === dayState.energy.totalDemandMWh, 'JSON round-trip preserves demand');

// ── Year simulation (8760 steps from fresh engine) ──────────

console.log('');
console.log('── Yearly Simulation (8,760 steps) ────────────────────────────────────────');

const yearEngine = new SimulationEngine({}, entities);
yearEngine.stepN(8_760);

const yearHistory = yearEngine.getHistory();
let totalDemand = 0;
let totalSupply = 0;
let totalCarbon = 0;
let totalCost = 0;
let totalTax = 0;
let totalGDP = 0;
let totalCityGDP = 0;

for (const rec of yearHistory) {
	totalDemand += rec.energy.totalDemandMWh;
	totalSupply += rec.energy.totalSupplyMWh;
	totalCarbon += rec.energy.totalCarbonTonnes;
	totalCost += rec.energy.operatingCost;
	totalTax += rec.economics.taxRevenue;
	totalGDP += rec.economics.gdpContribution;
	totalCityGDP += rec.city.gdp;
}

console.log(`  Total demand:     ${fmt(totalDemand, 0)} MWh`);
console.log(`  Total supply:     ${fmt(totalSupply, 0)} MWh`);
console.log(`  Total CO₂:        ${fmt(totalCarbon, 0)} tonnes`);
console.log(`  Total op. cost:   ${fmt(totalCost, 0)} currency units`);
console.log(`  Total tax rev.:   ${fmt(totalTax, 0)} currency units`);
console.log(`  Total GDP:        ${fmt(totalGDP, 0)} currency units`);
console.log(`  Total city GDP:   ${fmt(totalCityGDP, 0)} currency units`);
console.log(`  Avg. grid stab.:  ${fmt(totalSupply / totalDemand, 3)}`);
console.log(`  Avg. renew. %:    ${fmt((yearHistory.reduce((s, r) => s + r.energy.renewableFraction, 0) / yearHistory.length) * 100, 1)}%`);

// City-layer assertions
const lastYear = yearEngine.getState();
assert(lastYear.city.healthIndex >= 0 && lastYear.city.healthIndex <= 1, 'Health index ∈ [0,1]');
assert(lastYear.city.crimeIndex >= 0 && lastYear.city.crimeIndex <= 1, 'Crime index ∈ [0,1]');
assert(lastYear.city.tourismIndex >= 0 && lastYear.city.tourismIndex <= 1, 'Tourism index ∈ [0,1]');
assert(lastYear.city.landValue > 0, 'Land value > 0');
assert(totalCityGDP > 0, 'Yearly city GDP > 0');

assert(totalDemand > 0, 'Yearly demand > 0');
assert(totalSupply > 0, 'Yearly supply > 0');
assert(totalCarbon >= 0, 'Yearly carbon ≥ 0');
assert(totalTax > 0, 'Yearly tax revenue > 0');

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  Smoke test complete.');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('');
