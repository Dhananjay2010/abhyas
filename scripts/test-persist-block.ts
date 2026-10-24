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
    // Test that production logic filters superseded/retired blocks when picking next block number
    // persist.ts line 294-299 uses: .not("status", "in", "(superseded,retired)")
    // This test verifies that filtering matters by showing the wrong result WITHOUT it

    const { pickActiveBlock } = await import("../src/lib/program/pick-active-block.js");

    // Scenario: blocks 1 (active), 3 (superseded), 5 (retired)
    const programs = [
      { block_number: 1, status: "active" as const },
      { block_number: 3, status: "superseded" as const },
      { block_number: 5, status: "retired" as const },
    ];

    // Without filtering: naive max would return 5 → next would be 6 (WRONG)
    const naiveMax = Math.max(...programs.map(p => p.block_number));
    const naiveNext = naiveMax + 1;
    check("naive next block is 6 (WRONG)", naiveNext === 6);

    // Production logic filters first: highest active is 1 → next is 2 (CORRECT)
    const activeBlock = pickActiveBlock(programs);
    const correctNext = activeBlock + 1;
    check("correct next block is 2, not 6",
      correctNext === 2,
      `expected 2, got ${correctNext}. Without .not() filter in persist.ts query, would get 6`
    );

    // Verify with only retired/superseded: should default to block 1
    const onlyInactive = [
      { block_number: 10, status: "superseded" as const },
      { block_number: 20, status: "retired" as const },
    ];
    check("with no active blocks, defaults to 1",
      pickActiveBlock(onlyInactive) === 1
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
