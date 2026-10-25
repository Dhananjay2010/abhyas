/**
 * Test in-range session handling: all sets >= repsMin but not all at repsMax.
 * SPEC §Progression: "All prescribed sets completed and every set's reps >= repsMin 
 * (in range), but not all at the top: HOLD the weight and reset consecutiveFailures to 0."
 *
 * Bug: evaluateProgression counted any session not at the top as a failure,
 * so two normal in-range sessions triggered the stall rule (~10% deload).
 * 
 * Examples from QA:
 * - Bench 4×10@40 on 8-12 target → backed_off 35 kg (-12.5%)
 * - 4×11 → same
 * - Press 10/10/10/8@30 hard → backed_off 25 kg (-17%)
 *
 *   npx tsx scripts/test-progression-in-range-hold.ts
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

const PRESS: ExerciseMeta = { 
  ...BENCH, 
  movementPattern: "vertical_press",
};

const SQUAT: ExerciseMeta = { 
  ...BENCH, 
  movementPattern: "squat",
};

const TRICEPS: ExerciseMeta = {
  ...BENCH,
  mechanic: "isolation",
  movementPattern: "triceps",
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
  currentWorkingWeightKg: 40,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 40,
  bestReps: 12,
  bestE1rm: 56,
  totalSessions: 1, weightAtFailureStartKg: null,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 40) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const mixed = (reps: number[], w: number = 40) =>
  reps.map((r) => ({ reps: r, weightKg: w }));

const holds = (n: number, seconds: number, w: number | null = null) =>
  Array.from({ length: n }, () => ({ reps: null, weightKg: w, durationSeconds: seconds }));

const run = (over: Partial<Parameters<typeof evaluateProgression>[0]> = {}) =>
  evaluateProgression({
    sets: sets(4, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    equipmentIds: ["barbell"],
    
    ...over,
  });

console.log("\n1. In-range sessions (all sets >= repsMin, not all at top): HOLD and reset failures");
{
  // 10 reps in 8-12 range: in range, not at top
  const d = run();
  check("4×10 in 8-12: outcome hold", d.outcome === "hold", d.outcome);
  check("4×10: weight held at 40 kg", d.nextWorkingWeightKg === 40, `${d.nextWorkingWeightKg}`);
  check("4×10: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
  check("4×10: message says stay at this weight", 
    d.message.includes("Staying at this weight"), d.message);
}

{
  // 11 reps: also in range
  const d = run({ sets: sets(4, 11) });
  check("4×11 in 8-12: outcome hold", d.outcome === "hold", d.outcome);
  check("4×11: weight held", d.nextWorkingWeightKg === 40, `${d.nextWorkingWeightKg}`);
  check("4×11: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}

{
  // 8 reps (at repsMin): in range
  const d = run({ sets: sets(4, 8) });
  check("4×8 in 8-12: outcome hold", d.outcome === "hold", d.outcome);
  check("4×8: weight held", d.nextWorkingWeightKg === 40, `${d.nextWorkingWeightKg}`);
  check("4×8: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}

{
  // Mixed in range: 10/10/10/9
  const d = run({ sets: mixed([10, 10, 10, 9]) });
  check("10/10/10/9: outcome hold", d.outcome === "hold", d.outcome);
  check("10/10/10/9: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}

console.log("\n2. All sets at top (repsMax): INCREASE weight");
{
  const d = run({ sets: sets(4, 12) });
  check("4×12: outcome progressed", d.outcome === "progressed", d.outcome);
  check("4×12: weight increases 40 -> 42.5", d.nextWorkingWeightKg === 42.5, `${d.nextWorkingWeightKg}`);
  check("4×12: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}

console.log("\n3. MISS: sets incomplete or any set below repsMin");
{
  // 7 reps: below min
  const d = run({ sets: sets(4, 7) });
  check("4×7 below min: outcome hold", d.outcome === "hold", d.outcome);
  check("4×7: failures increment to 1", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("4×7: weight drops one grid step to 37.5", d.nextWorkingWeightKg === 37.5, `${d.nextWorkingWeightKg}`);
}

{
  // One set below min: 10/10/10/7
  const d = run({ sets: mixed([10, 10, 10, 7]) });
  check("10/10/10/7 (one below min): outcome hold", d.outcome === "hold", d.outcome);
  check("10/10/10/7: failures increment to 1", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}

{
  // Incomplete sets: only 3 of 4
  const d = run({ sets: sets(3, 10) });
  check("3×10 (incomplete): outcome hold", d.outcome === "hold", d.outcome);
  check("3×10: failures increment to 1", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}

console.log("\n4. Two consecutive real misses: deload about 10%");
{
  // First miss: 7 reps
  const firstMiss = run({ sets: sets(4, 7) });
  check("First miss 4×7: failures = 1", firstMiss.consecutiveFailures === 1);
  
  // Second miss: 7 reps again with failures=1
  const secondMiss = run({ 
    sets: sets(4, 7), 
    state: fresh({ consecutiveFailures: 1 }),
  });
  check("Second miss: outcome backed_off", secondMiss.outcome === "backed_off", secondMiss.outcome);
  check("Second miss: 40 -> 35 kg (-12.5%, ~10% after rounding)", 
    secondMiss.nextWorkingWeightKg === 35, `${secondMiss.nextWorkingWeightKg}`);
  check("Second miss: failures reset to 0", secondMiss.consecutiveFailures === 0);
  check("Second miss: message says 'twice in a row'", 
    secondMiss.message.includes("twice in a row"), secondMiss.message);
}

{
  // Press example from QA: 30 kg, two misses
  const d = run({
    meta: PRESS,
    sets: sets(4, 7, 30),
    state: fresh({ currentWorkingWeightKg: 30, consecutiveFailures: 1 }),
  });
  check("Press 30 kg two misses: backed_off", d.outcome === "backed_off", d.outcome);
  check("Press 30 kg: deloads to 25 kg (-16.7%, ~10% after rounding)", 
    d.nextWorkingWeightKg === 25, `${d.nextWorkingWeightKg}`);
}

console.log("\n5. One miss then in-range: failures reset, no deload");
{
  // First miss
  const firstMiss = run({ sets: sets(4, 7) });
  check("Setup: first miss gives failures=1", firstMiss.consecutiveFailures === 1);
  
  // Then an in-range session
  const inRange = run({ 
    sets: sets(4, 10), 
    state: fresh({ consecutiveFailures: 1 }),
  });
  check("After in-range: outcome hold", inRange.outcome === "hold", inRange.outcome);
  check("After in-range: failures reset to 0", inRange.consecutiveFailures === 0);
  check("After in-range: no deload (stays at 40)", inRange.nextWorkingWeightKg === 40, 
    `${inRange.nextWorkingWeightKg}`);
}

console.log("\n6. Hard feel + in-range: does NOT deload or count as miss");
{
  // Hard with all sets in range
  const d = run({ sets: sets(4, 10), feel: "hard" });
  check("Hard + 4×10: outcome hold", d.outcome === "hold", d.outcome);
  check("Hard + 4×10: failures reset to 0 (not incremented)", d.consecutiveFailures === 0, 
    `${d.consecutiveFailures}`);
  check("Hard + 4×10: weight held at 40", d.nextWorkingWeightKg === 40, `${d.nextWorkingWeightKg}`);
}

{
  // Hard with all sets at top: holds per SPEC §Progression "hard holds it"
  const d = run({ sets: sets(4, 12), feel: "hard" });
  check("Hard + 4×12 (all at top): outcome hold", d.outcome === "hold", d.outcome);
  check("Hard + all at top: weight held at 40", d.nextWorkingWeightKg === 40);
  check("Hard + all at top: failures reset to 0", d.consecutiveFailures === 0);
  check("Hard + all at top: message says 'felt hard'", 
    d.message.includes("felt hard"), d.message);
}

{
  // Hard does NOT block in-range reset
  const d = run({ 
    sets: sets(4, 10), 
    feel: "hard",
    state: fresh({ consecutiveFailures: 1 }),
  });
  check("Hard + in-range with failures=1: failures reset to 0", d.consecutiveFailures === 0);
  check("Hard + in-range: no deload", d.nextWorkingWeightKg === 40);
}

console.log("\n7. Accessory and compound behave the same");
{
  // Compound (Squat)
  const compound = run({
    meta: SQUAT,
    sets: sets(4, 10, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
  });
  check("Squat 4×10 in-range: outcome hold", compound.outcome === "hold", compound.outcome);
  check("Squat: failures reset to 0", compound.consecutiveFailures === 0);
  
  // Isolation (Triceps)
  const isolation = run({
    meta: TRICEPS,
    sets: sets(3, 10, 15),
    plannedSets: 3,
    state: fresh({ currentWorkingWeightKg: 15 }),
  });
  check("Triceps 3×10 in-range: outcome hold", isolation.outcome === "hold", isolation.outcome);
  check("Triceps: failures reset to 0", isolation.consecutiveFailures === 0);
}

console.log("\n8. Timed exercises (seconds) follow same min/top logic");
{
  // 30s holds in 20-45s range: in range, not at top
  const d = evaluateProgression({
    sets: holds(2, 30),
    plannedSets: 2,
    repsMin: 20,
    repsMax: 45,
    feel: "right",
    meta: PLANK,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 }),
    isDeload: false,
    equipmentIds: [],
    
  });
  check("Plank 2×30s in 20-45s: outcome hold", d.outcome === "hold", d.outcome);
  check("Plank 30s: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
  check("Plank: message says 'stay at this length'", 
    d.message.includes("at this"), d.message);
}

{
  // All at top: 45s
  const d = evaluateProgression({
    sets: holds(2, 45),
    plannedSets: 2,
    repsMin: 20,
    repsMax: 45,
    feel: "right",
    meta: PLANK,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 }),
    isDeload: false,
    equipmentIds: [],
    
  });
  check("Plank 2×45s (all at top): outcome progressed", d.outcome === "progressed", d.outcome);
  check("Plank 45s: target increases to 50s", d.nextTargetReps === 50, `${d.nextTargetReps}`);
  check("Plank 45s: failures reset to 0", d.consecutiveFailures === 0);
}

{
  // Below min: 15s
  const d = evaluateProgression({
    sets: holds(2, 15),
    plannedSets: 2,
    repsMin: 20,
    repsMax: 45,
    feel: "right",
    meta: PLANK,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 }),
    isDeload: false,
    equipmentIds: [],
    
  });
  check("Plank 2×15s (below min): outcome hold", d.outcome === "hold", d.outcome);
  check("Plank 15s: failures increment to 1", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}

console.log("\n9. Re-derivation: stored failures=1 from in-range session isn't acted on");
{
  // This tests the application logic that re-derives failure counts.
  // Here we test that the progression logic itself handles the reset correctly.
  // The in-range case with stored failures=1 should reset to 0.
  
  const d = run({ 
    sets: sets(4, 10),
    state: fresh({ consecutiveFailures: 1 }), // Stored incorrect failure from previous in-range
  });
  check("In-range with stored failures=1: failures reset to 0", d.consecutiveFailures === 0, 
    `${d.consecutiveFailures}`);
  check("Stored failures=1 + in-range: no deload", d.nextWorkingWeightKg === 40, 
    `${d.nextWorkingWeightKg}`);
  check("Stored failures corrected: outcome hold", d.outcome === "hold", d.outcome);
}

{
  // Verify a real miss after stored wrong failure doesn't trigger two-miss deload
  // First: in-range with failures=1 → resets to 0
  // Then: real miss → failures=1
  // Not a two-miss deload
  const afterReset = run({
    sets: sets(4, 7), // Real miss
    state: fresh({ consecutiveFailures: 0 }), // After in-range reset
  });
  check("Real miss after reset: failures = 1", afterReset.consecutiveFailures === 1);
  check("Real miss after reset: outcome hold (not backed_off)", afterReset.outcome === "hold", 
    afterReset.outcome);
  check("Real miss after reset: first-miss drop to 37.5", afterReset.nextWorkingWeightKg === 37.5, 
    `${afterReset.nextWorkingWeightKg}`);
}

console.log("\n10. Regression cases from QA report");
{
  // Bench 4×10@40 on 8-12 (QA example)
  const bench = run({
    sets: sets(4, 10, 40),
    state: fresh({ currentWorkingWeightKg: 40, consecutiveFailures: 0 }),
  });
  check("QA Bench 4×10@40: NOT backed_off", bench.outcome !== "backed_off", bench.outcome);
  check("QA Bench: stays at 40 kg (not 35)", bench.nextWorkingWeightKg === 40, 
    `${bench.nextWorkingWeightKg}`);
  check("QA Bench: failures = 0", bench.consecutiveFailures === 0);
}

{
  // Press 10/10/10/8@30 marked hard (QA example)
  const press = run({
    meta: PRESS,
    sets: mixed([10, 10, 10, 8], 30),
    feel: "hard",
    state: fresh({ currentWorkingWeightKg: 30, consecutiveFailures: 0 }),
  });
  check("QA Press 10/10/10/8 hard: NOT backed_off", press.outcome !== "backed_off", press.outcome);
  check("QA Press: stays at 30 kg (not 25)", press.nextWorkingWeightKg === 30, 
    `${press.nextWorkingWeightKg}`);
  check("QA Press: failures = 0", press.consecutiveFailures === 0);
}

{
  // Simulate the bug: second in-range session with wrong stored failures=1
  const bugScenario = run({
    sets: sets(4, 10),
    state: fresh({ consecutiveFailures: 1 }), // Wrong! Should be 0 from first in-range
  });
  check("Bug scenario: in-range resets failures (fix applied)", 
    bugScenario.consecutiveFailures === 0, `${bugScenario.consecutiveFailures}`);
  check("Bug scenario: no deload (fix applied)", 
    bugScenario.nextWorkingWeightKg === 40, `${bugScenario.nextWorkingWeightKg}`);
}

console.log("\n11. Edge cases: incomplete sets with mixed reps");
{
  // 3 sets (incomplete), all in range
  const d = run({ sets: mixed([10, 11, 10]) });
  check("3×10-11 (incomplete): outcome hold", d.outcome === "hold", d.outcome);
  check("3×10-11: failures increment (incomplete counts as miss)", d.consecutiveFailures === 1);
}

{
  // 4 sets, one below min in the middle
  const d = run({ sets: mixed([10, 7, 10, 10]) });
  check("10/7/10/10 (one below): outcome hold", d.outcome === "hold", d.outcome);
  check("10/7/10/10: failures increment", d.consecutiveFailures === 1);
}

console.log("\n12. Deload weeks don't increment failures");
{
  // In-range during deload
  const d = run({ sets: sets(4, 10), isDeload: true });
  check("Deload 4×10: outcome deload_week", d.outcome === "deload_week", d.outcome);
  check("Deload: failures = 0", d.consecutiveFailures === 0);
  
  // Below min during deload
  const low = run({ sets: sets(4, 7), isDeload: true });
  check("Deload 4×7: outcome deload_week", low.outcome === "deload_week", low.outcome);
  check("Deload low: failures = 0", low.consecutiveFailures === 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
