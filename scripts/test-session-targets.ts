/**
 * Test: Session targets resolution
 *
 * Verifies that resolveSessionTargets correctly applies deload reductions to
 * planned exercise targets by calling applyDeload.
 *
 * Key invariants:
 * - Deload sets = min(sets, max(2, round(sets * 0.6)))
 * - 0 stays 0, 1 stays 1, 2 stays 2, 5 becomes 3
 * - Deload sets never exceed planned sets
 * - Non-deload sessions return planned values exactly
 * - Helper output equals applyDeload output for all cases
 *
 *   npm run test:session-targets
 */
import { readFileSync } from "node:fs";
import {
  resolveSessionTargets,
  type PlannedExercise,
} from "../src/lib/program/session-targets";
import { applyDeload, type Prescription } from "../src/lib/program/prescription";
import {
  generateProgram,
  type GeneratorInput,
} from "../src/lib/program/generate";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Direct applyDeload tests: exhaustive for sets 0-10");
{
  const cases = [
    { sets: 0, expected: 0 },
    { sets: 1, expected: 1 },
    { sets: 2, expected: 2 },
    { sets: 3, expected: 2 },
    { sets: 4, expected: 2 },
    { sets: 5, expected: 3 },
    { sets: 6, expected: 4 },
    { sets: 7, expected: 4 },
    { sets: 8, expected: 5 },
    { sets: 9, expected: 5 },
    { sets: 10, expected: 6 },
  ];

  for (const { sets, expected } of cases) {
    const p: Prescription = { sets, repsMin: 8, repsMax: 12, restSeconds: 90 };
    const result = applyDeload(p);
    check(
      `applyDeload: ${sets} sets → ${expected} sets`,
      result.sets === expected,
      `got ${result.sets}`,
    );
    check(`applyDeload: ${sets} sets never exceeds planned`, result.sets <= sets, `${result.sets} > ${sets}`);
  }
}

console.log("\n2. Mutation testing: bad applyDeload implementations fail");
{
  // Test that would FAIL if applyDeload used the old Math.max(2, ...) without the min clamp
  const oneSet: Prescription = { sets: 1, repsMin: 8, repsMax: 12, restSeconds: 90 };
  const oneResult = applyDeload(oneSet);
  check(
    "Mutation test: 1-set exercise stays at 1 (kills old max(2, ...) rule)",
    oneResult.sets === 1,
    `got ${oneResult.sets}`,
  );

  // Test that would FAIL if applyDeload forgot the min clamp and could exceed planned
  const twoSet: Prescription = { sets: 2, repsMin: 8, repsMax: 12, restSeconds: 90 };
  const twoResult = applyDeload(twoSet);
  check(
    "Mutation test: 2-set exercise stays at 2 (kills unguarded round(2*0.6)=1)",
    twoResult.sets === 2,
    `got ${twoResult.sets}`,
  );

  // Test that would FAIL if applyDeload returned sets + 5
  const fiveSet: Prescription = { sets: 5, repsMin: 8, repsMax: 12, restSeconds: 90 };
  const fiveResult = applyDeload(fiveSet);
  check(
    "Mutation test: 5 sets → 3 sets (kills sets+5 or any addition)",
    fiveResult.sets === 3,
    `got ${fiveResult.sets}`,
  );
  check(
    "Mutation test: deload result ≤ planned (kills sets+N)",
    fiveResult.sets <= 5,
    `${fiveResult.sets} > 5`,
  );
}

console.log("\n3. resolveSessionTargets with no deload returns planned values exactly");
{
  const cases = [
    { sets: 0, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 1, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 2, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 4, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 5, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 10, repsMin: 8, repsMax: 12, rest: 90 },
    { sets: 4, repsMin: 3, repsMax: 6, rest: 180 },
    { sets: 3, repsMin: 12, repsMax: 15, rest: 50 },
  ];

  for (const { sets, repsMin, repsMax, rest } of cases) {
    const planned: PlannedExercise = {
      target_sets: sets,
      target_reps_min: repsMin,
      target_reps_max: repsMax,
      rest_seconds: rest,
    };
    const result = resolveSessionTargets(planned, { isDeload: false });
    check(
      `no deload: ${sets} sets unchanged`,
      result.sets === sets,
      `got ${result.sets}`,
    );
    check(
      `no deload: reps ${repsMin}-${repsMax} unchanged`,
      result.repsMin === repsMin && result.repsMax === repsMax,
      `got ${result.repsMin}-${result.repsMax}`,
    );
    check(
      `no deload: rest ${rest}s unchanged`,
      result.restSeconds === rest,
      `got ${result.restSeconds}`,
    );
  }
}

console.log("\n4. resolveSessionTargets with deload: output ≤ planned for all inputs");
{
  for (let sets = 0; sets <= 10; sets++) {
    const planned: PlannedExercise = {
      target_sets: sets,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    };
    const result = resolveSessionTargets(planned, { isDeload: true });
    check(
      `deload: ${sets} sets result ≤ planned`,
      result.sets <= sets,
      `${result.sets} > ${sets}`,
    );
  }

  // Specific cases from the exhaustive table
  const one = resolveSessionTargets(
    { target_sets: 1, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true },
  );
  check("deload: 1 set stays at 1", one.sets === 1, `got ${one.sets}`);

  const two = resolveSessionTargets(
    { target_sets: 2, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true },
  );
  check("deload: 2 sets stays at 2", two.sets === 2, `got ${two.sets}`);

  const five = resolveSessionTargets(
    { target_sets: 5, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    { isDeload: true },
  );
  check("deload: 5 sets becomes 3", five.sets === 3, `got ${five.sets}`);
}

console.log("\n5. Helper equals applyDeload for every case");
{
  for (let sets = 0; sets <= 10; sets++) {
    const planned: PlannedExercise = {
      target_sets: sets,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    };
    const helperResult = resolveSessionTargets(planned, { isDeload: true });
    const directResult = applyDeload({
      sets,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
    });
    check(
      `${sets} sets: helper equals applyDeload`,
      helperResult.sets === directResult.sets &&
        helperResult.repsMin === directResult.repsMin &&
        helperResult.repsMax === directResult.repsMax &&
        helperResult.restSeconds === directResult.restSeconds,
      `helper ${helperResult.sets}, direct ${directResult.sets}`,
    );
  }
}

console.log("\n6. Reps and rest are never modified");
{
  const cases = [
    { repsMin: 3, repsMax: 6, rest: 180 },
    { repsMin: 8, repsMax: 12, rest: 90 },
    { repsMin: 12, repsMax: 15, rest: 50 },
    { repsMin: 20, repsMax: 40, rest: 60 },
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

console.log("\n7. Invariant over real generateProgram output: profile matrix");
{
  const fixture = "scripts/fixtures/catalogue.json";
  const catalogue = JSON.parse(readFileSync(fixture, "utf8"));

  const profiles: GeneratorInput[] = [
    {
      userId: "test-user",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 23,
      hasAllEquipment: true,
      equipmentIds: [],
      currentInjuryRegions: [],
      catalogue,
    },
    {
      userId: "test-user",
      blockNumber: 1,
      goal: "strength",
      level: "beginner",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 25,
      bmi: 22,
      hasAllEquipment: true,
      equipmentIds: [],
      currentInjuryRegions: [],
      catalogue,
    },
    {
      userId: "test-user",
      blockNumber: 1,
      goal: "fat_loss",
      level: "intermediate",
      primaryTrack: "bodyweight",
      daysPerWeek: 5,
      yogaDaysPerWeek: 1,
      age: 40,
      bmi: 28,
      hasAllEquipment: false,
      equipmentIds: [],
      currentInjuryRegions: [],
      catalogue,
    },
  ];

  let testedRows = 0;
  let allInvariantsHeld = true;

  for (const input of profiles) {
    const plan = generateProgram(input);
    for (const day of plan.days) {
      if (day.dayType !== "weights") continue;

      for (const ex of day.exercises) {
        const planned: PlannedExercise = {
          target_sets: ex.targetSets,
          target_reps_min: ex.targetRepsMin,
          target_reps_max: ex.targetRepsMax,
          rest_seconds: ex.restSeconds,
        };

        // Non-deload: output equals planned exactly
        const normal = resolveSessionTargets(planned, { isDeload: false });
        if (
          normal.sets !== ex.targetSets ||
          normal.repsMin !== ex.targetRepsMin ||
          normal.repsMax !== ex.targetRepsMax ||
          normal.restSeconds !== ex.restSeconds
        ) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${input.goal}/${input.level}/${day.label}: non-deload changed planned`,
          );
        }

        // Deload: output ≤ planned
        const deload = resolveSessionTargets(planned, { isDeload: true });
        if (deload.sets > ex.targetSets) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${input.goal}/${input.level}/${day.label}: deload ${deload.sets} > planned ${ex.targetSets}`,
          );
        }

        // Specific invariants for edge cases
        if (ex.targetSets === 0 && deload.sets !== 0) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${input.goal}/${input.level}/${day.label}: 0-set deload became ${deload.sets}`,
          );
        }
        if (ex.targetSets === 1 && deload.sets !== 1) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${input.goal}/${input.level}/${day.label}: 1-set deload became ${deload.sets}`,
          );
        }
        if (ex.targetSets === 2 && deload.sets !== 2) {
          allInvariantsHeld = false;
          console.log(
            `    FAIL: ${input.goal}/${input.level}/${day.label}: 2-set deload became ${deload.sets}`,
          );
        }

        testedRows++;
      }
    }
  }

  check(
    `Tested ${testedRows} planned exercise rows from generateProgram`,
    testedRows > 0,
    `got ${testedRows}`,
  );
  check("All invariants held across profile matrix", allInvariantsHeld);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
