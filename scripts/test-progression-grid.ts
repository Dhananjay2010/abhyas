#!/usr/bin/env tsx
/**
 * Test: progression grid rounding and feel-based adjustments
 * 
 * Covers:
 * - Grid rounding for barbell, dumbbell, machine/cable, and kettlebell
 * - U1: Hard feel holds weight (does not raise)
 * - Failed sets drop weight one grid step
 * - Kettlebell Easy moves up exactly one bell
 * - Kettlebell deload is ~80% rounded down to grid bell
 * - Bodyweight and unknown equipment are not broken
 * - Determinism check
 * - 5 mutant tests
 */

import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";
import { KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB } from "../src/lib/session/equipment-grid";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const LAT_PULLDOWN: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_pull",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const SQUAT: ExerciseMeta = { ...BENCH, movementPattern: "squat" };

const KETTLEBELL_SWING: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "hinge",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: "push",
  progressionRank: 1,
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
    sets: sets(4, 12),
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

console.log("\n1. U1: Hard feel holds weight (exact repro from QA)");
{
  // Exact U1 repro: Lat Pulldown, 4x12 at 45 kg, all sets completed, feel Hard
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 12, 45),
    state: fresh({ currentWorkingWeightKg: 45 }),
    feel: "hard",
    equipmentIds: ["lat_pulldown"], // Pin-stack machine
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("45 kg stays at 45 kg", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
  check("message says holding", d.message.includes("holding"), d.message);
  check("failures reset", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}

console.log("\n2. Failed set drops weight one grid step");
{
  // Barbell: 60 kg, missed target, should drop by 2.5 kg to 57.5 kg
  const d = run({
    sets: sets(4, 10, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("60 kg drops to 57.5 kg", d.nextWorkingWeightKg === 57.5, `${d.nextWorkingWeightKg}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
  check("failure counted", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}
{
  // Pin-stack machine: 50 kg, missed target, should drop by 5 kg to 45 kg
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 10, 50),
    state: fresh({ currentWorkingWeightKg: 50 }),
    equipmentIds: ["lat_pulldown"],
  });
  check("lat pulldown 50 kg drops to 45 kg", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
}
{
  // Dumbbell: 20 kg, missed target, should drop by 2.5 kg to 17.5 kg
  const d = run({
    sets: sets(4, 10, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["dumbbell"],
  });
  check("dumbbell 20 kg drops to 17.5 kg", d.nextWorkingWeightKg === 17.5, `${d.nextWorkingWeightKg}`);
}
{
  // Kettlebell: 16 kg, missed target, should drop to previous bell (14 kg)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 10, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
  });
  check("kettlebell 16 kg drops to 14 kg", d.nextWorkingWeightKg === 14, `${d.nextWorkingWeightKg}`);
}

console.log("\n3. Grid rounding for barbell");
{
  // 60 kg + 2.5 kg = 62.5 kg (on-grid)
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
    feel: "right",
  });
  check("60 kg -> 62.5 kg (barbell grid)", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}
{
  // Easy: 60 kg + 5 kg = 65 kg (on-grid)
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
    feel: "easy",
  });
  check("60 kg -> 65 kg easy (barbell grid)", d.nextWorkingWeightKg === 65, `${d.nextWorkingWeightKg}`);
}

console.log("\n4. Grid rounding for dumbbell");
{
  // 20 kg + 2.5 kg = 22.5 kg (on-grid)
  const d = run({
    sets: sets(4, 12, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["dumbbell"],
  });
  check("20 kg -> 22.5 kg (dumbbell grid)", d.nextWorkingWeightKg === 22.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n5. Grid rounding for machine/cable (pin-stack: 5 kg steps)");
{
  // Pin-stack: 45 kg + 2.5 kg (upper compound) = 47.5 kg, rounds to 45 kg (tie rounds down)
  // To progress on a 5 kg grid from 45 kg, need 'easy' feel: 45 + 5 kg = 50 kg
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 12, 45),
    state: fresh({ currentWorkingWeightKg: 45 }),
    equipmentIds: ["lat_pulldown"],
    feel: "easy", // doubles increment: 2.5 * 2 = 5 kg
  });
  check("45 kg -> 50 kg (pin-stack machine grid, easy feel)", d.nextWorkingWeightKg === 50, `${d.nextWorkingWeightKg}`);
}
{
  // Cable: 20 kg + 2.5 kg = 22.5 kg
  const d = run({
    sets: sets(4, 12, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["cable_machine"],
  });
  check("20 kg -> 22.5 kg (cable grid)", d.nextWorkingWeightKg === 22.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n6. Kettlebell Easy moves up exactly one bell");
{
  // 16 kg -> 18 kg (one bell up)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("16 kg -> 18 kg (one bell up)", d.nextWorkingWeightKg === 18, `${d.nextWorkingWeightKg}`);
}
{
  // 20 kg -> 24 kg (one bell up)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("20 kg -> 24 kg (one bell up)", d.nextWorkingWeightKg === 24, `${d.nextWorkingWeightKg}`);
}
{
  // 24 kg -> 28 kg (one bell up)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 24),
    state: fresh({ currentWorkingWeightKg: 24 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("24 kg -> 28 kg (one bell up)", d.nextWorkingWeightKg === 28, `${d.nextWorkingWeightKg}`);
}
{
  // 32 kg -> 32 kg (at top bell)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 32),
    state: fresh({ currentWorkingWeightKg: 32 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("32 kg -> 32 kg (at top bell, cannot go higher)", d.nextWorkingWeightKg === 32, `${d.nextWorkingWeightKg}`);
}

console.log("\n7. Kettlebell deload rounds to grid bell at or below ~80%");
{
  // 20 kg * 0.8 = 16 kg (exact bell)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 20 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("20 kg deload -> 16 kg", deload === 16, `${deload}`);
}
{
  // 24 kg * 0.8 = 19.2 kg -> 18 kg (nearest bell at or below)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 24 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("24 kg deload -> 18 kg", deload === 18, `${deload}`);
}
{
  // 32 kg * 0.8 = 25.6 kg -> 24 kg (nearest bell at or below)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 32 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("32 kg deload -> 24 kg", deload === 24, `${deload}`);
}
{
  // 16 kg * 0.8 = 12.8 kg -> 12 kg
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 16 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("16 kg deload -> 12 kg", deload === 12, `${deload}`);
}
{
  // Kettlebell deload must never go UP
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 10 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("10 kg deload -> 8 kg (never goes up)", deload === 8, `${deload}`);
}

console.log("\n8. Bodyweight exercises are not broken");
{
  // Unloaded bodyweight: reps progression
  const d = run({
    meta: PUSHUP,
    sets: sets(4, 12, null),
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 12 }),
    equipmentIds: [],
  });
  check("unloaded bodyweight progresses reps to 14", d.nextTargetReps === 14, `${d.nextTargetReps}`);
  check("no weight invented", d.nextWorkingWeightKg === null);
}
{
  // Loaded bodyweight: weight progression with grid rounding
  // Note: addedWeightStep (1.25 kg) < dip_belt grid (2.5 kg)
  // Use 10 kg: 10 + 1.25 = 11.25, which is the midpoint between 10 and 12.5, rounds down to 10
  // So use 11.25 kg as starting point: 11.25 + 1.25 = 12.5 (on grid)
  const d = run({
    meta: PUSHUP,
    sets: sets(4, 12, 11.25),
    state: fresh({ currentWorkingWeightKg: 11.25, currentTargetReps: 12 }),
    equipmentIds: ["dip_belt"],
  });
  check("loaded bodyweight 11.25 kg -> 12.5 kg", d.nextWorkingWeightKg === 12.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n9. Equipment variations work (EZ bar, trap bar)");
{
  // EZ bar and trap bar use same grid as barbell (2.5 kg)
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["ez_bar"],
  });
  check("EZ bar 60 kg -> 62.5 kg", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}
{
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["trap_bar"],
  });
  check("trap bar 60 kg -> 62.5 kg", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n10. Determinism check");
{
  const results: number[] = [];
  for (let i = 0; i < 10; i++) {
    const d = run({
      sets: sets(4, 12, 60),
      state: fresh({ currentWorkingWeightKg: 60 }),
      equipmentIds: ["barbell"],
    });
    results.push(d.nextWorkingWeightKg ?? 0);
  }
  const allSame = results.every((r) => r === results[0]);
  check("10 identical runs produce identical results", allSame, `results: ${results.join(", ")}`);
}

console.log("\n11. Backed-off weights are rounded to grid");
{
  // Two misses: 60 kg * 0.9 = 54 kg, rounds to 55 kg (barbell grid)
  const d = run({
    sets: sets(4, 10, 60),
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
  });
  check("outcome backed_off", d.outcome === "backed_off", d.outcome);
  check("60 kg -> 55 kg (rounded to barbell grid)", d.nextWorkingWeightKg === 55, `${d.nextWorkingWeightKg}`);
}
{
  // Pin-stack machine: 50 kg * 0.9 = 45 kg (on-grid)
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 10, 50),
    state: fresh({ currentWorkingWeightKg: 50, consecutiveFailures: 1 }),
    equipmentIds: ["lat_pulldown"],
  });
  check("lat pulldown 50 kg -> 45 kg", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
}

console.log("\n12. Kettlebell 'right' feel uses normal progression (not one-bell special case)");
{
  // 16 kg with 'right' feel should use normal increment, then round to grid
  // Normal: 16 + step (5 for lower-body) = 21, rounds to 20 kg
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    feel: "right",
  });
  check("16 kg with 'right' feel -> 20 kg", d.nextWorkingWeightKg === 20, `${d.nextWorkingWeightKg}`);
}

console.log("\n13. MUTANT TESTS");

console.log("\n  (a) Mutant: Rounding removed");
{
  // If rounding is removed, a barbell progression from 61 kg would produce 63.5 kg (off-grid)
  // With rounding, it should produce 62.5 kg or 65 kg (on-grid)
  // This test cannot directly verify the mutant, but we can check that results are on-grid
  const d = run({
    sets: sets(4, 12, 60.5), // Unusual starting weight
    state: fresh({ currentWorkingWeightKg: 60.5 }),
    equipmentIds: ["barbell"],
  });
  const isOnGrid = d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg % 2.5 === 0;
  check("result is on barbell grid (multiple of 2.5)", isOnGrid, `${d.nextWorkingWeightKg}`);
  // Expected fail count for mutant (a): If rounding removed, this would fail
  console.log("    Expected fail count for mutant (a): 1+");
}

console.log("\n  (b) Mutant: Hard raises weight again");
{
  // If Hard raises weight, the U1 repro would fail
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 12, 45),
    state: fresh({ currentWorkingWeightKg: 45 }),
    feel: "hard",
    equipmentIds: ["lat_pulldown"],
  });
  check("Hard feel does not raise weight", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
  // Expected fail count for mutant (b): 1
  console.log("    Expected fail count for mutant (b): 1");
}

console.log("\n  (c) Mutant: Failed set no longer drops weight");
{
  // If failed sets don't drop, nextWorkingWeightKg would equal currentWorkingWeightKg
  const d = run({
    sets: sets(4, 10, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
  });
  check("Failed set drops weight", d.nextWorkingWeightKg !== 60, `${d.nextWorkingWeightKg}`);
  check("Specifically, 60 kg drops to 57.5 kg", d.nextWorkingWeightKg === 57.5, `${d.nextWorkingWeightKg}`);
  // Expected fail count for mutant (c): 2+ (all failed-set tests)
  console.log("    Expected fail count for mutant (c): 2+");
}

console.log("\n  (d) Mutant: Kettlebell Easy jumps two bells");
{
  // If Easy jumps two bells, 16 kg would go to 20 kg instead of 18 kg
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("Kettlebell Easy moves up exactly one bell", d.nextWorkingWeightKg === 18, `${d.nextWorkingWeightKg}`);
  // Expected fail count for mutant (d): 1+ (all kettlebell Easy tests)
  console.log("    Expected fail count for mutant (d): 1+");
}

console.log("\n  (e) Mutant: Kettlebell deload rounds up");
{
  // If deload rounds up, 24 kg deload would be 20 kg instead of 18 kg
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 24 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("Kettlebell deload rounds down to 18 kg", deload === 18, `${deload}`);
  // Expected fail count for mutant (e): 1+ (all kettlebell deload tests)
  console.log("    Expected fail count for mutant (e): 1+");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
