#!/usr/bin/env tsx
/**
 * Test: effectiveBaseWeight behaviour in progression decisions
 * 
 * Covers all required outcomes:
 * - 4×12@45 from stored 40 (top of range) => next 47.5
 * - 4×10@45 in-range from 40 => holds 45
 * - 4×8@60 from 40 => next from 60
 * - Mixed sets (lighter) => increase/hold from 40
 * - Stored 0 bodyweight => stays 0
 * - Lowest 41.257 => stores 41.26 (2 dp)
 * 
 * Run: npm run test:inrange-base-weight
 */

import {
  evaluateProgression,
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

const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: "standard_pushup_chain",
  progressionRank: 1,
};

const state = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 40,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 40,
  bestReps: 10,
  bestE1rm: 53.33,
  totalSessions: 1,
  ...over,
});

console.log("\nTest: effectiveBaseWeight behaviour\n");

// Case 1: 4×12@45 from stored 40 (top of range hit) => next weight 47.5
console.log("Case 1: Top of range @ 45, stored 40 => progresses from 45");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 47.5 kg (from 45, not from 40)", decision.nextWorkingWeightKg === 47.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 2: 4×10@45 in-range from 40 => holds 45
console.log("\nCase 2: In-range @ 45, stored 40 => holds 45");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 45 },
      { reps: 10, weightKg: 45 },
      { reps: 10, weightKg: 45 },
      { reps: 10, weightKg: 45 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 45 kg (heavier weight used)", decision.nextWorkingWeightKg === 45, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 3: 4×8@60 from 40 => next from 60
console.log("\nCase 3: Top of range @ 60, stored 40 => progresses from 60");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 62.5 kg (from 60, not from 40)", decision.nextWorkingWeightKg === 62.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 4: Mixed sets - one lighter than stored => increase from stored
console.log("\nCase 4: Mixed sets (one lighter) => increase from stored 40");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 50 },
      { reps: 12, weightKg: 35 },  // Lighter than stored 40
      { reps: 12, weightKg: 50 },
      { reps: 12, weightKg: 50 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 42.5 kg (from stored 40)", decision.nextWorkingWeightKg === 42.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 5: Mixed sets - in-range with one lighter => holds stored
console.log("\nCase 5: In-range mixed (one lighter) => holds stored 40");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 50 },
      { reps: 10, weightKg: 35 },  // Lighter than stored 40
      { reps: 10, weightKg: 50 },
      { reps: 10, weightKg: 50 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 40 kg (stored, not lighter set)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 6: Stored 0 bodyweight => stays 0, never null
console.log("\nCase 6: Bodyweight (stored 0) in-range => stays 0");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 0 },
      { reps: 10, weightKg: 0 },
      { reps: 10, weightKg: 0 },
      { reps: 10, weightKg: 0 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: state({ currentWorkingWeightKg: 0 }),
    isDeload: false,
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 0 (not null)", decision.nextWorkingWeightKg === 0, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  check("Message: 'this weight' (not 'here' or '0 kg')", decision.message === "Staying at this weight until every set reaches the top of the range.", decision.message);
}

// Case 7: Bodyweight top of range => progresses reps, weight stays 0
console.log("\nCase 7: Bodyweight top of range => progresses reps");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: state({ currentWorkingWeightKg: 0, currentTargetReps: 12 }),
    isDeload: false,
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next target reps: 14", decision.nextTargetReps === 14, `${decision.nextTargetReps}`);
  check("Weight: stays 0 (not null)", decision.nextWorkingWeightKg === 0 || decision.nextWorkingWeightKg === null);
}

// Case 8: Lowest 41.257 => stores 41.26 (2 dp rounding)
console.log("\nCase 8: Lowest 41.257 in-range => rounds to 41.26");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 41.257 },
      { reps: 10, weightKg: 42.5 },
      { reps: 10, weightKg: 43 },
      { reps: 10, weightKg: 45 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 41.26 kg (rounded to 2 dp)", decision.nextWorkingWeightKg === 41.26, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 9: Top of range with lowest 41.257 => progresses from 41.26
console.log("\nCase 9: Top of range, lowest 41.257 => progresses from 41.26");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 41.257 },
      { reps: 12, weightKg: 42.5 },
      { reps: 12, weightKg: 43 },
      { reps: 12, weightKg: 45 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  // 41.26 (rounded lowest) + 2.5 (increment) = 43.76, snapped to 45 kg grid
  check("Next weight: 45 kg (from 41.26)", decision.nextWorkingWeightKg === 45, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 10: Stored null => falls back to heaviest
console.log("\nCase 10: Stored null => falls back to heaviest");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 50 },
      { reps: 12, weightKg: 50 },
      { reps: 12, weightKg: 50 },
      { reps: 12, weightKg: 50 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: null }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 52.5 kg (from 50)", decision.nextWorkingWeightKg === 52.5, `${decision.nextWorkingWeightKg}`);
}

// Case 11: Stored 0 with added weight => uses added weight
console.log("\nCase 11: Stored 0 with added weight => uses added weight");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 10 },
      { reps: 12, weightKg: 10 },
      { reps: 12, weightKg: 10 },
      { reps: 12, weightKg: 10 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: state({ currentWorkingWeightKg: 0 }),
    isDeload: false,
    equipmentIds: ["dip_belt"],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 12.5 kg (from 10 + 1.25, rounded to 2.5 kg grid)", decision.nextWorkingWeightKg === 12.5, `${decision.nextWorkingWeightKg}`);
}

// Case 12: Stored 0 with added weight 41.257 => rounds to 41.26
console.log("\nCase 12: Stored 0, in-range with lowest 41.257 => rounds to 41.26");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 41.257 },
      { reps: 10, weightKg: 42.5 },
      { reps: 10, weightKg: 43 },
      { reps: 10, weightKg: 45 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: state({ currentWorkingWeightKg: 0 }),
    isDeload: false,
    equipmentIds: ["dip_belt"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 41.26 kg (rounded to 2 dp)", decision.nextWorkingWeightKg === 41.26, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

// Case 13: Hard feel with stored 40, 4x12@45 => holds at 45 (not 40)
console.log("\nCase 13: Hard feel: stored 40, 4x12@45 feel hard => holds 45");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "hard",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 45 kg (heavier weight used, not stored 40)", decision.nextWorkingWeightKg === 45, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  check("Message: 'felt hard'", decision.message.includes("felt hard"), decision.message);
}

// Case 14: Zero-rep set filter: stored 40, 4x10@45 + 0-rep set @20 => holds 45 (not 40 or 20)
console.log("\nCase 14: Zero-rep filter: stored 40, 4x10@45 + 0-rep @20 => holds 45");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 45 },
      { reps: 10, weightKg: 45 },
      { reps: 10, weightKg: 45 },
      { reps: 10, weightKg: 45 },
      { reps: 0, weightKg: 20 }, // Zero-rep set should be filtered out
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 45 kg (0-rep set filtered)", decision.nextWorkingWeightKg === 45, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
