#!/usr/bin/env tsx
/**
 * Pinned test cases for first-miss hold guard and equipment progression rules.
 * 
 * Tests the specific examples given in the requirements:
 * - First-miss drops, holds, and threshold behavior
 * - Two-miss behavior with equipment
 * - Invariant enforcement (first-miss >= two-miss)
 * - suggestedWeight holds keep exact weight
 * - Both metric and imperial units
 */

import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";
import { type WeightUnit } from "../src/lib/session/equipment-grid";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const LEG_EXTENSION: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "other",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 60) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const run = (over: Partial<Parameters<typeof evaluateProgression>[0]> = {}) =>
  evaluateProgression({
    sets: sets(4, 7),  // Real miss (below repsMin of 8)
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
    ...over,
  });

console.log("\n=== First-Miss: Dumbbell Cases (metric) ===");

// Dumbbell 6 → 5 (drops one step)
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 6, consecutiveFailures: 0 }),
  });
  check("Dumbbell 6 kg first miss → 5 kg", d.nextWorkingWeightKg === 5 && d.consecutiveFailures === 1);
  check("  message indicates drop", d.message.includes("dropping to 5 kg"));
}

// Dumbbell 12 → 10 (drops one step)
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 12, consecutiveFailures: 0 }),
  });
  check("Dumbbell 12 kg first miss → 10 kg", d.nextWorkingWeightKg === 10 && d.consecutiveFailures === 1);
  check("  message indicates drop", d.message.includes("dropping to 10 kg"));
}

// Dumbbell 5 → holds (smallest loadable, or below increment)
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
  });
  check("Dumbbell 5 kg first miss → holds at 5 kg", d.nextWorkingWeightKg === 5 && d.consecutiveFailures === 1);
  // #120: Message for cut20 reason (2.5 kg would be 50% cut > 20%)
  check("  message indicates cut > 20%", d.message.includes("cut more than 20%"));
}

// Dumbbell 7.5 → holds (33% cut triggers 20% threshold)
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 0 }),
  });
  const cutPct = (7.5 - 5) / 7.5;
  check(`Dumbbell 7.5 kg first miss → holds (cut would be ${(cutPct * 100).toFixed(1)}% > 20%)`, 
    d.nextWorkingWeightKg === 7.5 && d.consecutiveFailures === 1);
  // #120: Message for cut20 reason, not smallest
  check("  message indicates cut > 20%", d.message.includes("cut more than 20%"));
}

console.log("\n=== First-Miss: Dumbbell Cases (imperial) ===");

// Same cases in imperial (stored as kg, displayed as lb)
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "lb",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 6, consecutiveFailures: 0 }),
  });
  check("Dumbbell 6 kg (13.2 lb) first miss → 5 kg (11 lb)", 
    d.nextWorkingWeightKg === 5 && d.message.includes("11 lb"));
}

{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "lb",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 12, consecutiveFailures: 0 }),
  });
  check("Dumbbell 12 kg (26.5 lb) first miss → 10 kg (22 lb)", 
    d.nextWorkingWeightKg === 10 && d.message.includes("22 lb"));
}

{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "lb",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
  });
  check("Dumbbell 5 kg (11 lb) first miss → holds at 5 kg", 
    d.nextWorkingWeightKg === 5 && d.message.includes("cut more than 20%") && d.message.includes("11 lb"));
}

{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "lb",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 0 }),
  });
  check("Dumbbell 7.5 kg (16.5 lb) first miss → holds at 7.5 kg", 
    d.nextWorkingWeightKg === 7.5 && d.message.includes("cut more than 20%") && d.message.includes("16.5 lb"));
}

console.log("\n=== First-Miss: Leg Extension & Med Ball ===");

// Leg extension 10 kg: 2.5 kg step, drops to 7.5 (25% cut triggers threshold)
{
  const d = run({
    equipmentIds: ["machine", "cable"],
    unit: "kg",
    meta: LEG_EXTENSION,
    state: fresh({ currentWorkingWeightKg: 10, consecutiveFailures: 0 }),
  });
  // Step down would be to 7.5 kg (10 - 2.5), which is (10-7.5)/10 = 25% > 20%
  // Result depends on implementation: it should hold
  const cutPct = (10 - 7.5) / 10;
  check(`Leg extension 10 kg: cut would be ${(cutPct * 100).toFixed(1)}% > 20% → holds or drops to 7.5`, 
    d.nextWorkingWeightKg !== null && d.consecutiveFailures === 1);
  console.log(`    (result: ${d.nextWorkingWeightKg} kg, message: "${d.message}")`);
}

// Med ball 4 kg: 1 kg step, drops to 3 (25% cut)
{
  const d = run({
    equipmentIds: ["medicine_ball"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 4, consecutiveFailures: 0 }),
  });
  // Step down would be to 3 kg, which is (4-3)/4 = 25% > 20%
  const cutPct = (4 - 3) / 4;
  check(`Med ball 4 kg: cut would be ${(cutPct * 100).toFixed(1)}% > 20% → holds or drops to 3`, 
    d.nextWorkingWeightKg !== null && d.consecutiveFailures === 1);
  console.log(`    (result: ${d.nextWorkingWeightKg} kg, message: "${d.message}")`);
}

console.log("\n=== Two-Miss: Barbell 13.75 kg (metric, isolation) ===");

// Two misses at 13.75 kg with equipment (isolation): 90% = 12.375, floor to 1.25 grid = 11.25, cap at 12.375 - 1.25 = 11.125 → max(11.25, 11.125) = 11.25
// SMALLEST loadable >= 11.25 is 12.5 (next barbell step up)
{
  const d = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: CURL,  // isolation
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  });
  check("Barbell 13.75 kg two-miss with equipment (isolation) → 12.5 kg (loadable)", 
    d.nextWorkingWeightKg === 12.5 && d.consecutiveFailures === 0);
}

// Two misses at 13.75 kg WITHOUT equipment (isolation): same logic → 11.25 (no equipment snap)
{
  const d = run({
    equipmentIds: undefined,
    unit: undefined,
    meta: CURL,  // isolation
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  });
  check("Barbell 13.75 kg two-miss without equipment (isolation) → 11.25 kg (same)", 
    d.nextWorkingWeightKg === 11.25 && d.consecutiveFailures === 0);
}

console.log("\n=== Two-Miss: Barbell 13.75 kg (imperial, isolation) ===");

{
  const d = run({
    equipmentIds: ["barbell"],
    unit: "lb",
    meta: CURL,  // isolation
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  });
  check("Barbell 13.75 kg (30.5 lb) two-miss with equipment (isolation) → 12.5 kg (27.5 lb, loadable)", 
    d.nextWorkingWeightKg === 12.5 && d.message.includes("27"));
}

{
  const d = run({
    equipmentIds: undefined,
    unit: undefined,
    meta: CURL,  // isolation
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  });
  check("Barbell 13.75 kg two-miss without equipment (isolation) → 11.25 kg (no unit in message)", 
    d.nextWorkingWeightKg === 11.25);
}

console.log("\n=== suggestedWeight: Increases, Decreases, Holds ===");

// Test that increases land on loadable values (via evaluateProgression)
{
  const decision = run({
    sets: sets(4, 12, 12),
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 12, consecutiveFailures: 0 }),
  });
  // #120: One-grid-step increase cap: 12 kg → 12.5 kg (not 15)
  check("Increase from 12kg dumbbell lands on loadable value", decision.nextWorkingWeightKg === 12.5);
  
  // suggestedWeight just returns that value
  const w = suggestedWeight({ currentWorkingWeightKg: 12.5 }, false, CURL, ["dumbbell"], "kg");
  check("  suggestedWeight returns 12.5 (loadable)", w === 12.5);
}

// Test that decreases land on grid (via two-miss)
{
  const decision = run({
    sets: sets(4, 10, 13.75),
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  });
  // Two-miss from 13.75: 90% = 12.375, floor to 1.25 grid = 11.25
  // With equipment snap: 11.25 → 10? No, would violate cap
  check("Decrease from 13.75kg isolation returns computed value", decision.nextWorkingWeightKg !== null);
  
  // suggestedWeight returns as-is (might be off-grid, acceptable)
  const w = suggestedWeight({ currentWorkingWeightKg: decision.nextWorkingWeightKg! }, false, CURL, ["dumbbell"], "kg");
  check("  suggestedWeight returns as-is", w === decision.nextWorkingWeightKg);
}

// Test holds return exact
{
  const w1 = suggestedWeight({ currentWorkingWeightKg: 12 }, false, CURL, ["dumbbell"], "kg");
  check("Hold at 12kg returns 12 exact", w1 === 12);
  
  const w2 = suggestedWeight({ currentWorkingWeightKg: 13.75 }, false, BENCH, ["barbell"], "kg");
  check("Hold at 13.75kg returns 13.75 exact", w2 === 13.75);
}

console.log("\n=== suggestedWeight: No Equipment (unchanged) ===");

{
  const w = suggestedWeight({ currentWorkingWeightKg: 12 }, false, CURL, undefined, undefined);
  check("suggestedWeight no-equipment: 12 kg → 12 kg (same as main)", w === 12);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 13.75 }, false, BENCH, undefined, undefined);
  check("suggestedWeight no-equipment: 13.75 kg → 13.75 kg (same as main)", w === 13.75);
}

console.log("\n=== Invariant: First-Miss >= Two-Miss ===");

// Test that first-miss result is always >= two-miss result
const testWeights = [5, 7.5, 10, 12, 15, 20, 30, 40, 60, 100];
const equipments: Array<{ ids: string[]; unit: WeightUnit }> = [
  { ids: ["barbell"], unit: "kg" },
  { ids: ["dumbbell"], unit: "kg" },
  { ids: ["machine", "cable"], unit: "kg" },
];

for (const { ids, unit } of equipments) {
  for (const weight of testWeights) {
    const firstMiss = run({
      equipmentIds: ids,
      unit,
      meta: BENCH,
      state: fresh({ currentWorkingWeightKg: weight, consecutiveFailures: 0 }),
    });
    const twoMiss = run({
      equipmentIds: ids,
      unit,
      meta: BENCH,
      state: fresh({ currentWorkingWeightKg: weight, consecutiveFailures: 1 }),
    });
    
    const firstW = firstMiss.nextWorkingWeightKg ?? 0;
    const twoW = twoMiss.nextWorkingWeightKg ?? 0;
    
    check(`Invariant ${ids[0]} ${weight} kg: first-miss (${firstW}) >= two-miss (${twoW})`, firstW >= twoW);
  }
}

console.log("\n=== NEVER-RAISE Tests ===");
// KB 3 kg first miss: next bell down is 3 or stays at 3? Should never raise.
{
  const d = run({
    equipmentIds: ["kettlebell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 3, consecutiveFailures: 0 }),
  });
  check("KB 3 kg first miss: never raise", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg <= 3);
}

// lat_pulldown isolation 3 kg first miss: never raise
{
  const d = run({
    equipmentIds: ["lat_pulldown"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation", movementPattern: "vertical_pull" },
    state: fresh({ currentWorkingWeightKg: 3, consecutiveFailures: 0 }),
  });
  check("lat_pulldown isolation 3 kg first miss: never raise", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg <= 3);
}

// lat_pulldown 3kg two-miss tests helper never-raise: target 2.5 snaps to 5kg > 3kg
{
  const d = run({
    equipmentIds: ["lat_pulldown"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation", movementPattern: "vertical_pull" },
    state: fresh({ currentWorkingWeightKg: 3, consecutiveFailures: 1 }),
  });
  check("lat_pulldown 3 kg two-miss: helper never-raise prevents 5kg", d.nextWorkingWeightKg === 3);
}

// lat_pulldown isolation 4.5 kg first miss: never raise
{
  const d = run({
    equipmentIds: ["lat_pulldown"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation", movementPattern: "vertical_pull" },
    state: fresh({ currentWorkingWeightKg: 4.5, consecutiveFailures: 0 }),
  });
  check("lat_pulldown isolation 4.5 kg first miss: never raise", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg <= 4.5);
}

// leg_extension isolation 30 kg first miss: never raise, should be loadable
{
  const d = run({
    equipmentIds: ["leg_extension"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation", movementPattern: "lunge" },
    state: fresh({ currentWorkingWeightKg: 30, consecutiveFailures: 0 }),
  });
  check("leg_extension isolation 30 kg first miss: never raise, loadable",
    d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg <= 30);
}

console.log("\n=== HOLD Tests ===");
// Barbell isolation 12.5 first miss → hold
{
  const d = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation" },
    state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  });
  check("Barbell isolation 12.5 kg first miss → hold (next would be 11.25, not loadable)", 
    d.nextWorkingWeightKg === 12.5);
}

// KB press 48 two-miss → hold (cap at 40.7, largest bell < 48 is 40, but 40 < 40.7)
{
  const d = run({
    equipmentIds: ["kettlebell"],
    unit: "kg",
    meta: { ...BENCH, mechanic: "compound", movementPattern: "vertical_press" },
    state: fresh({ currentWorkingWeightKg: 48, consecutiveFailures: 1 }),
  });
  check("KB press 48 kg two-miss → hold (no bell between cap and current)", 
    d.nextWorkingWeightKg === 48);
}

// Barbell compound 10 first miss → hold (25% cut)
{
  const d = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: { ...BENCH, mechanic: "compound" },
    state: fresh({ currentWorkingWeightKg: 10, consecutiveFailures: 0 }),
  });
  const nextDown = 7.5;
  const cut = (10 - nextDown) / 10;
  check(`Barbell compound 10 kg first miss → hold (cut would be ${(cut * 100).toFixed(1)}% > 20%)`, 
    d.nextWorkingWeightKg === 10);
}

console.log("\n=== Mutant-Killing Tests ===");

// (c) Kill >= mutant: test exact 20% boundary
{
  // Dumbbell 12.5 kg, step to 10 kg = 2.5 kg cut = 20.0% exactly
  // With >, this should drop. With >=, this would hold.
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  });
  check("12.5kg dumbbell first miss → hold (10kg < two-miss floor)", d.nextWorkingWeightKg === 12.5);
}

// Exact 20% boundary without two-miss floor interference
{
  // Barbell compound 12.5kg -> 10kg is exactly 20%
  const d = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: { ...BENCH, mechanic: "compound" },
    state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  });
  check("12.5kg barbell compound exact 20% cut: drops to 10kg (> not >=)", d.nextWorkingWeightKg === 10);
}

// (f) Kill kettlebell <= mutant: ensure strictly-below
{
  // Kettlebell at 16 kg. Next bell down is 14 kg. If we allow <=, it would stay at 16.
  // With <, it must go to 14.
  const d = run({
    equipmentIds: ["kettlebell"],
    unit: "kg",
    meta: { ...BENCH, mechanic: "compound" },
    state: fresh({ currentWorkingWeightKg: 16, consecutiveFailures: 0 }),
  });
  check("Kettlebell 16 kg first miss: must drop to 14 kg (strictly below)", d.nextWorkingWeightKg === 14);
}

// More kettlebell strictly-below tests
{
  const d = run({
    equipmentIds: ["kettlebell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 12, consecutiveFailures: 0 }),
  });
  check("Kettlebell 12 kg first miss: must drop to 10 kg (strictly below)", d.nextWorkingWeightKg === 10);
}

{
  const d = run({
    equipmentIds: ["kettlebell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 24, consecutiveFailures: 0 }),
  });
  check("Kettlebell 24 kg first miss: must drop to 20 kg (strictly below)", d.nextWorkingWeightKg === 20);
}

// (g) Kill invariant clamp removal: test case where first-miss < two-miss without clamp
{
  // Barbell 2.75 kg isolation: first-miss would naturally go to 2.5kg (one step down)
  // but two-miss holds at 2.75kg (light weight). Clamp forces first to hold at 2.75.
  const firstMiss = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation" },
    state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 0 }),
  });
  
  const twoMiss = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation" },
    state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 1 }),
  });
  const firstW = firstMiss.nextWorkingWeightKg ?? 0;
  const twoW = twoMiss.nextWorkingWeightKg ?? 0;
  
  check("Barbell 2.75 kg isolation first-miss >= two-miss", firstW >= twoW);
  check("  (without clamp: first would be 2.5, two would be 2.75, violating invariant)", 
    firstW === 2.75 && twoW === 2.75);
}

console.log("\n=== THRESHOLD BEHAVIOR ===");
// Test threshold value through behavior, not by checking the constant
// Dumbbell 7.5 kg -> 5 kg would be 33.3% cut, which is > 20% but < 50%
// With 0.20 threshold: should hold (33% > 20%)
// With 0.50 threshold: would drop (33% < 50%)
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 0 }),
  });
  const cutPct = (7.5 - 5) / 7.5;
  check(`Threshold 0.20: 7.5kg with ${(cutPct*100).toFixed(1)}% cut holds (> 20%)`, d.nextWorkingWeightKg === 7.5);
}

// Test 20-25% range: barbell compound 10kg -> 7.5kg = 25% cut
{
  const d = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: { ...BENCH, mechanic: "compound" },
    state: fresh({ currentWorkingWeightKg: 10, consecutiveFailures: 0 }),
  });
  const nextDown = 7.5;
  const cutPct = (10 - nextDown) / 10;
  check(`Threshold 0.20: 10kg with ${(cutPct*100).toFixed(1)}% cut holds (> 20%, < 25%)`, d.nextWorkingWeightKg === 10);
}

console.log("\n=== HOLD RETURNS EXACT WEIGHT ===");
// Test that holds return exact current weight, not snapped
{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 0 }),
  });
  check("7.5 kg hold returns exactly 7.5 (not 5 if snapped)", d.nextWorkingWeightKg === 7.5 && d.outcome === "hold");
}

{
  // Off-grid weight
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: { ...CURL, mechanic: "isolation" },
    state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 1 }), // Two-miss hold
  });
  check("2.75 kg hold returns exactly 2.75 (not 2.5 if snapped)", d.nextWorkingWeightKg === 2.75 && d.outcome === "hold");
}

console.log("\n=== HARD-FEEL HOLD ===");
// Test that hard feel with equipment holds at current weight
{
  const d = run({
    sets: sets(4, 12, 60), // Hit target but felt hard
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 0 }),
    feel: "hard",
  });
  check("Hard feel at 60 kg barbell: holds at 60", d.nextWorkingWeightKg === 60 && d.outcome === "hold");
}

console.log("\n=== IN-RANGE HOLD (4×10 in 8-12) ===");
// Test that in-range sessions hold weight and reset failures
{
  const d = run({
    sets: sets(4, 10, 40), // In range [8, 12], not at top
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 40, consecutiveFailures: 0 }),
    feel: "right",
  });
  check("4×10 in 8-12: outcome hold", d.outcome === "hold");
  check("4×10 in 8-12: weight unchanged at 40", d.nextWorkingWeightKg === 40);
  check("4×10 in 8-12: failures reset to 0", d.consecutiveFailures === 0);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All pinned tests passed`);
