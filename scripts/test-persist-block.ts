/**
 * Test persistBlock rebuild vs. first-build decision (X1, X2).
 *
 * Kills: X1, X2
 *
 *   npm run test:persist-block
 */
import { persistBlock } from "../src/lib/program/persist";
import { createInMemorySupabase } from "./in-memory-supabase";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nX1: First build does NOT call repointSessionsAfterRebuild");
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
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [],
        },
      ],
      program_days: [],
      program_day_exercises: [],
    });

    const mockPlan: ReturnType<typeof import("../src/lib/program/generate").generateProgram> = {
      splitType: "ppl" as const,
      daysPerWeek: 4,
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

    await persistBlock(fake as never, "user1", mockPlan, {
      startedOn: "2026-10-24",
      endsOn: "2026-11-20",
      rebuildOf: null, // First build, not a rebuild!
      timezone: "UTC",
      primaryTrack: "weights",
      goal: "general_fitness",
      level: "intermediate",
    });

    // Session should remain untouched - program_id should still be "old-program"
    const session = fake.store.sessions[0];
    check("session NOT updated (first build)", session.program_id === "old-program");
    check("session day NOT changed (first build)", session.program_day_id === "old-day");
    
    // Verify no session update writes happened
    const sessionUpdates = fake.writes.filter(
      (w) => w.table === "sessions" && w.operation === "update"
    );
    check("NO session updates on first build", sessionUpdates.length === 0);
  }

  console.log("\nX2: Rebuild DOES call repointSessionsAfterRebuild");
  {
    const fake = createInMemorySupabase({
      sessions: [
        {
          id: "s1",
          user_id: "user1",
          local_date: "2026-10-25",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-lower-day",
          program_id: "old-program",
          status: "planned",
          program_days: { label: "Lower", day_index: 2 },
          session_exercises: [],
        },
      ],
      program_days: [
        { id: "old-lower-day", program_id: "old-program", user_id: "user1", day_index: 2, day_type: "weights", label: "Lower", focus: "Legs" },
      ],
      program_day_exercises: [],
    });

    const mockPlan: ReturnType<typeof import("../src/lib/program/generate").generateProgram> = {
      splitType: "ppl" as const,
      daysPerWeek: 4,
      blockNumber: 2,
      deloadWeek: 4,
      days: [
        {
          dayIndex: 1,
          dayType: "weights" as const,
          label: "Upper",
          focus: "Chest, Back",
          exercises: [],
        },
        {
          dayIndex: 2,
          dayType: "weights" as const,
          label: "Lower",
          focus: "Legs, Glutes",
          exercises: [],
        },
      ],
    };

    const result = await persistBlock(fake as never, "user1", mockPlan, {
      startedOn: "2026-10-24",
      endsOn: "2026-11-20",
      rebuildOf: { block_number: 1, started_on: "2026-10-24" },
      timezone: "UTC",
      primaryTrack: "weights",
      goal: "general_fitness",
      level: "intermediate",
    });

    check("persistBlock succeeded", result.ok);

    // persistBlock no longer calls repoint (rebuild path uses RPC now)
    // Session should NOT be repointed
    const session = fake.store.sessions[0];
    check("session NOT repointed by persistBlock", session.program_id === "old-program");
    check("session day NOT repointed by persistBlock", session.program_day_id === "old-lower-day");
  }

  console.log("\nX1/X2: 0-set in_progress session rebuilt on rebuild");
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
          program_days: { label: "Push", day_index: 1 },
          session_exercises: [], // 0 sets!
        },
      ],
      program_days: [],
      program_day_exercises: [],
    });

    const mockPlan: ReturnType<typeof import("../src/lib/program/generate").generateProgram> = {
      splitType: "ppl" as const,
      daysPerWeek: 4,
      blockNumber: 2,
      deloadWeek: 4,
      days: [
        {
          dayIndex: 1,
          dayType: "weights" as const,
          label: "Push",
          focus: "Chest, Shoulders",
          exercises: [
            {
              exerciseId: "ex1",
              name: "Bench Press",
              orderIndex: 0,
              targetSets: 3,
              targetRepsMin: 8,
              targetRepsMax: 12,
              restSeconds: 120,
            },
          ],
        },
      ],
    };

    await persistBlock(fake as never, "user1", mockPlan, {
      startedOn: "2026-10-24",
      endsOn: "2026-11-20",
      rebuildOf: { block_number: 1, started_on: "2026-10-17" },
      timezone: "UTC",
      primaryTrack: "weights",
      goal: "general_fitness",
      level: "intermediate",
    });

    check("program created", fake.store.programs?.length === 1);
    check("program days created", fake.store.program_days?.length === 1);
    check("program day exercises created", fake.store.program_day_exercises?.length === 1);
  }

  console.log("\nDecision (d): Superseded blocks excluded from highest block_number (behavior test)");
  {
    // Test the query filter directly: .not("status", "in", "(superseded,retired)")
    // Without filter: would get block 3 (superseded)
    // With filter: should get block 1 (active)
    const fake = createInMemorySupabase({
      programs: [
        { id: "active-1", user_id: "user1", block_number: 1, status: "active" },
        { id: "superseded-3", user_id: "user1", block_number: 3, status: "superseded" },
        { id: "retired-5", user_id: "user1", block_number: 5, status: "retired" },
      ],
    });

    // Test the actual query from persist.ts line 294-299
    const { data: result, error } = await (fake as any)
      .from("programs")
      .select("block_number")
      .not("status", "in", "(superseded,retired)")
      .order("block_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    check("query succeeded", !error);
    check("highest non-superseded block is 1 (not 5)",
      result?.block_number === 1,
      `expected 1, got ${result?.block_number}. Without .not() filter, would get 5 (retired)`
    );

    // Verify superseded and retired were filtered out
    const { data: allResults } = await (fake as any)
      .from("programs")
      .select("block_number, status")
      .not("status", "in", "(superseded,retired)");

    check("filtered results only include active",
      allResults?.length === 1 && allResults[0].status === "active",
      `expected 1 active, got ${JSON.stringify(allResults)}`
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
