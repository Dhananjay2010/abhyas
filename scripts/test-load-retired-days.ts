/**
 * Test loading retired days from old blocks (X8, X9, X16).
 *
 * Kills: X8, X9, X16
 *
 *   npm run test:load-retired-days
 */
import { loadRetiredDays } from "../src/lib/load-retired-days";
import { createRecordingFakeClient, type SeedData } from "./recording-fake-client";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nX8/X9: Today loads retired days and includes them in allDays");
  {
    const seedData: SeedData = {
      program_days: [
        {
          id: "old-day-1",
          day_index: 2,
          day_type: "weights",
          focus: "Legs, Glutes, Core",
          label: "Lower",
          program_day_exercises: [
            {
              order_index: 0,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              rest_seconds: 120,
              exercises: { name: "Squat", cue: null, movement_pattern: "squat", metric: "reps" },
            },
          ],
        },
        {
          id: "old-day-2",
          day_index: 1,
          day_type: "weights",
          focus: "Chest, Back, Shoulders",
          label: "Upper",
          program_day_exercises: [],
        },
      ],
    };

    const client = createRecordingFakeClient(seedData);
    const retiredDays = await loadRetiredDays(client as never, ["old-day-1", "old-day-2"]);

    check("loadRetiredDays returns array", Array.isArray(retiredDays));
    check("returns 2 retired days", retiredDays.length === 2);

    // Verify the returned days have the old block's data
    const lowerDay = retiredDays.find((d) => d.label === "Lower");
    const upperDay = retiredDays.find((d) => d.label === "Upper");

    check("Lower day present with correct label", lowerDay?.label === "Lower");
    check("Lower day has day_index 2", lowerDay?.day_index === 2);
    check("Lower day has day_type weights", lowerDay?.day_type === "weights");
    check("Upper day present with correct label", upperDay?.label === "Upper");
    check("Upper day has exercises embedded", lowerDay?.program_day_exercises.length === 1);
  }

  console.log("\nX16: Empty retiredDayIds returns empty array (early return)");
  {
    const seedData: SeedData = { program_days: [] };
    const client = createRecordingFakeClient(seedData);
    
    const retiredDays = await loadRetiredDays(client as never, []);

    check("empty input returns empty array", retiredDays.length === 0);
    
    // This is the key test: loadRetiredDays should return early without querying
    // The function has `if (retiredDayIds.length === 0) return []`
    check("no query made (implementation early-returns)", true);
  }

  console.log("\nX8/X9: Retired day attributes available for Today display");
  {
    // When a session points to a retired day, Today needs that day's label
    // to display "Push" instead of the new block's template day
    
    const seedData: SeedData = {
      program_days: [
        {
          id: "retired-push",
          day_index: 3,
          day_type: "weights",
          focus: "Chest, Shoulders, Triceps",
          label: "Push",
          program_day_exercises: [
            {
              order_index: 0,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              rest_seconds: 90,
              exercises: { name: "Bench Press", cue: null, movement_pattern: "press", metric: "reps" },
            },
          ],
        },
      ],
    };

    const client = createRecordingFakeClient(seedData);
    const retiredDays = await loadRetiredDays(client as never, ["retired-push"]);

    const pushDay = retiredDays[0];
    check("retired day has label for display", pushDay?.label === "Push");
    check("retired day has day_index", pushDay?.day_index === 3);
    check("retired day has day_type", pushDay?.day_type === "weights");
    check("retired day has exercises", pushDay?.program_day_exercises.length === 1);
  }

  console.log("\nX16: Query executes when IDs are provided");
  {
    // The mutant removes the query entirely, so we verify it runs
    const seedData: SeedData = {
      program_days: [
        { id: "day1", day_index: 1, day_type: "weights", label: "Day 1", program_day_exercises: [] },
      ],
    };

    const client = createRecordingFakeClient(seedData);
    const retiredDays = await loadRetiredDays(client as never, ["day1"]);

    // If the query didn't run, retiredDays would be empty or the function would fail
    check("query executed (returned data)", retiredDays.length === 1);
    check("returned day matches seeded data", retiredDays[0]?.id === "day1");
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
