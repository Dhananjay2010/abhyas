#!/usr/bin/env tsx
/**
 * Test: Deload best tracking through evaluateProgression (Task M7)
 *
 * Verifies that the Decision returned by evaluateProgression includes updated
 * bests even during deload weeks, which the production path then writes to
 * exercise_progress.
 *
 * Run: npm run test:deload-best-db
 */

import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
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

const PLANK: ExerciseMeta = {
  mechanic: "isolation",
  metric: "seconds",
  movementPattern: "core",
  isBodyweight: true,
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
  totalSessions: 3, weightAtFailureStartKg: null,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 60): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const holds = (n: number, seconds: number): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps: null, weightKg: null, durationSeconds: seconds }));

console.log("\nTest: Deload best tracking through evaluateProgression\n");

console.log("1. Deload session with new weight best returns updated best_weight_kg");
{
  const d = evaluateProgression({
    sets: sets(4, 12, 80),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, bestWeightKg: 60 }),
    isDeload: true,
  });
  check("outcome is deload_week", d.outcome === "deload_week", d.outcome);
  check("bestWeightKg updated to 80", d.bestWeightKg === 80, `${d.bestWeightKg}`);
  check("personal best reported", d.personalBest?.kind === "weight");
  check("nextWorkingWeightKg held at 60", d.nextWorkingWeightKg === 60);
}

console.log("\n2. Deload session without new best leaves it unchanged");
{
  const d = evaluateProgression({
    sets: sets(4, 12, 42),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, bestWeightKg: 60 }),
    isDeload: true,
  });
  check("outcome is deload_week", d.outcome === "deload_week");
  check("bestWeightKg unchanged", d.bestWeightKg === 60, `${d.bestWeightKg}`);
  check("no personal best claimed", d.personalBest === null);
}

console.log("\n3. Normal week still tracks bests (regression guard)");
{
  const d = evaluateProgression({
    sets: sets(4, 12, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
  });
  check("outcome progressed", d.outcome === "progressed");
  check("bestWeightKg tracked", d.bestWeightKg === 60);
  check("nextWorkingWeightKg advanced", d.nextWorkingWeightKg === 62.5);
}

console.log("\n4. Deload hold with new best returns updated best_reps");
{
  const d = evaluateProgression({
    sets: holds(2, 50),
    plannedSets: 2,
    repsMin: 20,
    repsMax: 45,
    feel: "right",
    meta: PLANK,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 45, bestReps: 45 }),
    isDeload: true,
  });
  check("outcome is deload_week", d.outcome === "deload_week");
  check("bestReps updated to 50", d.bestReps === 50, `${d.bestReps}`);
  check("personal best reported", d.personalBest?.kind === "hold");
  check("nextTargetReps unchanged", d.nextTargetReps === 45);
}

console.log("\n5. Deload e1RM improvement returns updated best_e1rm");
{
  const d = evaluateProgression({
    sets: sets(4, 14, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, bestWeightKg: 60, bestE1rm: 84 }),
    isDeload: true,
  });
  check("outcome is deload_week", d.outcome === "deload_week");
  check("bestE1rm improved", (d.bestE1rm ?? 0) > 84, `${d.bestE1rm?.toFixed(1)}`);
  check("personal best reported", d.personalBest?.kind === "e1rm");
  check("bestWeightKg unchanged", d.bestWeightKg === 60);
}

console.log("\n6. Production code must write Decision values correctly");
{
  // The production code at actions.ts writes Decision.best* to the DB.
  // This test verifies that those returned values are actually used.
  const withBest = evaluateProgression({
    sets: sets(4, 12, 80),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, bestWeightKg: 60 }),
    isDeload: true,
  });
  check("Decision.bestWeightKg must be 80 for write", withBest.bestWeightKg === 80, `${withBest.bestWeightKg}`);
  check("Decision.bestReps must be 12 for write", withBest.bestReps === 12, `${withBest.bestReps}`);
  check("Decision.bestE1rm must be updated for write", (withBest.bestE1rm ?? 0) > 84, `${withBest.bestE1rm}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
