/**
 * Mutant (e): Test that rebuildBlockCore calls repoint after RPC.
 *
 * Behavior test: fake client with rpc() that resolves OK,
 * assert planned session now points at new plan.
 *
 * npm run test:rebuild-core
 */
import { rebuildBlockCore } from "../src/lib/program/persist";
import { createInMemorySupabase } from "./in-memory-supabase";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nMutant (e): rebuildBlockCore calls repoint after RPC (behavior test)");
  {
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
          ],
        },
      ],
      session_exercises: [
        { id: "se1", session_id: "s1", program_day_exercise_id: "pde1", exercise_id: "ex1", session_sets: [] },
      ],
      program_days: [
        { id: "old-upper", program_id: "old-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "new-upper", program_id: "new-program", user_id: "user1", day_index: 1, day_type: "weights", label: "Upper" },
      ],
      program_day_exercises: [
        { id: "pde1", program_day_id: "old-upper", exercise_id: "ex1", set_type: "working", order_number: 1 },
        { id: "pde3", program_day_id: "new-upper", exercise_id: "ex3", set_type: "working", order_number: 1 },
      ],
      programs: [
        { id: "old-program", user_id: "user1", block_number: 1, status: "active" },
        { id: "new-program", user_id: "user1", block_number: 1, status: "active", is_deload: false },
      ],
    });

    // Mock RPC to simulate what rebuild_block does: returns the programId
    // The actual program was already created in the fake store above
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fake as any).rpc = (name: string, args: Record<string, unknown>) => {
      return Promise.resolve({
        data: "new-program",
        error: null,
      });
    };

    const mockPlan: ReturnType<typeof import("../src/lib/program/generate").generateProgram> = {
      splitType: "ppl" as const,
      daysPerWeek: 3,
      blockNumber: 1,
      deloadWeek: 4,
      days: [
        {
          dayIndex: 1,
          dayType: "weights" as const,
          label: "Upper",
          focus: "Chest, Back",
          exercises: [],
        },
      ],
    };

    const input: Parameters<typeof rebuildBlockCore>[4] = {
      userId: "user1",
      blockNumber: 1,
      goal: "general_fitness",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 22,
      injuries: [],
      equipment: [],
      availableExercises: [],
    };

    const result = await rebuildBlockCore(fake as never, "user1", "2026-10-24", mockPlan, input);

    check("rebuildBlockCore succeeded", result.ok);

    // BEHAVIOR TEST: session should be repointed to new program
    const session = fake.store.sessions[0];
    check("session repointed to new program after RPC",
      session.program_id === "new-program",
      `expected new-program, got ${session.program_id}. Without repoint call, would still be old-program`
    );
    check("session repointed to new day after RPC",
      session.program_day_id === "new-upper",
      `expected new-upper, got ${session.program_day_id}`
    );

    // Verify exercises were also replaced
    const sessionExercises = fake.store.session_exercises.filter(se => se.session_id === "s1");
    const exerciseIds = sessionExercises.map(se => se.exercise_id);
    check("session exercises replaced after RPC",
      JSON.stringify(exerciseIds) === JSON.stringify(["ex3"]),
      `expected ["ex3"], got ${JSON.stringify(exerciseIds)}`
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
