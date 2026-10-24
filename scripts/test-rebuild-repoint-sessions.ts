/**
 * Test createBlockForUser rebuild mode repoints sessions.
 *
 * Kills: removing the post-RPC repoint call
 *
 *   npm run test:rebuild-repoint-sessions
 */
import { createBlockForUser } from "../src/lib/program/persist";
import { createInMemorySupabase } from "./in-memory-supabase";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nRebuild mode repoints planned sessions");
  {
    const fake = createInMemorySupabase({
      profiles: [
        {
          id: "user1",
          timezone: "America/New_York",
          goal: "general_fitness",
          level: "intermediate",
          primary_track: "weights",
          days_per_week: 4,
          yoga_days_per_week: 0,
          has_all_equipment: true,
          date_of_birth: "1990-01-01",
          height_cm: 175,
        },
      ],
      body_metrics: [],
      user_equipment: [],
      user_injuries: [],
      exercises: [
        {
          id: "ex1",
          slug: "bench-press",
          name: "Bench Press",
          movement_pattern: "horizontal_press",
          mechanic: "compound",
          metric: "reps",
          primary_muscles: ["chest"],
          equipment_ids: ["barbell"],
          level_min: "beginner",
          contraindicated_regions: [],
          impact: "low",
          spinal_load: "low",
          tracks: ["weights"],
          default_rest_seconds: 120,
          is_active: true,
        },
      ],
      programs: [
        {
          id: "old-program",
          user_id: "user1",
          block_number: 1,
          split_type: "ppl",
          days_per_week: 4,
          primary_track: "weights",
          goal: "general_fitness",
          level: "intermediate",
          started_on: "2026-10-01",
          ends_on: "2026-10-28",
          deload_week: 4,
          status: "active",
        },
      ],
      program_days: [
        {
          id: "old-day-1",
          program_id: "old-program",
          user_id: "user1",
          day_index: 1,
          day_type: "weights",
          label: "Push",
          focus: "Chest, Shoulders",
        },
      ],
      program_day_exercises: [],
      sessions: [
        {
          id: "session1",
          user_id: "user1",
          program_id: "old-program",
          program_day_id: "old-day-1",
          local_date: "2026-10-25",
          week_in_block: 4,
          is_deload: true,
          planned_type: "weights",
          actual_type: "weights",
          status: "planned",
          program_days: { label: "Push", day_index: 1 },
          session_exercises: [],
        },
      ],
      session_exercises: [],
    });

    const result = await createBlockForUser(fake as never, "user1", { mode: "rebuild" });

    check("rebuild succeeded", result.ok);

    if (result.ok) {
      // Find the new program
      const newProgram = fake.store.programs?.find((p) => p.id !== "old-program");
      check("new program created", !!newProgram);

      if (newProgram) {
        const session = fake.store.sessions?.find((s) => s.id === "session1");
        check("session program_id updated to new program", session?.program_id === newProgram.id);

        const newDay = fake.store.program_days?.find((d) => d.program_id === newProgram.id);
        check("session program_day_id updated to new day", session?.program_day_id === newDay?.id);
      }
    }
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
