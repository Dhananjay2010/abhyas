#!/usr/bin/env tsx
/**
 * Test: Deload weeks track bests (Task M7)
 *
 * Bests must be recorded regardless of deload status. The deload logic holds
 * the progression target/working weight steady, but best tracking ignores the
 * deload flag.
 *
 *   npx tsx scripts/test-deload-best.ts
 */

import {
  nextBest,
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
  totalSessions: 3,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 60): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const holds = (n: number, seconds: number, w: number | null = null): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps: null, weightKg: w, durationSeconds: seconds }));

console.log("\n1. Pure nextBest function: isolates best tracking");
{
  const prior = { bestWeightKg: 60, bestReps: 12, bestE1rm: 84 };
  const result = nextBest(sets(4, 12, 65), prior, BENCH);
  check("new weight best detected", result.bestWeightKg === 65, `${result.bestWeightKg}`);
  check("personal best reported", result.personalBest?.kind === "weight");
}
{
  const prior = { bestWeightKg: 60, bestReps: 12, bestE1rm: 84 };
  const result = nextBest(sets(4, 12, 60), prior, BENCH);
  check("repeating best claims no record", result.personalBest === null);
  check("best unchanged", result.bestWeightKg === 60);
}

console.log("\n2. Deload session with a new best records it");
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
  check("new best recorded", d.bestWeightKg === 80, `${d.bestWeightKg}`);
  check("personal best reported", d.personalBest?.kind === "weight");
  check("working weight held", d.nextWorkingWeightKg === 60, `${d.nextWorkingWeightKg}`);
  check("no failure counted", d.consecutiveFailures === 0);
}

console.log("\n3. Deload session without a new best leaves it unchanged");
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
  check("outcome is deload_week", d.outcome === "deload_week", d.outcome);
  check("best unchanged", d.bestWeightKg === 60, `${d.bestWeightKg}`);
  check("no personal best claimed", d.personalBest === null);
}

console.log("\n4. Normal week unchanged (regression guard)");
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
  check("outcome progressed", d.outcome === "progressed", d.outcome);
  check("weight advances", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
  check("best tracked", d.bestWeightKg === 60);
}

console.log("\n5. Warm-up sets never count (caller responsibility, but verified)");
{
  // The production path filters warm-up sets before calling evaluateProgression.
  // Here we verify that only working sets (non-zero weight/reps) contribute.
  const prior = { bestWeightKg: 60, bestReps: 12, bestE1rm: 84 };
  const zeroSets: LoggedSet[] = [
    { reps: 0, weightKg: 0 },
    { reps: 12, weightKg: 65 },
  ];
  const result = nextBest(zeroSets, prior, BENCH);
  check("zero-value sets excluded", result.bestWeightKg === 65, `${result.bestWeightKg}`);
}

console.log("\n6. Deload still doesn't advance the progression target");
{
  const d = evaluateProgression({
    sets: sets(4, 12, 80),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60 }),
    isDeload: true,
  });
  check("outcome is deload_week", d.outcome === "deload_week");
  check("working weight unchanged", d.nextWorkingWeightKg === 60);
  check("target reps unchanged", d.nextTargetReps === 12);
  check("but best recorded", d.bestWeightKg === 80);
}

console.log("\n7. Holds track bests during deload");
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
  check("longest hold recorded", d.bestReps === 50, `${d.bestReps}`);
  check("personal best reported", d.personalBest?.kind === "hold");
  check("target unchanged", d.nextTargetReps === 45);
}

console.log("\n8. E1RM best tracked during deload");
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
  check("e1RM improved", (d.bestE1rm ?? 0) > 84, `${d.bestE1rm?.toFixed(1)}`);
  check("personal best reported", d.personalBest?.kind === "e1rm");
}

console.log("\n9. Empty sets do not reset bests");
{
  const prior = { bestWeightKg: 60, bestReps: 12, bestE1rm: 84 };
  const result = nextBest([], prior, BENCH);
  check("bestWeightKg preserved", result.bestWeightKg === 60);
  check("bestReps preserved", result.bestReps === 12);
  check("bestE1rm preserved", result.bestE1rm === 84);
  check("no personal best claimed", result.personalBest === null);
}

console.log("\n10. First session during deload sets baseline");
{
  const d = evaluateProgression({
    sets: sets(4, 12, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ bestWeightKg: null, bestReps: null, bestE1rm: null }),
    isDeload: true,
  });
  check("outcome is deload_week", d.outcome === "deload_week");
  check("best recorded", d.bestWeightKg === 60, `${d.bestWeightKg}`);
  check("no personal best claimed (nothing to beat)", d.personalBest === null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
