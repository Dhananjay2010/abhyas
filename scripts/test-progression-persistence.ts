#!/usr/bin/env tsx
/**
 * Test: In-range sessions persist consecutive_failures=0 correctly
 *
 * Tests the full persistence path: evaluateProgression → writeExerciseProgressCore
 * → read back the persisted state → evaluate next session. Verifies that in-range
 * sessions (all sets >= repsMin but not all at top) persist consecutive_failures=0
 * and don't trigger deloads after two sessions.
 *
 * This test uses a fake client to record what's written, then simulates reading
 * it back as ProgressState for the next evaluation.
 *
 * Run: npm run test:progression-persistence
 */

import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";
import {
  writeExerciseProgressCore,
  type ProgressClient,
  type ProgressWrite,
} from "../src/lib/session/write-progress";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeClient(): { client: ProgressClient; getWritten: () => ProgressWrite | null } {
  let written: ProgressWrite | null = null;

  const client: ProgressClient = {
    from: () => ({
      upsert: async (data: Record<string, unknown>, _opts: { onConflict: string }) => {
        // Type guard: check if data has the shape of ProgressWrite
        if (
          typeof data === "object" &&
          data !== null &&
          "user_id" in data &&
          "exercise_id" in data
        ) {
          written = data as ProgressWrite;
        }
        return { data: null, error: null };
      },
    }),
  };

  return {
    client,
    getWritten: () => written,
  };
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const sets = (n: number, reps: number, w: number = 40) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

console.log("\nTest: In-range sessions persist consecutive_failures=0\n");

async function main() {
  console.log("1. Two in-range sessions (4×10) hold at 40 with failures=0 persisted both times");
  {
    // First session: 4×10 in 8-12 range, logged at 40 kg but prescribed is 40 kg
    const state1: ProgressState = {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: 56,
      totalSessions: 1,
    };

    const decision1 = evaluateProgression({
      sets: sets(4, 10, 40),
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BENCH,
      state: state1,
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });

    check("Session 1: outcome hold", decision1.outcome === "hold", decision1.outcome);
    check("Session 1: weight held at 40", decision1.nextWorkingWeightKg === 40, `${decision1.nextWorkingWeightKg}`);
    check("Session 1: failures reset to 0", decision1.consecutiveFailures === 0, `${decision1.consecutiveFailures}`);

    // Persist session 1
    const fake1 = createFakeClient();
    await writeExerciseProgressCore(
      fake1.client,
      "user-1",
      "ex-bench",
      decision1,
      state1.totalSessions,
      "2026-10-25",
    );

    const written1 = fake1.getWritten();
    check("Session 1 persisted: consecutive_failures=0", written1?.consecutive_failures === 0, `${written1?.consecutive_failures}`);
    check("Session 1 persisted: weight=40", written1?.current_working_weight_kg === 40, `${written1?.current_working_weight_kg}`);

    // OWNER DECISION (a): In-range hold keeps STORED prescribed weight, not recomputed from logged.
    // Session 2: 4×10 in-range, but user logged at 42 kg (heavier than prescribed 40 kg).
    // The hold should keep prescribed 40 kg, not adopt the logged 42 kg.
    const state2: ProgressState = {
      currentWorkingWeightKg: 40, // Prescribed/stored is 40
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: 56,
      totalSessions: 2,
    };

    const decision2 = evaluateProgression({
      sets: sets(4, 10, 42), // User logged at 42 kg (different from stored 40)
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BENCH,
      state: state2,
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });

    check("Session 2: outcome hold (not backed_off)", decision2.outcome === "hold", decision2.outcome);
    check("Session 2: weight held at stored 40 (not logged 42)", decision2.nextWorkingWeightKg === 40, `${decision2.nextWorkingWeightKg}`);
    check("Session 2: failures still 0", decision2.consecutiveFailures === 0, `${decision2.consecutiveFailures}`);

    // Persist session 2
    const fake2 = createFakeClient();
    await writeExerciseProgressCore(
      fake2.client,
      "user-1",
      "ex-bench",
      decision2,
      state2.totalSessions,
      "2026-10-26",
    );

    const written2 = fake2.getWritten();
    check("Session 2 persisted: consecutive_failures=0", written2?.consecutive_failures === 0, `${written2?.consecutive_failures}`);
    check("Session 2 persisted: weight=40 (stored, not logged 42)", written2?.current_working_weight_kg === 40, `${written2?.current_working_weight_kg}`);
  }

  console.log("\n2. Two real miss sessions (4×7) deload from 60 to 52.5 with failures persisted correctly");
  {
    // First miss: 4×7 below min (8-12 range)
    const state1: ProgressState = {
      currentWorkingWeightKg: 60,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 60,
      bestReps: 12,
      bestE1rm: 84,
      totalSessions: 2,
    };

    const decision1 = evaluateProgression({
      sets: sets(4, 7, 60),
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BENCH,
      state: state1,
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });

    check("First miss: outcome hold", decision1.outcome === "hold", decision1.outcome);
    check("First miss: weight drops to 57.5", decision1.nextWorkingWeightKg === 57.5, `${decision1.nextWorkingWeightKg}`);
    check("First miss: failures=1", decision1.consecutiveFailures === 1, `${decision1.consecutiveFailures}`);

    // Persist first miss
    const fake1 = createFakeClient();
    await writeExerciseProgressCore(
      fake1.client,
      "user-1",
      "ex-bench",
      decision1,
      state1.totalSessions,
      "2026-10-27",
    );

    const written1 = fake1.getWritten();
    check("First miss persisted: consecutive_failures=1", written1?.consecutive_failures === 1, `${written1?.consecutive_failures}`);
    check("First miss persisted: weight=57.5", written1?.current_working_weight_kg === 57.5, `${written1?.current_working_weight_kg}`);

    // Read back into state for second miss
    const state2: ProgressState = {
      currentWorkingWeightKg: written1?.current_working_weight_kg ?? 57.5,
      currentTargetReps: written1?.current_target_reps ?? 12,
      consecutiveFailures: written1?.consecutive_failures ?? 1,
      bestWeightKg: written1?.best_weight_kg ?? 60,
      bestReps: written1?.best_reps ?? 12,
      bestE1rm: written1?.best_e1rm ?? 84,
      totalSessions: written1?.total_sessions ?? 3,
    };

    check("State 2 loaded: failures=1", state2.consecutiveFailures === 1);

    // Second miss: 4×7 again
    const decision2 = evaluateProgression({
      sets: sets(4, 7, 57.5),
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BENCH,
      state: state2,
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });

    check("Second miss: outcome backed_off", decision2.outcome === "backed_off", decision2.outcome);
    check("Second miss: deloads to 50 kg", decision2.nextWorkingWeightKg === 50, `${decision2.nextWorkingWeightKg}`);
    check("Second miss: failures reset to 0", decision2.consecutiveFailures === 0, `${decision2.consecutiveFailures}`);

    // Persist second miss
    const fake2 = createFakeClient();
    await writeExerciseProgressCore(
      fake2.client,
      "user-1",
      "ex-bench",
      decision2,
      state2.totalSessions,
      "2026-10-28",
    );

    const written2 = fake2.getWritten();
    check("Second miss persisted: consecutive_failures=0", written2?.consecutive_failures === 0, `${written2?.consecutive_failures}`);
    check("Second miss persisted: weight=50", written2?.current_working_weight_kg === 50, `${written2?.current_working_weight_kg}`);
  }

  console.log("\n3. One miss then in-range resets failures and doesn't deload");
  {
    // First session: 4×7 (miss)
    const state1: ProgressState = {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: 56,
      totalSessions: 1,
    };

    const decision1 = evaluateProgression({
      sets: sets(4, 7, 40),
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BENCH,
      state: state1,
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });

    check("Miss: failures=1", decision1.consecutiveFailures === 1);

    const fake1 = createFakeClient();
    await writeExerciseProgressCore(
      fake1.client,
      "user-1",
      "ex-bench",
      decision1,
      state1.totalSessions,
      "2026-10-29",
    );

    const written1 = fake1.getWritten();
    const state2: ProgressState = {
      currentWorkingWeightKg: written1?.current_working_weight_kg ?? 37.5,
      currentTargetReps: written1?.current_target_reps ?? 12,
      consecutiveFailures: written1?.consecutive_failures ?? 1,
      bestWeightKg: written1?.best_weight_kg ?? 40,
      bestReps: written1?.best_reps ?? 12,
      bestE1rm: written1?.best_e1rm ?? 56,
      totalSessions: written1?.total_sessions ?? 2,
    };

    // Second session: 4×10 (in-range)
    const decision2 = evaluateProgression({
      sets: sets(4, 10, 37.5),
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BENCH,
      state: state2,
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });

    check("In-range after miss: outcome hold", decision2.outcome === "hold", decision2.outcome);
    check("In-range after miss: weight held at 37.5", decision2.nextWorkingWeightKg === 37.5, `${decision2.nextWorkingWeightKg}`);
    check("In-range after miss: failures reset to 0", decision2.consecutiveFailures === 0, `${decision2.consecutiveFailures}`);

    const fake2 = createFakeClient();
    await writeExerciseProgressCore(
      fake2.client,
      "user-1",
      "ex-bench",
      decision2,
      state2.totalSessions,
      "2026-10-30",
    );

    const written2 = fake2.getWritten();
    check("In-range after miss persisted: consecutive_failures=0", written2?.consecutive_failures === 0, `${written2?.consecutive_failures}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
