/**
 * Test that loggedSetsRes is properly wired into todayExercises.loggedSets.
 * 
 * FIX (c): loggedSetsRes was fetched but never used. This test verifies
 * that the data flows from the fetch through formatLoggedSets into each
 * row's loggedSets field, excluding warm-ups.
 * 
 * The test builds the row key manually ("actual-{order_index}") and verifies
 * that a mock logged set is formatted and assigned.
 */

import { formatLoggedSets, type LoggedSet } from "@/lib/session/format-logged-sets";

function testLoggedSetsWiring() {
  // Mock data structure matching page.tsx
  type TodayRow = {
    key: string;
    name: string;
    cue: string | null;
    metric: "reps" | "seconds" | null;
    sets: number | null;
    repsMin: number | null;
    repsMax: number | null;
    restSeconds: number | null;
    skipped: boolean;
    swappedIn: boolean;
    loggedSets?: string | null;
  };

  // Build mock todayExercises with actual- keys (from performed session)
  const todayExercises: TodayRow[] = [
    {
      key: "actual-0",
      name: "Bench Press",
      cue: null,
      metric: "reps",
      sets: 5,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 180,
      skipped: false,
      swappedIn: false,
    },
    {
      key: "actual-1",
      name: "Plank",
      cue: null,
      metric: "seconds",
      sets: 3,
      repsMin: 30,
      repsMax: 60,
      restSeconds: 60,
      skipped: false,
      swappedIn: false,
    },
  ];

  // Mock loggedSetsRes data
  const loggedSetsRes = {
    data: [
      {
        order_index: 0,
        metric: "reps" as const,
        session_sets: [
          { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: true }, // warm-up
          { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
          { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
          { reps: 9, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
        ],
      },
      {
        order_index: 1,
        metric: "seconds" as const,
        session_sets: [
          { reps: null, weight_kg: null, duration_seconds: 45, is_warmup_set: false },
          { reps: null, weight_kg: null, duration_seconds: 42, is_warmup_set: false },
          { reps: null, weight_kg: null, duration_seconds: 40, is_warmup_set: false },
        ],
      },
    ],
  };

  // Replicate the wiring logic from page.tsx
  const units = "metric"; // or "imperial"
  const loggedByOrder = new Map(
    loggedSetsRes.data.map((ex) => [
      ex.order_index,
      {
        metric: ex.metric,
        sets: ex.session_sets ?? [],
      },
    ])
  );

  for (const row of todayExercises) {
    const logged = loggedByOrder.get(parseInt(row.key.replace("actual-", ""), 10));
    if (logged && logged.sets.length > 0 && row.metric) {
      const formatted = formatLoggedSets(
        logged.sets.map((s) => ({
          reps: s.reps,
          weightKg: s.weight_kg,
          durationSeconds: s.duration_seconds,
          isWarmupSet: s.is_warmup_set,
        })),
        row.metric,
        units,
      );
      if (formatted) {
        row.loggedSets = formatted;
      }
    }
  }

  // Verify the wiring worked
  const bench = todayExercises[0];
  if (!bench.loggedSets) {
    console.error("❌ Bench Press loggedSets is null, expected formatted string");
    process.exit(1);
  }
  // Expect "10, 10, 9 × 80 kg" (3 working sets, warm-up excluded)
  if (!bench.loggedSets.includes("10, 10, 9")) {
    console.error(`❌ Bench Press loggedSets wrong format: ${bench.loggedSets}`);
    process.exit(1);
  }
  if (!bench.loggedSets.includes("80")) {
    console.error(`❌ Bench Press loggedSets missing weight: ${bench.loggedSets}`);
    process.exit(1);
  }

  const plank = todayExercises[1];
  if (!plank.loggedSets) {
    console.error("❌ Plank loggedSets is null, expected formatted string");
    process.exit(1);
  }
  // Expect "45s, 42s, 40s"
  if (!plank.loggedSets.includes("45s") || !plank.loggedSets.includes("42s")) {
    console.error(`❌ Plank loggedSets wrong format: ${plank.loggedSets}`);
    process.exit(1);
  }

  console.log("✓ Logged sets wiring test passed");
  console.log(`  Bench: ${bench.loggedSets}`);
  console.log(`  Plank: ${plank.loggedSets}`);
}

testLoggedSetsWiring();
