#!/usr/bin/env tsx
/**
 * Test: writeExerciseProgressCore writes bests during deload (M7 Mutant 3 guard)
 *
 * Fake-client test of the real progress write path. Asserts the upserted
 * exercise_progress row has the new best_* values for a deload session.
 *
 * Run: npm run test:write-progress
 */

import {
  writeExerciseProgressCore,
  type ProgressClient,
  type ProgressWrite,
} from "../src/lib/session/write-progress";
import type { Decision } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeClient(): { client: ProgressClient; getWritten: () => ProgressWrite | null } {
  let written: ProgressWrite | null = null;

  const client: ProgressClient = {
    from: (table: string) => ({
      upsert: async (data: Record<string, unknown>, opts: { onConflict: string }) => {
        written = data as ProgressWrite;
        return { data: null, error: null };
      },
    }),
  };

  return {
    client,
    getWritten: () => written,
  };
}

console.log("\nTest: writeExerciseProgressCore during deload\n");

async function main() {
  console.log("1. Deload session with Squat 80x12 new best writes best_weight_kg");
  {
  const fake = createFakeClient();
  const decision: Decision = {
    outcome: "deload_week",
    nextWorkingWeightKg: 60,
    nextTargetReps: 12,
    consecutiveFailures: 0,
    wantsHarderVariation: false,
    bestWeightKg: 80,
    bestReps: 12,
    bestE1rm: 112,
    personalBest: { kind: "weight", value: 80 },
    message: "Deload week — weights held where they were.",
  };

  await writeExerciseProgressCore(
    fake.client,
    "user-1",
    "ex-squat",
    decision,
    5,
    "2026-10-24",
  );

  const written = fake.getWritten();
  check("row was written", written !== null);
  check("best_weight_kg is 80", written?.best_weight_kg === 80, `${written?.best_weight_kg}`);
  check("best_reps is 12", written?.best_reps === 12, `${written?.best_reps}`);
  check("best_e1rm is 112", written?.best_e1rm === 112, `${written?.best_e1rm}`);
  check("current_working_weight_kg held at 60", written?.current_working_weight_kg === 60);
  check("total_sessions incremented", written?.total_sessions === 6);
  }

  console.log("\n2. Deload session without new best leaves it unchanged");
  {
  const fake = createFakeClient();
  const decision: Decision = {
    outcome: "deload_week",
    nextWorkingWeightKg: 60,
    nextTargetReps: 12,
    consecutiveFailures: 0,
    wantsHarderVariation: false,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: 84,
    personalBest: null,
    message: "Deload week — weights held where they were.",
  };

  await writeExerciseProgressCore(
    fake.client,
    "user-1",
    "ex-bench",
    decision,
    3,
    "2026-10-24",
  );

  const written = fake.getWritten();
  check("best_weight_kg unchanged", written?.best_weight_kg === 60);
  check("best_reps unchanged", written?.best_reps === 12);
  check("best_e1rm unchanged", written?.best_e1rm === 84);
  }

  console.log("\n3. Normal week progression writes bests");
  {
  const fake = createFakeClient();
  const decision: Decision = {
    outcome: "progressed",
    nextWorkingWeightKg: 62.5,
    nextTargetReps: 12,
    consecutiveFailures: 0,
    wantsHarderVariation: false,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: 84,
    personalBest: null,
    message: "All sets at the top of the range — up to 62.5 kg.",
  };

  await writeExerciseProgressCore(
    fake.client,
    "user-1",
    "ex-press",
    decision,
    2,
    "2026-10-24",
  );

  const written = fake.getWritten();
  check("best_weight_kg written", written?.best_weight_kg === 60);
  check("current_working_weight_kg advanced", written?.current_working_weight_kg === 62.5);
  }

  console.log("\n4. Hold with best_reps during deload");
  {
  const fake = createFakeClient();
  const decision: Decision = {
    outcome: "deload_week",
    nextWorkingWeightKg: null,
    nextTargetReps: 45,
    consecutiveFailures: 0,
    wantsHarderVariation: false,
    bestWeightKg: null,
    bestReps: 50,
    bestE1rm: null,
    personalBest: { kind: "hold", value: 50 },
    message: "Deload week — nothing moves this week.",
  };

  await writeExerciseProgressCore(
    fake.client,
    "user-1",
    "ex-plank",
    decision,
    4,
    "2026-10-24",
  );

  const written = fake.getWritten();
  check("best_reps is 50", written?.best_reps === 50, `${written?.best_reps}`);
  check("best_weight_kg is null", written?.best_weight_kg === null);
  check("best_e1rm is null", written?.best_e1rm === null);
  check("current_target_reps held at 45", written?.current_target_reps === 45);
  }

  console.log("\n5. E1RM improvement during deload");
  {
  const fake = createFakeClient();
  const decision: Decision = {
    outcome: "deload_week",
    nextWorkingWeightKg: 60,
    nextTargetReps: 12,
    consecutiveFailures: 0,
    wantsHarderVariation: false,
    bestWeightKg: 60,
    bestReps: 14,
    bestE1rm: 88,
    personalBest: { kind: "e1rm", value: 88 },
    message: "Deload week — weights held where they were.",
  };

  await writeExerciseProgressCore(
    fake.client,
    "user-1",
    "ex-deadlift",
    decision,
    6,
    "2026-10-24",
  );

  const written = fake.getWritten();
  check("best_e1rm is 88", written?.best_e1rm === 88, `${written?.best_e1rm}`);
  check("best_reps is 14", written?.best_reps === 14);
  check("best_weight_kg unchanged", written?.best_weight_kg === 60);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
