#!/usr/bin/env tsx
/**
 * Test: In-range hold with heavier weight
 * 
 * Stored: 40 kg
 * Logged: 4×10 @ 42.5 kg (all in 8-12 range)
 * Expected: Store 42.5 kg (the heavier weight actually used)
 * 
 * Run: npm run test:inrange-heavier
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

console.log("\nTest: In-range hold with heavier weight\n");

{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 42.5 },
      { reps: 10, weightKg: 42.5 },
      { reps: 10, weightKg: 42.5 },
      { reps: 10, weightKg: 42.5 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 42.5 kg (heavier weight used)", decision.nextWorkingWeightKg === 42.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  check("Message: describes 42.5 kg", decision.message.includes("42.5"), decision.message);
}

console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
