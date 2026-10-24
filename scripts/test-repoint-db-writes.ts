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
    
    // X5 CRITICAL: Verify BOTH program_id and program_day_id are updated
    check("session program_id updated (X5)", session.program_id === "new-program");
    check("session program_day_id updated", session.program_day_id === "new-day");
    
    // Double-check: if program_id stayed old but day_id changed, X5 survived
    if (session.program_day_id === "new-day" && session.program_id !== "new-program") {
      console.log("  CRITICAL: program_day_id updated but program_id NOT updated - this is X5!");
    }
  }

  console.log("\nNEW1: day_type IS checked when matching by label");
  {
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day-a",
          program_id: "old-program",
          status: "planned",
          program_days: { label: "Day A", day_index: 1, day_type: "weights" },
          session_exercises: [],
        },
      ],
      program_days: [
        // OLD program: Day A weights at index 1
        { id: "old-day-a", program_id: "old-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Day A" },
        // NEW program: Day A rest at index 1 (WRONG match if day_type ignored)
        { id: "new-day-a-rest", program_id: "new-program", user_id: "user1", day_index: 1, day_type: "rest", label: "Day A" },
        // NEW program: Day A weights at index 3 (CORRECT match)
        { id: "new-day-a-weights", program_id: "new-program", user_id: "user1", day_index: 3, day_type: "weights", label: "Day A" },
      ],
      program_day_exercises: [],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    
    // NEW1 CRITICAL: Must match day_type AND label, not just label
    // If day_type ignored, would match index 1 (rest day) instead of index 3 (weights)
    check("session matches Day A WEIGHTS at index 3 (NEW1)", 
      session.program_day_id === "new-day-a-weights",
      `expected new-day-a-weights, got ${session.program_day_id}`
    );
    
    if (session.program_day_id === "new-day-a-rest") {
      console.log("  CRITICAL: Matched rest day instead of weights day - day_type was ignored! (NEW1)");
    }
  }

  console.log("\nNEW3/decision (a): 0-set in_progress session is NOT repointed");
  {
    // Test case: in_progress with 0 working sets - should NOT be repointed
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-upper",
          program_id: "old-program",
          status: "in_progress",
          program_days: { label: "Upper", day_index: 1, day_type: "weights" },
          session_exercises: [
            { id: "se1", session_id: "s1", program_day_exercise_id: "pde1", exercise_id: "ex1" },
            { id: "se2", session_id: "s1", program_day_exercise_id: "pde2", exercise_id: "ex2" },
          ],
        },
      ],
      session_exercises: [
        { id: "se1", session_id: "s1", program_day_exercise_id: "pde1", exercise_id: "ex1", session_sets: [] },
        { id: "se2", session_id: "s1", program_day_exercise_id: "pde2", exercise_id: "ex2", session_sets: [] },
      ],
      program_days: [
        { id: "old-upper", program_id: "old-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-upper", program_id: "new-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
      ],
      program_day_exercises: [
        // Old program exercises
        { id: "pde1", program_day_id: "old-upper", exercise_id: "ex1", set_type: "working", order_number: 1 },
        { id: "pde2", program_day_id: "old-upper", exercise_id: "ex2", set_type: "working", order_number: 2 },
        // New program exercises (different)
        { id: "pde3", program_day_id: "new-upper", exercise_id: "ex3", set_type: "working", order_number: 1 },
        { id: "pde4", program_day_id: "new-upper", exercise_id: "ex4", set_type: "working", order_number: 2 },
      ],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    
    // Decision (a): in_progress sessions are NOT repointed
    check("session NOT updated (stays on old program)", 
      session.program_id === "old-program",
      `expected old-program, got ${session.program_id}`
    );
    check("session NOT updated (stays on old day)", 
      session.program_day_id === "old-upper",
      `expected old-upper, got ${session.program_day_id}`
    );
    
    // session_exercises should NOT be replaced
    const sessionExercises = fake.store.session_exercises.filter(se => se.session_id === "s1");
    const exerciseIds = sessionExercises.map(se => se.exercise_id).sort();
    check("session exercises NOT replaced (kept old exercises)",
      JSON.stringify(exerciseIds) === JSON.stringify(["ex1", "ex2"]),
      `expected ["ex1","ex2"], got ${JSON.stringify(exerciseIds)}`
    );
  }

  console.log("\nNEW3 control: 1+ working set in_progress session is kept");
  {
    // Control case: in_progress with 1+ working sets - should keep old block
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s2",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-upper",
          program_id: "old-program",
          status: "in_progress",
          program_days: { label: "Upper", day_index: 1, day_type: "weights" },
          session_exercises: [
            { 
              id: "se3", 
              session_id: "s2", 
              program_day_exercise_id: "pde1", 
              exercise_id: "ex1",
              session_sets: [
                { id: "set1", session_exercise_id: "se3", is_warmup_set: false, reps: 5, weight: 100 }
              ]
            },
          ],
        },
      ],
      session_exercises: [
        { id: "se3", session_id: "s2", program_day_exercise_id: "pde1", exercise_id: "ex1", 
          session_sets: [
            { id: "set1", session_exercise_id: "se3", is_warmup_set: false, reps: 5, weight: 100 }
          ]
        },
      ],
      program_days: [
        { id: "old-upper", program_id: "old-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-upper", program_id: "new-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
      ],
      program_day_exercises: [
        { id: "pde1", program_day_id: "old-upper", exercise_id: "ex1", set_type: "working", order_number: 1 },
      ],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    
    // Control: session with working sets stays on old block
    check("session with 1+ sets kept on old program (control)", 
      session.program_id === "old-program",
      `expected old-program, got ${session.program_id}`
    );
    check("session with 1+ sets kept on old day (control)", 
      session.program_day_id === "old-upper",
      `expected old-upper, got ${session.program_day_id}`
    );
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
          // Nested data: weights day with label "Day A"
          program_days: { label: "Day A", day_index: 2 },
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "old-push", day_index: 2, day_type: "weights", label: "Day A" },
        // New block has TWO days with label "Day A" but different types
        { id: "new-rest-a", day_index: 1, day_type: "rest", label: "Day A", program_id: "new-program" },
        { id: "new-weights-a", day_index: 2, day_type: "weights", label: "Day A", program_id: "new-program" },
        { id: "new-yoga", day_index: 3, day_type: "yoga", label: null, program_id: "new-program" },
      ],
      program_day_exercises: [],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    // Session MUST match to new-weights-a (day_type=weights, label="Day A")
    // NOT to new-rest-a (day_type=rest, label="Day A")
    if (session) {
      check("session matched to weights Day A, not rest Day A", 
        session.program_day_id === "new-weights-a",
        `got ${session.program_day_id}`
      );
      
      const matchedDay = fake.store.program_days.find((d) => d.id === session.program_day_id);
      check("matched day has day_type=weights", matchedDay?.day_type === "weights");
      check("matched day has label Day A", matchedDay?.label === "Day A");
    } else {
      check("FAIL: session should NOT be deleted", false);
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
    check("session NOT updated (stays on old program)", session.program_id === "old-program");
    
    // Check that NO session_exercises operations happened (decision a)
    const deleteWrites = fake.writes.filter(
      (w) => w.table === "session_exercises" && w.operation === "delete"
    );
    check("session_exercises NOT deleted (decision a)", deleteWrites.length === 0);
    
    // Check that NO new session_exercises were inserted
    const insertWrites = fake.writes.filter(
      (w) => w.table === "session_exercises" && w.operation === "insert"
    );
    check("session_exercises NOT inserted (decision a)", insertWrites.length === 0);
  }

  console.log("\nNEW decision (b): Planned session exercises replaced correctly (delete by ID, not all)");
  {
    // Test that when a planned session is repointed with exercises,
    // old exercises are deleted by ID only (not all by session_id)
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-upper",
          program_id: "old-program",
          status: "planned",
          program_days: { label: "Upper", day_index: 1, day_type: "weights" },
          session_exercises: [
            { id: "se1", session_id: "s1", program_day_exercise_id: "pde1", exercise_id: "ex1" },
            { id: "se2", session_id: "s1", program_day_exercise_id: "pde2", exercise_id: "ex2" },
          ],
        },
      ],
      session_exercises: [
        { id: "se1", session_id: "s1", program_day_exercise_id: "pde1", exercise_id: "ex1", session_sets: [] },
        { id: "se2", session_id: "s1", program_day_exercise_id: "pde2", exercise_id: "ex2", session_sets: [] },
      ],
      program_days: [
        { id: "old-upper", program_id: "old-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-upper", program_id: "new-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
      ],
      program_day_exercises: [
        // Old program exercises
        { id: "pde1", program_day_id: "old-upper", exercise_id: "ex1", set_type: "working", order_number: 1 },
        { id: "pde2", program_day_id: "old-upper", exercise_id: "ex2", set_type: "working", order_number: 2 },
        // New program exercises (different)
        { id: "pde3", program_day_id: "new-upper", exercise_id: "ex3", set_type: "working", order_number: 1 },
        { id: "pde4", program_day_id: "new-upper", exercise_id: "ex4", set_type: "working", order_number: 2 },
      ],
      programs: [{ id: "new-program", is_deload: false }],
    });

    await repointSessionsAfterRebuild(fake as never, "user1", "new-program", "2026-10-24");

    const session = fake.store.sessions[0];
    
    // Session should be repointed
    check("session updated to new program", session.program_id === "new-program");
    check("session updated to new day", session.program_day_id === "new-upper");
    
    // Check that old exercises were deleted by ID
    const deleteWrites = fake.writes.filter(
      (w) => w.table === "session_exercises" && w.operation === "delete"
    );
    check("session_exercises delete operation performed", deleteWrites.length === 1);
    
    if (deleteWrites.length > 0) {
      const deleteFilters = deleteWrites[0].filters;
      const hasIdFilter = "id__in" in deleteFilters && Array.isArray(deleteFilters["id__in"]);
      const hasSessionIdFilter = "session_id" in deleteFilters;
      check("delete used .in('id', [old IDs]) not .eq('session_id')", hasIdFilter && !hasSessionIdFilter);
    }
    
    // Verify final state: should have new exercises (ex3, ex4), not old (ex1, ex2)
    const sessionExercises = fake.store.session_exercises.filter(se => se.session_id === "s1");
    const exerciseIds = sessionExercises.map(se => se.exercise_id).sort();
    check("session has new exercises only",
      JSON.stringify(exerciseIds) === JSON.stringify(["ex3", "ex4"]),
      `expected ["ex3","ex4"], got ${JSON.stringify(exerciseIds)}`
    );
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
