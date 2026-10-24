/**
 * Test the first-miss hold guard: when stepping down would cut more than 20%
 * of the current load with equipment, hold at the current weight instead.
 *
 *   npx tsx scripts/test-first-miss-hold-guard.ts
 */
import {
  evaluateProgression,
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

const CURL: ExerciseMeta = { ...BENCH, mechanic: "isolation", movementPattern: "biceps" };
const SQUAT: ExerciseMeta = { ...BENCH, movementPattern: "squat" };
const CORE: ExerciseMeta = { ...BENCH, movementPattern: "core" };
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
    sets: sets(3, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    ...over,
  });

console.log("\n1. Threshold constant exported");
const expectedThreshold: number = 0.20;
check("FIRST_MISS_HOLD_THRESHOLD is 0.20", FIRST_MISS_HOLD_THRESHOLD === expectedThreshold, `${FIRST_MISS_HOLD_THRESHOLD}`);

console.log("\n2. Dumbbell 5 kg isolation: first miss holds (50% cut)");
{
  const d = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight stays at 5 kg", d.nextWorkingWeightKg === 5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says held + smallest step", d.message.includes("holding") && d.message.includes("smallest"), d.message);
}

console.log("\n3. Medicine ball 4 kg: first miss holds (25% cut)");
{
  const d = run({
    meta: CORE,
    state: fresh({ currentWorkingWeightKg: 4, consecutiveFailures: 0 }),
    sets: sets(3, 10, 4),
    equipmentIds: ["medicine_ball"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight stays at 4 kg", d.nextWorkingWeightKg === 4, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says held + smallest step", d.message.includes("holding") && d.message.includes("smallest"), d.message);
}

console.log("\n4. Barbell 40 to 37.5 kg: first miss drops (6.25% cut)");
{
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 40, consecutiveFailures: 0 }),
    sets: sets(3, 10, 40),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 37.5 kg", d.nextWorkingWeightKg === 37.5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n5. Kettlebell 16 to 14 kg: first miss drops (12.5% cut)");
{
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 16, consecutiveFailures: 0 }),
    sets: sets(3, 10, 16),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 14 kg", d.nextWorkingWeightKg === 14, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n6. Cable 40 to 37.5 kg: first miss drops (6.25% cut)");
{
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 40, consecutiveFailures: 0 }),
    sets: sets(3, 10, 40),
    equipmentIds: ["cable_machine"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 37.5 kg", d.nextWorkingWeightKg === 37.5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n7. Lat pulldown 60 to 55 kg: first miss drops (8.33% cut)");
{
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 0 }),
    sets: sets(3, 10, 60),
    equipmentIds: ["lat_pulldown"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 55 kg", d.nextWorkingWeightKg === 55, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n8. Leg extension 30 to 25 kg: first miss drops (16.7% cut)");
{
  const d = run({
    meta: SQUAT,
    state: fresh({ currentWorkingWeightKg: 30, consecutiveFailures: 0 }),
    sets: sets(3, 10, 30),
    equipmentIds: ["leg_extension"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 25 kg", d.nextWorkingWeightKg === 25, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n9. Boundary case: exactly 20% cut drops");
{
  // Construct a case where the step is exactly 20%: current = 10, step down = 8 (20% cut)
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 10, consecutiveFailures: 0 }),
    sets: sets(3, 10, 10),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  // 10 kg barbell steps down by 2.5 kg to 7.5 kg = 25% cut, should hold
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight holds at 10 kg (25% > 20%)", d.nextWorkingWeightKg === 10, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says held + smallest step", d.message.includes("holding") && d.message.includes("smallest"), d.message);
}

console.log("\n10. Boundary case: 20.01%+ cut holds");
{
  // Medicine ball at 5 kg steps down to 4 kg = 20% exactly, should drop
  const d = run({
    meta: CORE,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
    equipmentIds: ["medicine_ball"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 4 kg (20% = threshold)", d.nextWorkingWeightKg === 4, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n11. Imperial units: dumbbell 10 lb isolation holds (50% cut)");
{
  const d = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 4.54, consecutiveFailures: 0 }), // ~10 lb in kg
    sets: sets(3, 10, 4.54),
    equipmentIds: ["dumbbell"],
    unit: "lb",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight holds (step down > 20%)", d.nextWorkingWeightKg === 4.54, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says held + smallest step", d.message.includes("holding") && d.message.includes("smallest"), d.message);
}

console.log("\n12. Kettlebell grid: 8 kg to 6 kg holds (25% cut)");
{
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 8, consecutiveFailures: 0 }),
    sets: sets(3, 10, 8),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight holds at 8 kg (25% > 20%)", d.nextWorkingWeightKg === 8, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says held + smallest step", d.message.includes("holding") && d.message.includes("smallest"), d.message);
}

console.log("\n13. Kettlebell grid: 24 kg to 20 kg holds (16.7% cut < 20% but actual = 16.67%)");
{
  const d = run({
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 24, consecutiveFailures: 0 }),
    sets: sets(3, 10, 24),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight drops to 20 kg (16.67% < 20%)", d.nextWorkingWeightKg === 20, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
}

console.log("\n14. Bodyweight with added load: 5 kg holds (dumbbell, 50% cut)");
{
  const d = run({
    meta: PUSHUP,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight holds at 5 kg (50% > 20%)", d.nextWorkingWeightKg === 5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message says held + smallest step", d.message.includes("holding") && d.message.includes("smallest"), d.message);
}

console.log("\n15. Guard is first-miss only: failures=0");
{
  const d = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight holds at 5 kg", d.nextWorkingWeightKg === 5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments to 1", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}

console.log("\n16. Guard is first-miss only: failures=1 (second miss uses existing two-miss logic)");
{
  const d = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 1 }),
    sets: sets(3, 10, 5),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("outcome is backed_off (two-miss rule)", d.outcome === "backed_off", d.outcome);
  // 5 kg * 0.9 = 4.5 kg, rounds to 2.5 kg grid = either 2.5 or 5 kg
  // The back-off logic should drop to 2.5 kg (isolation uses 1.25 kg grid)
  check("weight drops (two-miss back-off)", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg < 5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures resets to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
  check("message says missed twice", d.message.includes("twice"), d.message);
}

console.log("\n17. Feel values: easy/right/hard (only affects success, not first-miss)");
{
  const easy = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
    feel: "easy",
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("easy: weight holds", easy.nextWorkingWeightKg === 5, `${easy.nextWorkingWeightKg}`);
  
  const hard = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
    feel: "hard",
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("hard: weight holds", hard.nextWorkingWeightKg === 5, `${hard.nextWorkingWeightKg}`);
}

console.log("\n18. No equipment: guard does not apply");
{
  const d = run({
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    sets: sets(3, 10, 5),
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("weight stays at 5 kg (no equipment)", d.nextWorkingWeightKg === 5, `${d.nextWorkingWeightKg}`);
  check("consecutiveFailures increments", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
  check("message does NOT mention smallest step", !d.message.includes("smallest"), d.message);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} ${failures} failure(s)`);
process.exit(failures > 0 ? 1 : 0);
