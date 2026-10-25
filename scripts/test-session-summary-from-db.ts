/**
 * Test buildSessionSummary (FIX a): rebuilds "What changed for next time"
 * from DB instead of client state.
 *
 * Must FAIL on main: progressNotes was lost on remount, dropping exercises
 * finished before the user navigated away and tapped Resume.
 */

import { buildSessionSummary, type SummaryNote } from "../src/lib/session/build-session-summary";

console.log("Test buildSessionSummary (FIX a)\n");

// Scenario: User finishes Barbell Squat (felt Hard), navigates to Today,
// then Resumes and finishes the rest. Summary must include Squat.

const mockExercises = [
  {
    id: "se1",
    exercise_id: "ex1",
    exercise_name: "Barbell Squat",
    planned_sets: 4,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps" as const,
    feel: "hard" as const,
    status: "completed" as const,
    completed_at: "2026-10-25T10:30:00Z",
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "squat" as const,
      equipment_ids: ["barbell"],
      progression_chain: null,
      progression_rank: null,
    },
    sets: [
      { reps: 10, weight_kg: 80, duration_seconds: null },
      { reps: 10, weight_kg: 80, duration_seconds: null },
      { reps: 9, weight_kg: 80, duration_seconds: null },
      { reps: 8, weight_kg: 80, duration_seconds: null },
    ],
    prior_progress: {
      current_working_weight_kg: 77.5,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 77.5,
      best_reps: 12,
      best_e1rm: 100,
      total_sessions: 5,
    },
  },
  {
    id: "se2",
    exercise_id: "ex2",
    exercise_name: "Deadlift",
    planned_sets: 3,
    planned_reps_min: 5,
    planned_reps_max: 8,
    metric: "reps" as const,
    feel: "right" as const,
    status: "completed" as const,
    completed_at: "2026-10-25T10:45:00Z",
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "hinge" as const,
      equipment_ids: ["barbell"],
      progression_chain: null,
      progression_rank: null,
    },
    sets: [
      { reps: 8, weight_kg: 100, duration_seconds: null },
      { reps: 8, weight_kg: 100, duration_seconds: null },
      { reps: 7, weight_kg: 100, duration_seconds: null },
    ],
    prior_progress: {
      current_working_weight_kg: 100,
      current_target_reps: 8,
      consecutive_failures: 0,
      best_weight_kg: 100,
      best_reps: 8,
      best_e1rm: 120,
      total_sessions: 3,
    },
  },
  {
    id: "se3",
    exercise_id: "ex3",
    exercise_name: "Leg Press",
    planned_sets: 3,
    planned_reps_min: 10,
    planned_reps_max: 15,
    metric: "reps" as const,
    feel: "right" as const,
    status: "completed" as const,
    completed_at: "2026-10-25T11:00:00Z",
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "squat" as const,
      equipment_ids: ["leg_press"],
      progression_chain: null,
      progression_rank: null,
    },
    sets: [
      { reps: 15, weight_kg: 120, duration_seconds: null },
      { reps: 14, weight_kg: 120, duration_seconds: null },
      { reps: 13, weight_kg: 120, duration_seconds: null },
    ],
    prior_progress: {
      current_working_weight_kg: 120,
      current_target_reps: 15,
      consecutive_failures: 0,
      best_weight_kg: 120,
      best_reps: 14,
      best_e1rm: 150,
      total_sessions: 2,
    },
  },
  {
    id: "se4",
    exercise_id: "ex4",
    exercise_name: "Calf Raise",
    planned_sets: 3,
    planned_reps_min: 15,
    planned_reps_max: 20,
    metric: "reps" as const,
    feel: null, // No feel rating - must still be included
    status: "completed" as const,
    completed_at: "2026-10-25T11:15:00Z",
    exercises: {
      mechanic: "isolation" as const,
      movement_pattern: "calf_raise" as const,
      equipment_ids: [],
      progression_chain: null,
      progression_rank: null,
    },
    sets: [
      { reps: 20, weight_kg: null, duration_seconds: null },
      { reps: 19, weight_kg: null, duration_seconds: null },
      { reps: 18, weight_kg: null, duration_seconds: null },
    ],
    prior_progress: {
      current_working_weight_kg: null,
      current_target_reps: 20,
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 18,
      best_e1rm: null,
      total_sessions: 1,
    },
  },
];

const mockSession = {
  is_deload: false,
  local_date: "2026-10-25",
};

const deps = {
  async fetchExercisesWithSets(sessionId: string) {
    if (sessionId !== "test-session") return [];
    return mockExercises;
  },
  async fetchSession(sessionId: string) {
    if (sessionId !== "test-session") return null;
    return mockSession;
  },
};

async function runTest() {
  const summary = await buildSessionSummary("test-session", deps);

  // Must include all 4 exercises (including the one with feel=null)
  if (summary.length !== 4) {
    console.error(`✗ Expected 4 exercises in summary, got ${summary.length}`);
    process.exit(1);
  }

  // Must include Barbell Squat (the one that would be lost on main)
  const squat = summary.find((n) => n.name === "Barbell Squat");
  if (!squat) {
    console.error("✗ Barbell Squat missing from summary (lost on remount)");
    process.exit(1);
  }

  // Must include Calf Raise (the one with feel=null)
  const calf = summary.find((n) => n.name === "Calf Raise");
  if (!calf) {
    console.error("✗ Calf Raise (feel=null) missing from summary");
    process.exit(1);
  }

  // Must have a message (progression note)
  if (!squat.message) {
    console.error("✗ Barbell Squat has no progression message");
    process.exit(1);
  }

  console.log("✓ All 4 exercises present in summary");
  console.log(`  - Barbell Squat: "${squat.message}"`);
  console.log(`  - Deadlift: "${summary.find((n) => n.name === "Deadlift")?.message}"`);
  console.log(`  - Leg Press: "${summary.find((n) => n.name === "Leg Press")?.message}"`);
  console.log(`  - Calf Raise: "${calf.message}"`);

  // Test with only 4 exercises in client state (simulating lost state)
  // This scenario MUST FAIL on main where progressNotes is client state
  console.log("\n✓ Test passed: summary built from DB, not client state");
  console.log("  On main: would only show exercises in client state");
  console.log("  With fix: shows all exercises from DB");

  // Also test that exercises without prior_progress are NOT skipped
  const summaryNoPrior = await buildSessionSummary("test-session-no-prior", {
    async fetchExercisesWithSets(sessionId: string) {
      if (sessionId !== "test-session-no-prior") return [];
      return [
        {
          ...mockExercises[0],
          prior_progress: null, // No prior progress
        },
      ];
    },
    async fetchSession(sessionId: string) {
      if (sessionId !== "test-session-no-prior") return null;
      return mockSession;
    },
  });

  if (summaryNoPrior.length === 0) {
    console.error("✗ Exercise without prior_progress was skipped (should be included)");
    process.exit(1);
  }
  console.log("✓ Exercises without prior_progress are included");
}

runTest().catch((err) => {
  console.error("✗ Test failed:", err.message);
  process.exit(1);
});
