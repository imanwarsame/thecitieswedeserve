# WFC Advanced Improvements — Energy Simulation & Algorithmic Depth

> Builds on the gap analysis doc. Assumes the following are already shipped:
> seeded PRNG, SolveResult diagnostics, horizontal propagation, morph-tile constraints,
> EnergyProperties on tiles, BuildingAnalyzer with envelope/metrics, edge bearings,
> separate vertical/horizontal socket tables.

This document covers the next tier: turning the WFC from a shape generator into an energy-aware design engine.

---

## Part I — Solver Architecture Upgrades

### 13. Entropy-Based Collapse Ordering

**Current state:** The solver iterates candidates in insertion order (Map iteration) and collapses all at once in Phase 3. Every cell is treated equally regardless of how constrained it is.

**The problem:** This misses the core insight of WFC — you should collapse the *most constrained* cell first (minimum remaining values / minimum entropy). Collapsing a cell with 2 candidates is a safe bet. Collapsing one with 8 candidates early creates cascading contradictions.

**What to implement:**

```typescript
interface CellEntropy {
  key: string;
  entropy: number;  // Shannon entropy or just candidate count
}

// In Phase 3, replace flat iteration with:
while (uncollapsed.size > 0) {
  // Pick the cell with the lowest entropy (fewest candidates)
  const target = pickMinEntropy(uncollapsed, candidates);

  // Collapse it
  const tile = this.weightedPick(candidates.get(target)!);
  candidates.set(target, [tile]);

  // Propagate constraints from this collapse outward
  this.propagateFrom(target, candidates, worklist);

  uncollapsed.delete(target);
}
```

Shannon entropy gives better results than raw count because it accounts for weight distribution: a cell with two tiles at 50/50 is more uncertain than one with two tiles at 99/1.

```typescript
function shannonEntropy(tiles: TileDef[]): number {
  const totalWeight = tiles.reduce((s, t) => s + t.weight, 0);
  let entropy = 0;
  for (const t of tiles) {
    const p = t.weight / totalWeight;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}
```

**Energy relevance:** Better collapse ordering means fewer contradictions and fallbacks, which means fewer physically impossible tile arrangements leaking into the energy model.

---

### 14. Backtracking on Contradiction

**Current state:** When all candidates are eliminated, the solver falls back to `tiles[0]` or `'air'`. It never backtracks.

**The problem:** Fallbacks silently corrupt the building. A roof tile placed where a wall should be changes the envelope calculation. For energy, this isn't just a visual glitch — it's a wrong U-value on a face that might represent 20% of the heat loss.

**What to implement:**

A lightweight backtracking strategy that doesn't require full state snapshots:

```typescript
interface SolveState {
  candidates: Map<string, TileDef[]>;
  collapseStack: { key: string; tile: TileDef; snapshot: TileDef[] }[];
}

private solveWithBacktracking(candidates: Map<string, TileDef[]>): SolveResult {
  const stack: SolveState['collapseStack'] = [];
  let backtracks = 0;
  const MAX_BACKTRACKS = 100;

  while (hasUncollapsed(candidates)) {
    const target = pickMinEntropy(candidates);
    const available = candidates.get(target)!;

    if (available.length === 0) {
      // Contradiction — backtrack
      if (stack.length === 0 || backtracks >= MAX_BACKTRACKS) {
        // Unrecoverable — fall back gracefully
        break;
      }
      backtracks++;
      const prev = stack.pop()!;
      // Restore candidates, but remove the tile that led to contradiction
      candidates = restoreSnapshot(prev);
      const remaining = candidates.get(prev.key)!.filter(t => t.id !== prev.tile.id);
      candidates.set(prev.key, remaining);
      continue;
    }

    // Save state before collapsing
    stack.push({
      key: target,
      tile: available[0],
      snapshot: snapshotCandidates(candidates),
    });

    // Collapse + propagate
    const tile = this.weightedPick(available);
    candidates.set(target, [tile]);
    this.propagateFrom(target, candidates);
  }
}
```

Full state snapshots are expensive. A cheaper approach: only snapshot the candidate sets of cells within propagation radius of the collapse point (typically 2-3 hops), since those are the only ones that change.

---

### 15. Incremental / Delta Solving

**Current state:** Every `placeBlock` or `removeBlock` re-solves all affected cells from scratch. For a 200-cell building, placing one block re-evaluates the entire affected region.

**The problem:** This is fine for small buildings but scales poorly. More importantly, it means every edit can arbitrarily change tiles in distant cells (due to re-randomization), which makes the building feel unstable and makes energy comparisons between edits meaningless.

**What to implement:**

A "dirty region" approach:

```typescript
class IncrementalSolver {
  // Cache of last-solved tile assignments
  private cache = new Map<string, TileDef>();

  solve(dirtyKeys: Set<string>, candidates: Map<string, TileDef[]>): SolveResult {
    // Only re-collapse cells in the dirty set
    // Keep all cached assignments for clean cells
    for (const [key, tiles] of candidates) {
      if (!dirtyKeys.has(key) && this.cache.has(key)) {
        // Check if cached tile is still valid in current candidate set
        const cached = this.cache.get(key)!;
        if (tiles.some(t => t.id === cached.id)) {
          candidates.set(key, [cached]);  // Lock it
          continue;
        }
      }
      // Dirty or cache-invalid — needs re-collapse
    }
    // ...proceed with entropy-based collapse on remaining cells
  }
}
```

**Energy relevance:** Incremental solving means that adding a window to the 3rd floor doesn't randomly change the ground floor's tile assignments. Energy deltas between edits become meaningful: "adding this window increased glazing ratio by 4% and heat loss by 12 W/K."

---

### 16. Multi-Scale WFC (Coarse-to-Fine)

**Current state:** One pass, one resolution — every voxel is treated at the same granularity.

**What this enables:** Solve the *massing* first (building footprint, height, basic form) at a coarse level, then refine each region at voxel level within those constraints.

```
Scale 1 (district):  Each "super-cell" = 4×4 ground cells, 2-layer chunks
                      Tiles: "residential-block", "commercial-podium", "tower", "courtyard"
                      Constraints: density targets, setback rules, height limits

Scale 2 (building):  Each cell = 1 Voronoi cell, 1 layer
                      Tiles: your current tile set
                      Constraints: inherited from Scale 1 + socket rules

Scale 3 (detail):    Sub-cell features (window type, balcony depth, material variant)
                      Would need a sub-grid or parametric system per face
```

**Energy relevance:** At Scale 1, you can enforce district-level energy targets (e.g., "this block must achieve < 50 kWh/m²/yr"). The WFC then only explores massing options that are feasible within that energy budget. At Scale 2, you optimize the envelope within the locked massing. This is how real urban energy planning works — top-down constraints, bottom-up detail.

---

## Part II — Energy Simulation Depth

### 17. Thermal Zone Inference

**Current state:** BuildingAnalyzer treats every voxel uniformly. A corner office and an interior corridor get the same energy treatment.

**What to implement:**

After building grouping, classify each voxel into thermal zones:

```typescript
type ThermalZoneType =
  | 'perimeter'       // at least one exterior face
  | 'core'            // no exterior faces, surrounded by other voxels
  | 'top-exposed'     // roof exposure (highest heat loss in winter, gain in summer)
  | 'ground-contact'  // slab-on-grade (steady temperature sink)
  | 'semi-outdoor'    // balcony, arch — not fully conditioned
  | 'service'         // stairwell, pillar — unconditioned
  | 'atrium';         // courtyard-wall enclosed volume

interface ThermalZone {
  type: ThermalZoneType;
  voxelKeys: Set<string>;
  exteriorArea: number;
  volume: number;
  avgUValue: number;
  internalGains: number;      // W/m² — occupancy, lighting, equipment
  ventilationRate: number;    // L/s/m² or ACH
  setpointHeating: number;    // °C
  setpointCooling: number;    // °C
}
```

Zone classification rules:
- **Perimeter:** any voxel with ≥1 exterior side face. These have the highest heating/cooling load.
- **Core:** fully interior. Dominated by internal gains; often needs cooling year-round.
- **Top-exposed:** top layer with exterior top face. Roof solar gain dominates in summer.
- **Ground-contact:** layer 0. Ground temperature is ~10-15°C year-round, so heat loss is moderated.
- **Semi-outdoor:** tiles with `materialClass: 'open'` or `'mixed'` (balcony, arch). Not conditioned.
- **Service:** pillar tiles, stairwell-like narrow columns. Unconditioned buffer zones.
- **Atrium:** interior voxels surrounded by `courtyard-wall` morph shapes. Partially conditioned.

**Why it matters:** A 10-story building with 60% glazing on the south facade has a completely different energy profile than the same building with 60% glazing on the north. Thermal zoning lets you capture this.

---

### 18. Steady-State Heat Loss Model (Degree-Day Method)

**Current state:** You have U-values and envelope areas but no actual energy calculation.

**What to implement:**

The simplest useful energy model — heating/cooling degree-days:

```typescript
interface ClimateData {
  heatingDegreeDays: number;  // HDD base 18°C, annual (e.g., Amsterdam ≈ 2800)
  coolingDegreeDays: number;  // CDD base 24°C, annual (e.g., Amsterdam ≈ 100)
  solarIrradiance: Record<string, number>;  // kWh/m²/yr per cardinal direction
}

interface AnnualEnergyEstimate {
  heatingDemand: number;    // kWh/yr
  coolingDemand: number;    // kWh/yr
  eui: number;              // kWh/m²/yr (Energy Use Intensity)
  heatingPeak: number;      // W (design day peak load)
  carbonOperational: number; // kgCO₂e/yr
}

function estimateAnnualEnergy(
  building: Building,
  climate: ClimateData,
): AnnualEnergyEstimate {
  // Transmission heat loss coefficient (W/K)
  const HT = building.envelope
    .filter(f => f.exposure === 'exterior')
    .reduce((sum, f) => sum + f.energy.uValue * f.area, 0);

  // Ventilation heat loss (assuming 0.5 ACH natural + mechanical)
  const ACH = 0.5;
  const airDensity = 1.2;       // kg/m³
  const airCp = 1005;           // J/(kg·K)
  const HV = ACH * building.metrics.conditionedVolume * airDensity * airCp / 3600;

  // Total heat loss coefficient
  const Htotal = HT + HV;  // W/K

  // Annual heating demand (kWh)
  const heatingDemand = Htotal * climate.heatingDegreeDays * 24 / 1000;

  // Solar gains offset (reduce heating demand)
  const solarGain = building.envelope
    .filter(f => f.exposure === 'exterior' && f.energy.shgc)
    .reduce((sum, f) => {
      const irr = climate.solarIrradiance[f.direction] ?? 0;
      return sum + f.area * (f.energy.shgc ?? 0) * irr;
    }, 0);

  // Internal gains (lighting + occupancy + equipment ≈ 20 W/m² × occupied hours)
  const internalGains = building.metrics.grossFloorArea * 20 * 2500 / 1000; // kWh/yr

  // Net heating = max(0, transmission losses - solar gains - internal gains)
  const netHeating = Math.max(0, heatingDemand - solarGain * 0.8 - internalGains * 0.7);

  // Cooling demand (simplified)
  const coolingDemand = Htotal * climate.coolingDegreeDays * 24 / 1000
    + solarGain * 0.5 + internalGains * 0.3;

  const eui = (netHeating + coolingDemand) / building.metrics.grossFloorArea;

  return {
    heatingDemand: netHeating,
    coolingDemand,
    eui,
    heatingPeak: Htotal * 30,  // design delta-T of 30K
    carbonOperational: (netHeating * 0.2 + coolingDemand * 0.5) * 0.4, // grid emission factor
  };
}
```

This is a simplified model but it's the same foundation used by PHPP (Passive House Planning Package) and is accurate to within ~20% for well-insulated buildings. The key inputs you already have: envelope areas, U-values, SHGC, orientations.

---

### 19. Solar Radiation per Face

**Current state:** Edge bearings exist but aren't used for solar calculation.

**What to implement:**

A direction-dependent solar irradiance model:

```typescript
// Annual solar irradiance by orientation (kWh/m²/yr)
// Example: Northern Europe (52°N latitude)
const SOLAR_IRRADIANCE_52N: Record<string, number> = {
  'S':  980,   // South-facing vertical surface
  'SE': 780,
  'SW': 780,
  'E':  590,
  'W':  590,
  'NE': 380,
  'NW': 380,
  'N':  290,
  'up': 1050,  // Horizontal (roof)
};

function computeSolarGain(face: EnvelopeFace, latitude: number): number {
  if (face.exposure !== 'exterior') return 0;
  if (!face.energy.shgc) return 0;

  // Use bearing for more precise interpolation than 8-cardinal
  const irradiance = interpolateSolarByBearing(face.bearing, latitude);

  // Shading factor — could be enhanced with inter-building obstruction
  const shadingFactor = 0.85;  // 15% frame/overhang reduction

  return face.area * face.energy.shgc * irradiance * shadingFactor;
}
```

For more accuracy, compute a shading mask per face by ray-casting against neighboring buildings in the voxel grid. A voxel 3 stories tall to the south of a glazed face blocks low-angle winter sun but not high-angle summer sun.

```typescript
function computeShadingFactor(
  face: EnvelopeFace,
  allBuildings: Building[],
  voxelGrid: VoxelGrid,
  grid: OrganicGrid,
): number {
  // Cast rays from face center at solar altitude angles
  // Check if any voxel in neighboring columns blocks the ray
  // Return fraction of unobstructed sky dome visible from this face

  const faceCenterX = /* midpoint of edge */;
  const faceCenterY = face.layer * HousingConfig.layerHeight + HousingConfig.layerHeight / 2;

  let unobstructed = 0;
  let total = 0;

  // Sample solar positions across the year
  for (const altitude of [15, 30, 45, 60, 75]) {
    for (const azimuthOffset of [-60, -30, 0, 30, 60]) {
      total++;
      const azimuth = face.bearing + azimuthOffset;
      const blocked = rayHitsVoxel(faceCenterX, faceCenterY, altitude, azimuth, voxelGrid);
      if (!blocked) unobstructed++;
    }
  }

  return unobstructed / total;
}
```

---

### 20. Daylight Autonomy Estimation

**Current state:** Windows exist as tile properties but there's no spatial understanding of how deep daylight penetrates.

**What to implement:**

A rule-of-thumb daylight model that's surprisingly accurate for early design:

```typescript
interface DaylightMetrics {
  /** % of floor area with sufficient daylight (>300 lux for >50% of occupied hours). */
  spatialDaylightAutonomy: number;
  /** Average daylight factor across the floor plate. */
  avgDaylightFactor: number;
  /** Depth from window where daylight drops below useful threshold. */
  usefulDaylightDepth: number;
}

function estimateDaylight(
  voxel: { cellIndex: number; layer: number },
  building: Building,
  grid: OrganicGrid,
): DaylightMetrics {
  const cell = grid.cells[voxel.cellIndex];
  const cellDiameter = Math.sqrt(cellArea(cell)) * 1.13;  // approx diameter

  // Find glazed faces for this voxel
  const glazedFaces = building.envelope.filter(f =>
    f.cellIndex === voxel.cellIndex &&
    f.layer === voxel.layer &&
    f.energy.materialClass === 'glazed' &&
    f.exposure === 'exterior'
  );

  if (glazedFaces.length === 0) {
    return { spatialDaylightAutonomy: 0, avgDaylightFactor: 0, usefulDaylightDepth: 0 };
  }

  // Rule of thumb: useful daylight penetrates 2.5× the window head height
  const windowHeadHeight = HousingConfig.layerHeight * 0.85;  // typical
  const daylightDepth = windowHeadHeight * 2.5;

  // Glazing ratio for this voxel's exterior perimeter
  const totalExteriorPerimeter = building.envelope
    .filter(f => f.cellIndex === voxel.cellIndex && f.layer === voxel.layer && f.exposure === 'exterior')
    .filter(f => f.direction !== 'up' && f.direction !== 'down');
  const glazedPerimeter = glazedFaces.reduce((s, f) => s + f.area, 0);
  const totalPerimeter = totalExteriorPerimeter.reduce((s, f) => s + f.area, 0);
  const glazingRatioLocal = totalPerimeter > 0 ? glazedPerimeter / totalPerimeter : 0;

  // Daylight factor ≈ glazing ratio × transmittance × sky angle factor
  const transmittance = 0.7;  // typical double glazing visible transmittance
  const avgDaylightFactor = glazingRatioLocal * transmittance * 0.45 * 100;  // as percentage

  // sDA approximation: what fraction of the cell is within daylight depth from a window?
  const daylitFraction = Math.min(1, (daylightDepth * 2) / cellDiameter);  // bilateral windows
  const spatialDaylightAutonomy = daylitFraction * Math.min(1, avgDaylightFactor / 2);

  return {
    spatialDaylightAutonomy: spatialDaylightAutonomy * 100,
    avgDaylightFactor,
    usefulDaylightDepth: daylightDepth,
  };
}
```

**Why it matters:** In many codes (LEED, BREEAM, EN 17037), at least 50% of regularly occupied floor area needs a daylight factor > 2%. The WFC can use this as a constraint: if a building's core is too deep (> 7m from any window), it should prefer `wall-windowed` tiles on more faces.

---

### 21. Natural Ventilation Potential

**Current state:** No airflow modeling.

**What to implement:**

A cross-ventilation feasibility check per floor:

```typescript
interface VentilationPotential {
  crossVentilationPossible: boolean;  // openings on opposite sides
  stackVentilationHeight: number;     // floor-to-roof height for stack effect
  singleSidedDepth: number;           // max depth for single-sided ventilation
  naturallyVentilatableFraction: number;
}

function assessVentilation(
  building: Building,
  layer: number,
  grid: OrganicGrid,
): VentilationPotential {
  // Get all exterior-facing glazed/open faces on this floor
  const floorFaces = building.envelope.filter(f =>
    f.layer === layer && f.exposure === 'exterior' &&
    f.direction !== 'up' && f.direction !== 'down' &&
    (f.energy.materialClass === 'glazed' || f.energy.materialClass === 'open')
  );

  // Check for opposing openings (bearings ~180° apart)
  let crossVent = false;
  for (let i = 0; i < floorFaces.length; i++) {
    for (let j = i + 1; j < floorFaces.length; j++) {
      const delta = Math.abs(floorFaces[i].bearing - floorFaces[j].bearing);
      const opp = Math.min(delta, 360 - delta);
      if (opp > 120 && opp < 240) {
        crossVent = true;
        break;
      }
    }
    if (crossVent) break;
  }

  // Stack ventilation: height from this floor to building top
  const buildingTop = Math.max(...[...building.voxelKeys].map(k => parseInt(k.split(':')[1])));
  const stackHeight = (buildingTop - layer + 1) * HousingConfig.layerHeight;

  // Single-sided ventilation: effective depth ≈ 2.5× floor-to-ceiling
  const singleSidedDepth = HousingConfig.layerHeight * 2.5;

  // Cross-ventilation: effective depth ≈ 5× floor-to-ceiling
  const crossVentDepth = crossVent ? HousingConfig.layerHeight * 5 : singleSidedDepth;

  return {
    crossVentilationPossible: crossVent,
    stackVentilationHeight: stackHeight,
    singleSidedDepth,
    naturallyVentilatableFraction: Math.min(1, crossVentDepth / 15),  // assume 15m max floor depth
  };
}
```

**Why it matters:** Buildings that can use natural ventilation instead of mechanical HVAC save 30-60% on cooling energy. If the WFC knows this, it can bias toward floor plates with cross-ventilation potential (not too deep, openings on opposing faces).

---

## Part III — Optimization & Urban Scale

### 22. Climate-Responsive Tile Weight Adaptation

**Current state:** Tile weights are static constants.

**What to implement:**

Adjust WFC tile weights dynamically based on the building's climate zone and orientation:

```typescript
interface ClimateProfile {
  zone: 'cold' | 'temperate' | 'hot-dry' | 'hot-humid' | 'tropical';
  dominantWindBearing: number;
  latitude: number;
}

function adaptTileWeights(
  tiles: TileDef[],
  climate: ClimateProfile,
  faceBearing: number,
): TileDef[] {
  return tiles.map(tile => {
    let w = tile.weight;

    // In cold climates, penalize glazed tiles on north faces
    if (climate.zone === 'cold' && tile.energy.materialClass === 'glazed') {
      const bearingToNorth = Math.abs(faceBearing - 0);
      if (bearingToNorth < 60 || bearingToNorth > 300) {
        w *= 0.3;  // strongly prefer opaque on north in cold climates
      }
    }

    // In hot climates, penalize glazed tiles on west faces (afternoon sun)
    if ((climate.zone === 'hot-dry' || climate.zone === 'hot-humid') &&
        tile.energy.materialClass === 'glazed') {
      const bearingToWest = Math.abs(faceBearing - 270);
      if (bearingToWest < 45) {
        w *= 0.4;
      }
    }

    // Prefer balconies/overhangs on south faces in temperate climates (shading)
    if (climate.zone === 'temperate' && tile.id === 'balcony') {
      const bearingToSouth = Math.abs(faceBearing - 180);
      if (bearingToSouth < 60) {
        w *= 2.5;
      }
    }

    return { ...tile, weight: Math.max(0.1, w) };
  });
}
```

This is where WFC stops being just a shape generator and starts being a *design* tool. The same player click produces different facades depending on whether the building is in Oslo or Dubai.

---

### 23. Envelope Optimization Loop

**Current state:** The WFC picks tiles randomly (weighted) and the energy model reports what happened. There's no feedback loop.

**What to implement:**

An optimization layer that explores multiple WFC solutions and picks the best one:

```typescript
interface OptimizationTarget {
  maxEUI: number;              // kWh/m²/yr — must not exceed
  targetGlazingRatio: number;  // e.g., 0.35
  maxEmbodiedCarbon: number;   // kgCO₂e/m²
  minDaylightAutonomy: number; // % — e.g., 55%
}

function optimizeEnvelope(
  solver: WFCSolver,
  analyzer: BuildingAnalyzer,
  affectedCells: Set<number>,
  climate: ClimateData,
  targets: OptimizationTarget,
  iterations: number = 50,
): { bestResult: SolveResult; bestBuildings: Building[]; bestScore: number } {
  let bestScore = -Infinity;
  let bestResult: SolveResult | null = null;
  let bestBuildings: Building[] = [];

  for (let i = 0; i < iterations; i++) {
    // Create solver with different seed per iteration
    const iterSolver = new WFCSolver(registry, voxelGrid, grid, baseSeed + i);
    const result = iterSolver.solve(affectedCells, morphHints);
    const buildings = analyzer.analyze(result);

    // Score this solution
    let score = 0;
    for (const b of buildings) {
      const energy = estimateAnnualEnergy(b, climate);

      // Penalty for exceeding EUI target
      score -= Math.max(0, energy.eui - targets.maxEUI) * 10;

      // Reward for hitting glazing target (within ±5%)
      score -= Math.abs(b.metrics.glazingRatio - targets.targetGlazingRatio) * 50;

      // Penalty for excessive embodied carbon
      const embodiedPerM2 = b.metrics.totalEmbodiedCarbon / b.metrics.grossFloorArea;
      score -= Math.max(0, embodiedPerM2 - targets.maxEmbodiedCarbon) * 5;

      // Bonus for convergence (no contradictions)
      score += result.converged ? 10 : -20;
      score -= result.fallbackCount * 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
      bestBuildings = buildings;
    }
  }

  return { bestResult: bestResult!, bestBuildings, bestScore };
}
```

50 iterations with different seeds is cheap (< 100ms for a moderate building) and gives you Pareto-like exploration of the design space.

For a more sophisticated approach, use **CMA-ES** (Covariance Matrix Adaptation Evolution Strategy) to optimize continuous tile weights rather than brute-force seeds. The weights become the optimization variables, and the energy score becomes the fitness function.

---

### 24. Inter-Building Shading & Urban Heat Island

**Current state:** Each building is analyzed in isolation.

**What to implement:**

When you have multiple buildings on the grid, their energy performance is coupled:

```typescript
interface UrbanContext {
  /** Shading obstruction angle from neighboring buildings, per face. */
  obstructionAngles: Map<string, number>;  // face key → degrees above horizon
  /** Sky view factor: fraction of sky dome visible (1 = open field, 0 = deep canyon). */
  skyViewFactor: number;
  /** Long-wave radiation exchange between building surfaces. */
  meanRadiantTemperature: number;
}

function computeUrbanContext(
  building: Building,
  allBuildings: Building[],
  voxelGrid: VoxelGrid,
  grid: OrganicGrid,
): UrbanContext {
  const obstructionAngles = new Map<string, number>();

  for (const face of building.envelope.filter(f => f.exposure === 'exterior')) {
    const faceHeight = face.layer * HousingConfig.layerHeight + HousingConfig.layerHeight / 2;

    // Look outward from this face and find the tallest obstruction
    let maxAngle = 0;
    for (const other of allBuildings) {
      if (other.id === building.id) continue;
      // Find the nearest voxel in `other` that's roughly in the direction this face looks
      // Compute the obstruction angle = atan(heightDiff / distance)
      // ...simplified: check columns in the bearing direction
    }

    obstructionAngles.set(`${face.cellIndex}:${face.layer}:${face.edgeIndex}`, maxAngle);
  }

  // Sky view factor: average of (90° - obstruction) / 90° across all upward-facing angles
  // ...

  return { obstructionAngles, skyViewFactor: 0, meanRadiantTemperature: 0 };
}
```

**Why it matters:** A 5-story building gains 40% more solar energy when surrounded by 2-story houses than when surrounded by 8-story towers. Urban canyons trap heat in summer but reduce heating demand in winter. This coupling is essential for district-level energy targets.

---

### 25. Whole-Life Carbon (WLC) Assessment

**Current state:** Embodied carbon is tracked per face area. Operational carbon is not calculated.

**What to implement:**

A complete lifecycle assessment:

```typescript
interface WholeLifeCarbon {
  /** A1-A3: Product stage (materials manufacturing). */
  embodiedUpfront: number;     // kgCO₂e
  /** B4: Replacement (materials replaced during lifespan). */
  embodiedReplacement: number;
  /** B6: Operational energy use. */
  operationalCarbon: number;   // kgCO₂e over lifespan
  /** C1-C4: End of life (demolition, waste processing). */
  endOfLife: number;
  /** Total over building lifespan. */
  total: number;
  /** Per m² GFA per year. */
  intensity: number;           // kgCO₂e/m²/yr
}

function computeWLC(
  building: Building,
  energy: AnnualEnergyEstimate,
  lifespan: number = 60,       // years
  gridCarbonIntensity: number = 0.3,  // kgCO₂e/kWh (varies by country/year)
): WholeLifeCarbon {
  const embodiedUpfront = building.metrics.totalEmbodiedCarbon;

  // Replacement: windows every 30 years, facade every 40 years
  const glazedArea = building.metrics.glazingArea;
  const replacementCycles = Math.floor(lifespan / 30);
  const embodiedReplacement = glazedArea * 120 * replacementCycles;  // kgCO₂e/m² for glazing

  // Operational: assume grid decarbonizes linearly to 0.05 by end of lifespan
  let operationalCarbon = 0;
  for (let year = 0; year < lifespan; year++) {
    const yearIntensity = gridCarbonIntensity * (1 - 0.8 * year / lifespan);
    operationalCarbon += (energy.heatingDemand + energy.coolingDemand) * yearIntensity;
  }

  // End of life: ~10% of upfront embodied
  const endOfLife = embodiedUpfront * 0.1;

  const total = embodiedUpfront + embodiedReplacement + operationalCarbon + endOfLife;

  return {
    embodiedUpfront,
    embodiedReplacement,
    operationalCarbon,
    endOfLife,
    total,
    intensity: total / (building.metrics.grossFloorArea * lifespan),
  };
}
```

**Why it matters:** For well-insulated buildings, embodied carbon can be 50-80% of whole-life carbon. A concrete building with low operational energy might have higher WLC than a timber building with slightly worse insulation. The WFC tile vocabulary should eventually include material variants (timber frame vs. concrete vs. steel) that the optimizer can choose between.

---

## Part IV — WFC Solver File Completion

### 26. WFCSolver.ts Is Truncated

**Note:** The current `WFCSolver.ts` is truncated at line 119 — it cuts off mid-Phase-1 after the morph constraint filtering. Phase 2 (AC-3 propagation with both vertical and horizontal socket checks), Phase 3 (collapse), and the helper methods (`countBits`, `weightedPick`, `propagateFrom`, etc.) are missing.

Before implementing any of the above, the solver file needs to be completed with:
- Phase 2: AC-3 worklist-based propagation using both `VERTICAL_COMPAT` and `HORIZONTAL_COMPAT`
- Phase 3: Entropy-based collapse ordering (item #13 above)
- Edge bearing computation during tile assignment (to populate `TileAssignment.edgeBearings`)
- The `countBits`, `weightedPick`, and `shannonEntropy` helper methods

---

## Advanced Priority Roadmap

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Complete WFCSolver.ts (#26) | Medium | Nothing works without a complete solver |
| **P0** | Steady-state energy model (#18) | Medium | The first real energy number: kWh/m²/yr |
| **P1** | Entropy-based collapse (#13) | Medium | Fewer contradictions, better buildings |
| **P1** | Thermal zone inference (#17) | Medium | Perimeter vs. core changes energy calc by 30%+ |
| **P1** | Solar radiation per face (#19) | Small | Needed for accurate heating/cooling balance |
| **P1** | Backtracking (#14) | Large | Eliminates silent fallback corruption |
| **P2** | Daylight autonomy (#20) | Small | Code compliance check (LEED/BREEAM) |
| **P2** | Natural ventilation (#21) | Small | 30-60% cooling savings where applicable |
| **P2** | Climate-responsive weights (#22) | Medium | WFC becomes climate-aware |
| **P2** | Incremental solving (#15) | Medium | UX: edits feel stable, energy deltas are meaningful |
| **P2** | Whole-life carbon (#25) | Small | Full lifecycle picture |
| **P3** | Envelope optimization loop (#23) | Medium | Automated design exploration |
| **P3** | Multi-scale WFC (#16) | Large | District-level planning |
| **P3** | Inter-building shading (#24) | Large | Urban-scale energy coupling |
