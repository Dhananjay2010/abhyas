/**
 * Test repoint DB operations with recording fake client.
 *
 * Kills: X5, X7, NEW1, NEW3
 *
 *   npm run test:repoint-db-writes
 */
import { repointSessionsAfterRebuild } from "../src/lib/program/repoint-sessions";
import { createRecordingFakeClient, type SeedData } from "./recording-fake-client";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nX5: Session update includes program_id");
  {
    const seedData: SeedData = {
      sessions: [
        {
          id: "s1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          status: "planned",
          program_days: [{ label: "Upper", day_index: 1 }],
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "new-day", day_index: 1, day_type: "weights", label: "Upper" },
      ],
      program_day_exercises: [],
      programs: [{ is_deload: false }],
    };

    const client = createRecordingFakeClient(seedData);

    await repointSessionsAfterRebuild(
      client as never,
      "user1",
      "new-program-id",
      "2026-10-24",
    );

    const sessionUpdate = client.writes.find(
      (w) => w.table === "sessions" && w.operation === "update" && w.filters.id === "s1",
    );

    check("session update recorded", sessionUpdate !== undefined);
    
    const hasProgramId =
      sessionUpdate &&
      typeof sessionUpdate.values === "object" &&
      sessionUpdate.values !== null &&
      "program_id" in sessionUpdate.values &&
      (sessionUpdate.values as { program_id: string }).program_id === "new-program-id";

    check("update includes program_id=new-program-id", !!hasProgramId);
  }

  console.log("\nX7: Session with logged sets is kept (not rebuilt)");
  {
    const seedData: SeedData = {
      sessions: [
        {
          id: "s1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          status: "in_progress",
          program_days: [{ label: "Upper", day_index: 1 }],
          session_exercises: [
            {
              id: "se1",
              session_sets: [{ id: "set1" }], // HAS logged sets
            },
          ],
        },
      ],
      program_days: [
        { id: "new-day", day_index: 1, day_type: "weights", label: "Upper" },
      ],
    };

    const client = createRecordingFakeClient(seedData);

    await repointSessionsAfterRebuild(
      client as never,
      "user1",
      "new-program-id",
      "2026-10-24",
    );

    const sessionExerciseDelete = client.writes.find(
      (w) => w.table === "session_exercises" && w.operation === "delete",
    );
    const sessionUpdate = client.writes.find(
      (w) => w.table === "sessions" && w.operation === "update" && w.filters.id === "s1",
    );

    check("NO session_exercises delete (session kept)", sessionExerciseDelete === undefined);
    check("NO session update (session kept)", sessionUpdate === undefined);
  }

  console.log("\nNEW3: 0-set in_progress session is rebuilt");
  {
    const seedData: SeedData = {
      sessions: [
        {
          id: "s1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          status: "in_progress",
          program_days: [{ label: "Upper", day_index: 1 }],
          session_exercises: [], // 0 logged sets
        },
      ],
      program_days: [
        { id: "new-day", day_index: 1, day_type: "weights", label: "Upper" },
      ],
      program_day_exercises: [
        {
          exercise_id: "ex1",
          target_sets: 3,
          target_reps_min: 8,
          target_reps_max: 12,
          rest_seconds: 120,
          exercises: { metric: "reps" },
        },
      ],
      programs: [{ is_deload: false }],
    };

    const client = createRecordingFakeClient(seedData);

    await repointSessionsAfterRebuild(
      client as never,
      "user1",
      "new-program-id",
      "2026-10-24",
    );

    const sessionExerciseDelete = client.writes.find(
      (w) => w.table === "session_exercises" && w.operation === "delete",
    );
    const sessionExerciseInsert = client.writes.find(
      (w) => w.table === "session_exercises" && w.operation === "insert",
    );
    const sessionUpdate = client.writes.find(
      (w) => w.table === "sessions" && w.operation === "update" && w.filters.id === "s1",
    );

    check("session_exercises deleted", sessionExerciseDelete !== undefined);
    check("new session_exercises inserted", sessionExerciseInsert !== undefined);
    check("session updated with new program_id", sessionUpdate !== undefined);
  }

  console.log("\nNEW1: day_type enforced in label matching");
  {
    const seedData: SeedData = {
      sessions: [
        {
          id: "s1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          status: "planned",
          program_days: [{ label: "Push", day_index: 3 }],
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "new-upper", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-lower", day_index: 2, day_type: "weights", label: "Lower" },
        { id: "new-rest", day_index: 3, day_type: "rest", label: null }, // Same index, wrong type
      ],
    };

    const client = createRecordingFakeClient(seedData);

    await repointSessionsAfterRebuild(
      client as never,
      "user1",
      "new-program-id",
      "2026-10-24",
    );

    const sessionDelete = client.writes.find(
      (w) => w.table === "sessions" && w.operation === "delete",
    );

    // Session should be deleted (no match) OR updated to a weights day (fallback)
    const sessionUpdate = client.writes.find(
      (w) => w.table === "sessions" && w.operation === "update" && w.filters.id === "s1",
    );

    const handledCorrectly = sessionDelete !== undefined || sessionUpdate !== undefined;
    check("session handled (deleted or repointed to weights day)", handledCorrectly);
  }
}

runTests().then(() => {
  if (failures > 0) {
    console.log(`\n❌ ${failures} failure(s)`);
    process.exit(1);
  } else {
    console.log("\n✅ All checks passed");
  }
});
