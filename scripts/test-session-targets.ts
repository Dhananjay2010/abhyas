/**
 * Test: Session targets resolution
 *
 * Verifies that resolveSessionTargets correctly applies deload and session-length
 * pacing adjustments to planned exercise targets.
 *
 * Key invariants:
 * - Deload sets = max(1, round(sets * 0.6)), never exceeding planned sets
 * - 1-set exercises stay at 1 during deload; 0 stays 0
 * - Session-length pacing (≤45min) reduces sets by 1, floor at 2
 * - Non-deload sessions return planned values (modulo session-length pacing)
 * - Deterministic: same inputs always produce same outputs
 *
 *   npm run test:session-targets
 */
import { readFileSync } from "node:fs";
import {
  resolveSessionTargets,
  type PlannedExercise,
  type SessionContext,
} from "../src/lib/program/session-targets";
import type { CandidateExercise } from "../src/lib/program/generate";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Deload never exceeds normal sets (exhaustive for sets 0-10)");
{
  const cases = [
    { planned: 0, expected: 0 },
    { planned: 1, expected: 1 },
    { planned: 2, expected: 1 },
    { planned: 3, expected: 2 },
    { planned: 4, expected: 2 },
    { planned: 5, expected: 3 },
    { planned: 6, expected: 4 },
    { planned: 7, expected: 4 },
    { planned: 8, expected: 5 },
    { planned: 9, expected: 5 },
    { planned: 10, expected: 6 },
  ];

  for (const { planned, expected } of cases) {
    const result = resolveSessionTargets(
      { target_sets: planned, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
      { isDeload: true },
    );
    check(
      `${planned} sets → ${expected} deload sets`,
      result.sets === expected,
      `got ${result.sets}`,
    );
    check(`${planned} sets: deload ≤ normal`, result.sets <= planned, `${result.sets} > ${planned}`);
  }
}

console.log("\n2. Specific deload cases: 1 stays 1, 5 becomes 3");
{
  const one = resolveSessionTargets(
    { target_sets: 1, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true },
  );
  check("1-set exercise stays at 1 during deload", one.sets === 1, `got ${one.sets}`);

  const five = resolveSessionTargets(
    { target_sets: 5, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true },
  );
  check("5-set exercise becomes 3 during deload", five.sets === 3, `got ${five.sets}`);
}

console.log("\n3. Non-deload sessions return planned values");
{
  const cases = [0, 1, 2, 3, 4, 5, 10];
  for (const sets of cases) {
    const result = resolveSessionTargets(
      { target_sets: sets, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
      { isDeload: false },
    );
    check(`${sets} sets: non-deload unchanged`, result.sets === sets, `got ${result.sets}`);
    check(`reps range preserved`, result.repsMin === 8 && result.repsMax === 12);
    check(`rest preserved`, result.restSeconds === 90);
  }
}

console.log("\n4. Session-length pacing (≤45 minutes) reduces sets");
{
  // Without deload, 45-minute sessions reduce sets by 1 (floor 2)
  const cases = [
    { planned: 2, expected: 2 }, // floor
    { planned: 3, expected: 2 },
    { planned: 4, expected: 3 },
    { planned: 5, expected: 4 },
  ];

  for (const { planned, expected } of cases) {
    const result = resolveSessionTargets(
      { target_sets: planned, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
      { isDeload: false, sessionMinutes: 45 },
    );
    check(
      `45min: ${planned} sets → ${expected} sets`,
      result.sets === expected,
      `got ${result.sets}`,
    );
  }

  // 60-minute sessions do not reduce sets
  const sixty = resolveSessionTargets(
    { target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: false, sessionMinutes: 60 },
  );
  check("60min: sets unchanged", sixty.sets === 4, `got ${sixty.sets}`);

  // 30-minute sessions also reduce (≤45 check)
  const thirty = resolveSessionTargets(
    { target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: false, sessionMinutes: 30 },
  );
  check("30min: 4 sets → 3 sets", thirty.sets === 3, `got ${thirty.sets}`);
}

console.log("\n5. Deload combined with session-length pacing");
{
  // Session-length pacing is applied BEFORE deload scaling
  // 45min: 4 sets → 3 sets (pacing), then 3 → 2 (deload 0.6x)
  const result = resolveSessionTargets(
    { target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true, sessionMinutes: 45 },
  );
  check(
    "45min deload: 4 sets → 3 (pacing) → 2 (deload)",
    result.sets === 2,
    `got ${result.sets}`,
  );

  // But the result must never exceed the paced sets (which become the new normal)
  const paced = resolveSessionTargets(
    { target_sets: 5, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: false, sessionMinutes: 45 },
  );
  const pacedDeload = resolveSessionTargets(
    { target_sets: 5, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true, sessionMinutes: 45 },
  );
  check(
    "45min deload never exceeds paced sets",
    pacedDeload.sets <= paced.sets,
    `paced ${paced.sets}, deload ${pacedDeload.sets}`,
  );
}

console.log("\n6. Determinism: same inputs produce same outputs");
{
  const input: PlannedExercise = {
    target_sets: 4,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  };
  const context: SessionContext = { isDeload: true, sessionMinutes: 45 };

  const results = Array.from({ length: 100 }, () => resolveSessionTargets(input, context));
  const allEqual = results.every(
    (r) =>
      r.sets === results[0].sets &&
      r.repsMin === results[0].repsMin &&
      r.repsMax === results[0].repsMax &&
      r.restSeconds === results[0].restSeconds,
  );
  check("100 identical calls produce identical results", allEqual);
}

console.log("\n7. Invariant sweep: catalogue.json exercises");
{
  const fixture = "scripts/fixtures/catalogue.json";
  const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

  // Test a representative sample of exercises with various set counts
  const setCounts = [1, 2, 3, 4, 5];
  const repRanges = [
    { min: 3, max: 6 },
    { min: 8, max: 12 },
    { min: 12, max: 15 },
  ];

  let tested = 0;
  let allInvariantsHeld = true;

  for (const exercise of catalogue.slice(0, 50)) {
    for (const sets of setCounts) {
      for (const reps of repRanges) {
        const planned: PlannedExercise = {
          target_sets: sets,
          target_reps_min: reps.min,
          target_reps_max: reps.max,
          rest_seconds: exercise.default_rest_seconds,
        };

        // Non-deload: sets unchanged (unless session pacing)
        const normal = resolveSessionTargets(planned, { isDeload: false });
        if (normal.sets !== sets) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${exercise.name} (${sets} sets): non-deload changed sets to ${normal.sets}`,
          );
        }

        // Deload: never exceeds planned
        const deload = resolveSessionTargets(planned, { isDeload: true });
        if (deload.sets > sets) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${exercise.name} (${sets} sets): deload ${deload.sets} > planned ${sets}`,
          );
        }

        // Deload: 1-set stays 1, 0 stays 0
        if (sets === 1 && deload.sets !== 1) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${exercise.name}: 1-set deload became ${deload.sets}`,
          );
        }
        if (sets === 0 && deload.sets !== 0) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${exercise.name}: 0-set deload became ${deload.sets}`,
          );
        }

        // Reps and rest unchanged
        if (
          normal.repsMin !== reps.min ||
          normal.repsMax !== reps.max ||
          deload.repsMin !== reps.min ||
          deload.repsMax !== reps.max
        ) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${exercise.name}: reps changed`,
          );
        }

        tested++;
      }
    }
  }

  check(
    `Tested ${tested} exercise/set/rep combinations`,
    tested === 50 * setCounts.length * repRanges.length,
    `got ${tested}`,
  );
  check("All invariants held across catalogue sweep", allInvariantsHeld);
}

console.log("\n8. Reps and rest are never modified");
{
  const cases = [
    { repsMin: 3, repsMax: 6, rest: 180 },
    { repsMin: 8, repsMax: 12, rest: 90 },
    { repsMin: 12, repsMax: 15, rest: 50 },
    { repsMin: 20, repsMax: 40, rest: 60 }, // hold times
  ];

  for (const { repsMin, repsMax, rest } of cases) {
    const planned: PlannedExercise = {
      target_sets: 4,
      target_reps_min: repsMin,
      target_reps_max: repsMax,
      rest_seconds: rest,
    };

    const normal = resolveSessionTargets(planned, { isDeload: false });
    check(
      `non-deload preserves reps ${repsMin}-${repsMax}`,
      normal.repsMin === repsMin && normal.repsMax === repsMax,
      `got ${normal.repsMin}-${normal.repsMax}`,
    );
    check(`non-deload preserves rest ${rest}s`, normal.restSeconds === rest, `got ${normal.restSeconds}`);

    const deload = resolveSessionTargets(planned, { isDeload: true });
    check(
      `deload preserves reps ${repsMin}-${repsMax}`,
      deload.repsMin === repsMin && deload.repsMax === repsMax,
      `got ${deload.repsMin}-${deload.repsMax}`,
    );
    check(`deload preserves rest ${rest}s`, deload.restSeconds === rest, `got ${deload.restSeconds}`);
  }
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
