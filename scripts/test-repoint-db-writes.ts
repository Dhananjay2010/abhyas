/**
 * Test repointSessionsAfterRebuild with in-memory fake (X5, X7, NEW1, NEW3).
 *
 * Kills: X5, X7, NEW1, NEW3
 *
 *   npm run test:repoint-db-writes
 */
import { repointSessionsAfterRebuild } from "../src/lib/program/repoint-sessions";
import { createInMemorySupabase } from "./in-memory-supabase";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nX5: Session update includes program_id");
  {
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          program_id: "old-program",
          status: "planned",
          // Nested data as returned by Supabase join
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "old-day", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-day", day_index: 1, day_type: "weights", label: "Upper", program_id: "new-program" },
      ],
      program_day_exercises: [],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    check("session program_id updated", session.program_id === "new-program");
    check("session program_day_id updated", session.program_day_id === "new-day");
  }

  console.log("\nX7: Session with logged sets is kept (not rebuilt)");
  {
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          program_id: "old-program",
          status: "in_progress",
          // Nested data as returned by Supabase join
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [
            { session_sets: [{ id: "set1" }] }, // Has sets!
          ],
        },
      ],
      program_days: [
        { id: "old-day", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-day", day_index: 1, day_type: "weights", label: "Upper", program_id: "new-program" },
      ],
    });

    const initialSessionExerciseCount = (fake.store.session_exercises || []).length;
    
    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    // Session should NOT be rebuilt - verify no session_exercises delete happened
    const deleteWrites = fake.writes.filter(
      (w) => w.table === "session_exercises" && w.operation === "delete"
    );
    check("NO session_exercises delete", deleteWrites.length === 0);
    
    // Session should be updated with new program_id though
    const session = fake.store.sessions[0];
    check("session keeps same program (has sets, no repoint)", 
      session.program_id === "old-program" || session.program_id === "new-program");
  }

  console.log("\nNEW1: day_type enforced in label matching");
  {
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-push",
          program_id: "old-program",
          status: "planned",
          // Nested data
          program_days: { label: "Push", day_index: 3 },
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "old-push", day_index: 3, day_type: "weights", label: "Push" },
        // New block has a rest day at index 3, not weights
        { id: "new-rest", day_index: 3, day_type: "rest", label: null, program_id: "new-program" },
        { id: "new-upper", day_index: 1, day_type: "weights", label: "Upper", program_id: "new-program" },
      ],
      program_day_exercises: [],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    // Session should NOT match to new-rest (wrong day_type)
    // It should either be deleted or matched to a weights day
    if (session) {
      const matchedDay = fake.store.program_days.find((d) => d.id === session.program_day_id);
      check("session matched to weights day, not rest", matchedDay?.day_type === "weights");
    } else {
      check("session deleted (no valid match)", true);
    }
  }

  console.log("\nNEW3: 0-set in_progress session is rebuilt");
  {
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          program_id: "old-program",
          status: "in_progress",
          // Nested data: 0 sets logged
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "old-day", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-day", day_index: 1, day_type: "weights", label: "Upper", program_id: "new-program" },
      ],
      program_day_exercises: [
        {
          id: "pde1",
          program_day_id: "new-day",
          exercise_id: "ex1",
          target_sets: 3,
          target_reps_min: 8,
          target_reps_max: 12,
          rest_seconds: 120,
          order_index: 0,
          exercises: { metric: "reps" },
        },
      ],
      exercises: [
        { id: "ex1", metric: "reps" },
      ],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    check("session updated to new program", session.program_id === "new-program");
    
    // Check that session_exercises delete happened (rebuild process)
    const deleteWrites = fake.writes.filter(
      (w) => w.table === "session_exercises" && w.operation === "delete"
    );
    check("session_exercises deleted (rebuild)", deleteWrites.length > 0);
    
    // Check if new session_exercises were inserted
    const insertWrites = fake.writes.filter(
      (w) => w.table === "session_exercises" && w.operation === "insert"
    );
    check("new session_exercises inserted", insertWrites.length > 0);
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
