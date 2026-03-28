# WFC Algorithm — Gap Analysis & Energy-Ready Improvements

## Current State Summary

The WFC system is a **driven WFC** (Townscaper-style) operating on a Voronoi-based voxel grid. Player corner-solidity edits feed into a three-phase solver: candidate filtering by corner ratios, vertical socket propagation, and weighted random collapse. A morph cascade (NeighborAnalyzer, StackingRules, MorphEvaluator) wraps the solver to determine building shapes.

The architecture is clean and well-factored. What follows are the gaps that will bite you — especially once you start querying these buildings for energy modeling.

---

## 1. Propagation Is Vertical Only

**The gap:** `WFCSolver.solve()` only checks socket compatibility between tiles directly above and below each other. Horizontal neighbors are completely ignored during constraint propagation. A `wall-windowed` tile can sit next to an `arch` with no socket check between them.

**Why it matters for energy:** Energy modeling cares about facade continuity. A window tile adjacent to a solid tile implies an insulated-to-glazed transition — thermal bridging. If the WFC doesn't enforce horizontal socket rules, you'll get facade compositions that are physically inconsistent and can't be mapped to realistic U-values.

**Recommended fix:**
- Add horizontal propagation using `sideSocket` (already defined on every `TileDef` but never checked).
- During Phase 2, for each candidate tile, check that its `sideSocket` is compatible with at least one candidate in each horizontal neighbor's set.
- Start with immediate neighbors only (arc-consistency), not full AC-3, to keep it fast.

---

## 2. No Concept of Interior vs. Exterior Space

**The gap:** The `StackingRules` distinguish `solid`, `wall`, `wall-windowed`, `courtyard-wall`, etc., but there is no explicit tracking of whether a voxel faces the building exterior or an interior courtyard/atrium. The `enclosed` boolean in `MorphResult` is a rough proxy (all neighbors solid), but it doesn't propagate — a cell one step removed from an opening doesn't know it's part of a connected interior volume.

**Why it matters for energy:** Energy simulation needs to know the building envelope. Which faces are exterior (exposed to weather), which are interior partitions (no insulation needed), and which face an enclosed atrium (partial conditioning). Without this, you can't calculate:
- Heating/cooling load (only exterior surfaces lose energy)
- Daylight penetration (only exterior windows matter)
- Ventilation paths

**Recommended fix:**
- After WFC collapse, run a flood-fill from known exterior cells (any cell adjacent to an `air` tile at the grid boundary) inward.
- Tag each voxel face as `exterior`, `interior-partition`, or `atrium-facing`.
- Store this as a `faceExposure` map alongside tile assignments.

---

## 3. Tile Vocabulary Is Too Small for Energy Differentiation

**The gap:** 9 tile types with no material properties. `solid-cube` and `solid-ground` are functionally identical except for weight. There's no distinction between a concrete core, a glazed curtain wall, an insulated panel, or a green wall.

**Why it matters for energy:** Each of those has wildly different thermal transmittance (U-value), solar heat gain coefficient (SHGC), and embodied carbon. If the tiles don't carry material metadata, you'll have to guess later — or build a second mapping layer that's disconnected from the WFC rules.

**Recommended fix:**
- Extend `TileDef` with an energy metadata block:

```typescript
interface EnergyProperties {
  uValue: number;           // W/(m2*K) — thermal transmittance
  shgc?: number;            // Solar heat gain coefficient (glazed tiles)
  embodiedCarbon?: number;  // kgCO2e/m2
  thermalMass?: number;     // kJ/(m2*K)
  materialClass: 'opaque' | 'glazed' | 'mixed' | 'open';
}
```

- Assign defaults per tile and allow overrides per building type.
- The WFC already carries `buildingType` on voxels — use that to select energy property variants.

---

## 4. No Floor Area or Volume Tracking

**The gap:** The system tracks voxels and corners but never computes actual usable floor area, gross volume, or floor-to-floor height. `HousingConfig.layerHeight` is 1.5 units, but nothing aggregates area per floor or total conditioned volume.

**Why it matters for energy:** Every energy model starts with two numbers: conditioned floor area and conditioned volume. Without them you can't calculate:
- Energy Use Intensity (EUI = kWh/m2/year)
- Ventilation requirements (ACH based on volume)
- Heating/cooling demand (proportional to envelope area and volume)

**Recommended fix:**
- After tile collapse, compute per-floor and whole-building metrics:

```typescript
interface BuildingMetrics {
  grossFloorArea: number;     // sum of solid voxel footprints per layer
  conditionedVolume: number;  // grossFloorArea * layerHeight, excluding air
  envelopeArea: number;       // total exterior-facing surface area
  glazingRatio: number;       // window area / total facade area
  floorCount: number;
  footprint: number;          // ground floor area
}
```

- Voronoi cell areas can be computed from vertices (shoelace formula). You already have the vertex arrays.

---

## 5. The Fallback Strategy Hides Failures Silently

**The gap:** In Phase 2, when all candidates get filtered out, the solver falls back to `[tiles[0]]` — the first candidate before filtering. In Phase 1, if no candidates match, it defaults to `air`. These are silent recoveries. There's no logging, no metric, no way to know how often the solver is "giving up."

**Why it matters:** If the solver frequently falls back, your buildings will have random tile placements that don't respect constraints. For energy modeling, this means facade compositions that break physical assumptions (e.g., a roof tile sandwiched between two floor tiles).

**Recommended fix:**
- Add a `SolveResult` type that tracks fallback count, contradiction count, and total iterations.
- Emit a diagnostic event when fallbacks happen.
- Optionally, implement backtracking: when a cell's candidates hit zero, undo the last collapse and try a different tile, rather than silently inserting a wrong one.

```typescript
interface SolveResult {
  assignments: TileAssignment[];
  fallbackCount: number;
  contradictions: number;
  iterations: number;
  converged: boolean;
}
```

---

## 6. No Seeded Randomness

**The gap:** `weightedPick` uses `Math.random()`. This means:
- Same input can produce different buildings on every run.
- You can't reproduce a specific building for debugging or comparison.
- A/B energy comparisons between design variants are impossible.

**Recommended fix:**
- Accept an optional seed in the `WFCSolver` constructor.
- Use a simple seeded PRNG (e.g., mulberry32 or xoshiro128) instead of `Math.random()`.

```typescript
constructor(registry: TileRegistry, voxelGrid: VoxelGrid, seed?: number) {
  this.rng = seed !== undefined ? seededRandom(seed) : Math.random;
}
```

---

## 7. Propagation Can Oscillate or Stall

**The gap:** Phase 2 iterates up to 50 times, but it only prunes candidates when a neighbor is already collapsed to a single tile (`belowTiles.length === 1`). This means:
- If two adjacent cells both have 3 candidates, neither constrains the other — propagation stalls.
- The 50-iteration cap is arbitrary and doesn't guarantee convergence.

**Recommended fix:**
- Implement arc-consistency (AC-3 style): prune a candidate from cell A if *no* candidate in adjacent cell B is compatible with it — regardless of how many candidates B has.
- Use a worklist/queue instead of full-sweep iteration: when a cell's candidate set shrinks, add its neighbors to the queue.
- This is the standard WFC approach and converges much faster.

---

## 8. Morph Shape and Tile Selection Are Disconnected

**The gap:** `MorphEvaluator` runs two independent pipelines — `StackingRules.evaluateMorphShape()` decides the *shape* (wall, roof, pillar, etc.), and `WFCSolver.solve()` decides the *tile* (solid-cube, roof-flat, etc.). But these don't talk to each other. The morph might say "this should be a roof-peaked" while the WFC assigns "wall-full" because it only considers corner ratios and sockets.

**Why it matters for energy:** You'll end up with conflicting metadata — the morph says "roof" (which means external, weatherproofed, insulated) but the tile says "wall" (which has different thermal properties). Which one does the energy model trust?

**Recommended fix:**
- Use the morph shape as an additional constraint fed into the WFC. After Phase 1, filter candidates to only those whose tile `id` matches or is compatible with the morph shape.
- Or unify the two: let the WFC tile vocabulary include morph semantics so there's a single source of truth.

---

## 9. No Orientation or Rotation Data

**The gap:** Tiles have no rotation or orientation. A `wall-windowed` tile facing north is identical to one facing south. The `openEdges` from `MorphResult` carry direction info, but this isn't passed into the tile assignment.

**Why it matters for energy:** Orientation determines:
- Solar gain (south-facing glazing gains much more heat than north-facing in the northern hemisphere)
- Daylight availability
- Wind exposure for infiltration
- Shading from neighboring buildings

**Recommended fix:**
- Add an `orientation` or `facingEdges` field to `TileAssignment`.
- After WFC collapse, inherit the `openEdges` from the corresponding `MorphResult` into the tile assignment.
- For energy queries, expose a method that returns which cardinal direction each open edge faces, given the cell's geometry.

---

## 10. Missing Building-Level Grouping

**The gap:** The system operates on individual cells and voxels. There's no concept of "this cluster of cells is one building." `buildingType` exists on individual voxels but there's no contiguous-region grouping.

**Why it matters for energy:** Energy is calculated per building, not per voxel. You need to know:
- Total envelope of building A vs. building B
- Shared party walls between adjacent buildings (which don't lose heat to outside)
- Per-building EUI, floor area, and glazing ratio

**Recommended fix:**
- After tile collapse, run a connected-component analysis on solid voxels (grouping by adjacency + shared `buildingType`).
- Produce a `Building` entity that owns a set of voxels and exposes aggregate metrics.

```typescript
interface Building {
  id: string;
  buildingType: string;
  voxels: Set<string>;        // "cellIndex:layer" keys
  footprintCells: number[];   // ground-level cell indices
  metrics: BuildingMetrics;
  envelope: EnvelopeFace[];   // exterior-facing faces with orientation
}
```

---

## 11. Socket Compatibility Table Has Blind Spots

**The gap:** The `SOCKET_COMPAT` table is small and has some asymmetries that could cause issues:
- `window` is compatible with `solid` but not vice versa (a window can sit next to solid, but solid can't sit next to window). This is fine vertically, but once horizontal propagation is added, it will create unexpected one-way constraints.
- `roof` only connects to `air` and vice versa, but a peaked roof with `topSocket: 'air'` can't sit below a `floor` — which is correct, but there's no `roof-to-roof` compatibility for adjacent rooflines.

**Recommended fix:**
- Make compatibility explicitly symmetric where intended: if A connects to B, B should connect to A.
- Add a `side` socket compatibility table separate from vertical, since the physics are different (vertical = load-bearing, horizontal = adjacency).
- Add roof-to-roof side compatibility for continuous rooflines.

---

## 12. No Data Export for Energy Tools

**The gap:** There is no serialization of the building geometry, tile assignments, or material properties into a format that energy simulation tools can consume (gbXML, IDF for EnergyPlus, or even a simple JSON schema).

**Recommended fix:**
- Define an export schema that maps your voxel buildings to energy-relevant data:

```typescript
interface EnergyExport {
  buildings: {
    id: string;
    type: string;
    floors: {
      level: number;
      area: number;
      height: number;
      zones: {
        cellIndex: number;
        tileId: string;
        faces: {
          direction: 'N' | 'S' | 'E' | 'W' | 'up' | 'down';
          exposure: 'exterior' | 'interior' | 'ground' | 'adiabatic';
          material: string;
          area: number;
          uValue: number;
          shgc?: number;
        }[];
      }[];
    }[];
    totalFloorArea: number;
    totalVolume: number;
    envelopeArea: number;
    glazingRatio: number;
  }[];
}
```

---

## Priority Roadmap

| Priority | Item | Effort | Energy Impact |
|----------|------|--------|---------------|
| **P0** | Tile energy metadata (#3) | Small | Unlocks all energy queries |
| **P0** | Floor area + volume tracking (#4) | Small | Needed for EUI calculation |
| **P0** | Building-level grouping (#10) | Medium | Needed to ask "how much energy does building X use" |
| **P1** | Interior vs. exterior tagging (#2) | Medium | Needed for envelope heat loss calc |
| **P1** | Orientation data (#9) | Small | Needed for solar gain modeling |
| **P1** | Data export schema (#12) | Medium | Connects your system to real energy tools |
| **P1** | Horizontal propagation (#1) | Medium | Prevents physically impossible facades |
| **P2** | Seeded randomness (#6) | Tiny | Reproducibility for design comparison |
| **P2** | Solve diagnostics (#5) | Small | Debugging and quality assurance |
| **P2** | AC-3 propagation (#7) | Medium | Better constraint solving, fewer artifacts |
| **P2** | Morph-WFC unification (#8) | Large | Eliminates conflicting metadata |
| **P3** | Socket table cleanup (#11) | Small | Prep for horizontal propagation |

---

## Quick Wins You Can Ship This Week

1. **Add `seed` parameter to WFCSolver** — 10 lines of code, instant reproducibility.
2. **Add `SolveResult` return type** — wrap the existing return in a struct, count fallbacks.
3. **Compute cell area via shoelace formula** — you already have the vertices, just aggregate.
4. **Add `EnergyProperties` to `TileDef`** — extend the interface, populate defaults in `TileDefs.ts`.

These four changes are backward-compatible, require no architectural changes, and give you the data foundation for energy queries.
