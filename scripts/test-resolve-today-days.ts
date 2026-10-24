/**
 * Test resolveTodayDays with in-memory fake (X8, X9, X16).
 *
 * Kills: X8, X9, X16
 *
 *   npm run test:resolve-today-days
 */
import { resolveTodayDays } from "../src/lib/resolve-today-days";
import { createInMemorySupabase } from "./in-memory-supabase";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nX8/X9: resolveTodayDays loads retired days from old block");
  {
    const fake = createInMemorySupabase({
      program_days: [
        // Old block days (retired)
        {
          id: "old-lower",
          day_index: 2,
          day_type: "weights",
          focus: "Legs",
          label: "Lower",
          program_day_exercises: [],
        },
        {
          id: "old-upper",
          day_index: 1,
          day_type: "weights",
          focus: "Chest",
          label: "Upper",
          program_day_exercises: [],
        },
        // Current block days
        {
          id: "current-push",
          day_index: 1,
          day_type: "weights",
          label: "Push",
          program_day_exercises: [],
        },
      ],
    });

    const activeDays = [
      {
        id: "current-push",
        day_index: 1,
        day_type: "weights" as const,
        label: "Push",
        focus: null,
        program_day_exercises: [],
      },
    ];

    const sessions = [
      {
        id: "s1",
        status: "planned",
        actual_type: "weights" as const,
        local_date: "2026-10-25",
        program_day_id: "old-lower",
        started_at: null,
        created_at: "2026-10-24T10:00:00Z",
      },
      {
        id: "s2",
        status: "completed",
        actual_type: "weights" as const,
        local_date: "2026-10-24",
        program_day_id: "old-upper",
        started_at: "2026-10-24T08:00:00Z",
        created_at: "2026-10-24T08:00:00Z",
      },
    ];

    const allDays = await resolveTodayDays(fake as never, activeDays, sessions);

    check("returns 3 days", allDays.length === 3);
    check("includes current-push", allDays.some((d) => d.id === "current-push"));
    check("includes old-lower", allDays.some((d) => d.id === "old-lower"));
    check("includes old-upper", allDays.some((d) => d.id === "old-upper"));
    
    const lowerDay = allDays.find((d) => d.id === "old-lower");
    check("Lower day has correct label", lowerDay?.label === "Lower");
    check("Lower day has correct day_index", lowerDay?.day_index === 2);
  }

  console.log("\nX16: resolveTodayDays without retired sessions returns only active days");
  {
    const fake = createInMemorySupabase({
      program_days: [
        {
          id: "current-push",
          day_index: 1,
          day_type: "weights",
          label: "Push",
          program_day_exercises: [],
        },
      ],
    });

    const activeDays = [
      {
        id: "current-push",
        day_index: 1,
        day_type: "weights" as const,
        label: "Push",
        focus: null,
        program_day_exercises: [],
      },
    ];

    const sessions = [
      {
        id: "s1",
        status: "planned",
        actual_type: "weights" as const,
        local_date: "2026-10-25",
        program_day_id: "current-push",
        started_at: null,
        created_at: "2026-10-24T10:00:00Z",
      },
    ];

    const allDays = await resolveTodayDays(fake as never, activeDays, sessions);

    check("returns 1 day", allDays.length === 1);
    check("includes current-push", allDays.some((d) => d.id === "current-push"));
    check("does NOT include any retired days", allDays.length === activeDays.length);
  }

  console.log("\nX8/X9/X16: Multiple retired days from different old blocks");
  {
    const fake = createInMemorySupabase({
      program_days: [
        // Current block
        {
          id: "current-day1",
          day_index: 1,
          day_type: "weights",
          label: "Push",
          program_day_exercises: [],
        },
        // Old block 1
        {
          id: "retired-day1",
          day_index: 1,
          day_type: "weights",
          label: "Upper",
          program_day_exercises: [],
        },
        // Old block 2
        {
          id: "retired-day2",
          day_index: 2,
          day_type: "weights",
          label: "Lower",
          program_day_exercises: [],
        },
      ],
    });

    const activeDays = [
      {
        id: "current-day1",
        day_index: 1,
        day_type: "weights" as const,
        label: "Push",
        focus: null,
        program_day_exercises: [],
      },
    ];

    const sessions = [
      {
        id: "s1",
        status: "in_progress",
        actual_type: "weights" as const,
        local_date: "2026-10-25",
        program_day_id: "retired-day1",
        started_at: "2026-10-25T10:00:00Z",
        created_at: "2026-10-25T10:00:00Z",
      },
      {
        id: "s2",
        status: "completed",
        actual_type: "weights" as const,
        local_date: "2026-10-24",
        program_day_id: "retired-day2",
        started_at: "2026-10-24T10:00:00Z",
        created_at: "2026-10-24T10:00:00Z",
      },
    ];

    const allDays = await resolveTodayDays(fake as never, activeDays, sessions);

    check("returns 3 days", allDays.length === 3);
    check("includes current-day1", allDays.some((d) => d.id === "current-day1"));
    check("includes retired-day1", allDays.some((d) => d.id === "retired-day1"));
    check("includes retired-day2", allDays.some((d) => d.id === "retired-day2"));
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
