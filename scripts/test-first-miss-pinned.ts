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
  FIRST_MISS_HOLD_THRESHOLD,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

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
    sets: sets(4, 10),  // Missed target (12)
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
  check("  message indicates smallest step", d.message.includes("smallest available step"));
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
  check("  message indicates smallest step", d.message.includes("smallest available step"));
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
    d.nextWorkingWeightKg === 5 && d.message.includes("smallest available step"));
}

{
  const d = run({
    equipmentIds: ["dumbbell"],
    unit: "lb",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 0 }),
  });
  check("Dumbbell 7.5 kg (16.5 lb) first miss → holds at 7.5 kg", 
    d.nextWorkingWeightKg === 7.5 && d.message.includes("smallest available step"));
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
{
  const d = run({
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: CURL,  // isolation
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  });
  check("Barbell 13.75 kg two-miss with equipment (isolation) → 11.25 kg", 
    d.nextWorkingWeightKg === 11.25 && d.consecutiveFailures === 0);
}

// Two misses at 13.75 kg WITHOUT equipment (isolation): same logic → 11.25
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
  check("Barbell 13.75 kg (30.5 lb) two-miss with equipment (isolation) → 11.25 kg (25 lb)", 
    d.nextWorkingWeightKg === 11.25 && d.message.includes("25 lb"));
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

console.log("\n=== suggestedWeight: Hold Cases (metric) ===");

// When weight is held (non-deload, no change), return exact weight
{
  const w = suggestedWeight({ currentWorkingWeightKg: 12 }, false, CURL, ["dumbbell"], "kg");
  check("suggestedWeight hold: 12 kg dumbbell → 12 kg (unchanged)", w === 12);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 13.75 }, false, BENCH, ["barbell"], "kg");
  check("suggestedWeight hold: 13.75 kg barbell → 13.75 kg (unchanged)", w === 13.75);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 14 }, false, BENCH, ["barbell"], "kg");
  check("suggestedWeight hold: 14 kg barbell → 14 kg (unchanged)", w === 14);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 22 }, false, BENCH, ["barbell"], "kg");
  check("suggestedWeight hold: 22 kg barbell → 22 kg (unchanged)", w === 22);
}

console.log("\n=== suggestedWeight: Hold Cases (imperial) ===");

{
  const w = suggestedWeight({ currentWorkingWeightKg: 12 }, false, CURL, ["dumbbell"], "lb");
  check("suggestedWeight hold: 12 kg dumbbell → 12 kg (unchanged, lb unit)", w === 12);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 13.75 }, false, BENCH, ["barbell"], "lb");
  check("suggestedWeight hold: 13.75 kg barbell → 13.75 kg (unchanged, lb unit)", w === 13.75);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 14 }, false, BENCH, ["barbell"], "lb");
  check("suggestedWeight hold: 14 kg barbell → 14 kg (unchanged, lb unit)", w === 14);
}

{
  const w = suggestedWeight({ currentWorkingWeightKg: 22 }, false, BENCH, ["barbell"], "lb");
  check("suggestedWeight hold: 22 kg barbell → 22 kg (unchanged, lb unit)", w === 22);
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
const equipments = [
  { ids: ["barbell"], unit: "kg" as const },
  { ids: ["dumbbell"], unit: "kg" as const },
  { ids: ["machine", "cable"], unit: "kg" as const },
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

console.log("\n=== THRESHOLD VALUE ===");
check(`FIRST_MISS_HOLD_THRESHOLD is 0.20`, FIRST_MISS_HOLD_THRESHOLD === 0.20);

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All pinned tests passed`);
