#!/usr/bin/env tsx
/**
 * Test: readProfileUnitsOrNull returns null on error, and progression feedback is unit-neutral
 * 
 * When profile read fails (error, throw, null profile), readProfileUnitsOrNull must return null,
 * and the progression feedback must contain neither "kg" nor "lb".
 */

import { readProfileUnitsOrNull, type ProfileUnitsQuery } from "../src/lib/program/read-profile-units-or-null";
import { progressionFeedback } from "../src/lib/session/progression-feedback";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTest: readProfileUnitsOrNull fallback and unit-neutral feedback\n");

// Query function that returns error
function createErrorQuery(): () => ProfileUnitsQuery {
  return async () => ({
    data: null,
    error: { message: "Connection timeout" },
  });
}

// Query function that throws exception
function createThrowingQuery(): () => ProfileUnitsQuery {
  return async () => {
    throw new Error("Network failure");
  };
}

// Query function that returns null profile
function createNullProfileQuery(): () => ProfileUnitsQuery {
  return async () => ({
    data: null,
    error: null,
  });
}

// Query function that returns imperial
function createImperialQuery(): () => ProfileUnitsQuery {
  return async () => ({
    data: { units: "imperial" },
    error: null,
  });
}

// Query function that returns metric
function createMetricQuery(): () => ProfileUnitsQuery {
  return async () => ({
    data: { units: "metric" },
    error: null,
  });
}

async function main() {
  // Type definitions for test cases
  type SessionExerciseRow = Parameters<typeof progressionFeedback>[0];
  type SessionSetRow = Parameters<typeof progressionFeedback>[1][0];
  type ExerciseProgressRow = Parameters<typeof progressionFeedback>[2];
  type SessionRow = Parameters<typeof progressionFeedback>[3];

  console.log("1. Error case returns null");
  {
    const query = createErrorQuery();
    const units = await readProfileUnitsOrNull(query);
    check("Error case returns null", units === null, `got: ${units}`);
  }

  console.log("\n2. Throw case returns null");
  {
    const query = createThrowingQuery();
    const units = await readProfileUnitsOrNull(query);
    check("Throw case returns null", units === null, `got: ${units}`);
  }

  console.log("\n3. Null profile returns null");
  {
    const query = createNullProfileQuery();
    const units = await readProfileUnitsOrNull(query);
    check("Null profile returns null", units === null, `got: ${units}`);
  }

  console.log("\n4. Valid imperial returns 'imperial'");
  {
    const query = createImperialQuery();
    const units = await readProfileUnitsOrNull(query);
    check("Valid imperial returns 'imperial'", units === "imperial", `got: ${units}`);
  }

  console.log("\n5. Valid metric returns 'metric'");
  {
    const query = createMetricQuery();
    const units = await readProfileUnitsOrNull(query);
    check("Valid metric returns 'metric'", units === "metric", `got: ${units}`);
  }

  console.log("\n6. Unit-neutral feedback: no kg/lb, no grammar artifacts");
  {
    // Helper to check a message
    const checkNeutral = (label: string, message: string) => {
      const hasKg = /\bkg\b/i.test(message);
      const hasLb = /\blb\b/i.test(message);
      const hasToTo = /\bto to\b/i.test(message);
      const hasDotTo = /\. to\b/i.test(message);
      const hasDashDot = /—\./i.test(message);
      
      check(`${label}: no 'kg'`, !hasKg, `message: ${message}`);
      check(`${label}: no 'lb'`, !hasLb, `message: ${message}`);
      check(`${label}: no 'to to'`, !hasToTo, `message: ${message}`);
      check(`${label}: no '. to'`, !hasDotTo, `message: ${message}`);
      check(`${label}: no '—.'`, !hasDashDot, `message: ${message}`);
    };
    
    const BENCH: SessionExerciseRow = {
      id: "se-1",
      session_id: "sess-1",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };
    
    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-28",
      program_id: "prog-1",
    };
    
    // Progressed path (easy double)
    {
      const sets: SessionSetRow[] = [
        { reps: 12, weight_kg: 60, duration_seconds: null },
        { reps: 12, weight_kg: 60, duration_seconds: null },
        { reps: 12, weight_kg: 60, duration_seconds: null },
        { reps: 12, weight_kg: 60, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 60,
        current_target_reps: 12,
        consecutive_failures: 0,
        best_weight_kg: 60,
        best_reps: 12,
        best_e1rm: 84,
        total_sessions: 5,
        weight_at_failure_start_kg: null,
      };
      
      const { decision } = progressionFeedback(BENCH, sets, prior, session, "easy", null);
      checkNeutral("Progressed (easy)", decision.message);
      check("Progressed: exact neutral message", 
        decision.message === "All sets at the top of the range — ready for the next step.",
        decision.message);
    }
    
    // Barbell counter 1 (second miss)
    {
      const sets: SessionSetRow[] = [
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 60,
        current_target_reps: 12,
        consecutive_failures: 1,
        best_weight_kg: 60,
        best_reps: 12,
        best_e1rm: 84,
        total_sessions: 5,
        weight_at_failure_start_kg: 60,
      };
      
      const { decision } = progressionFeedback(BENCH, sets, prior, session, "right", null);
      checkNeutral("Barbell counter 1", decision.message);
      check("Barbell counter 1: exact neutral message",
        decision.message === "Missed twice in a row — dropping the weight to build back.",
        decision.message);
    }
    
    // Barbell counter 2 (third miss)
    {
      const sets: SessionSetRow[] = [
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 60,
        current_target_reps: 12,
        consecutive_failures: 2,
        best_weight_kg: 60,
        best_reps: 12,
        best_e1rm: 84,
        total_sessions: 5,
        weight_at_failure_start_kg: 60,
      };
      
      const { decision } = progressionFeedback(BENCH, sets, prior, session, "right", null);
      checkNeutral("Barbell counter 2", decision.message);
      check("Barbell counter 2: exact neutral message",
        decision.message === "Missed three times in a row — dropping the weight to build back.",
        decision.message);
    }
    
    // Barbell counter 3 (fourth+ miss)
    {
      const sets: SessionSetRow[] = [
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
        { reps: 7, weight_kg: 60, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 60,
        current_target_reps: 12,
        consecutive_failures: 3,
        best_weight_kg: 60,
        best_reps: 12,
        best_e1rm: 84,
        total_sessions: 5,
        weight_at_failure_start_kg: 60,
      };
      
      const { decision } = progressionFeedback(BENCH, sets, prior, session, "right", null);
      checkNeutral("Barbell counter 3", decision.message);
      check("Barbell counter 3: exact neutral message",
        decision.message === "Missed again — dropping the weight to build back.",
        decision.message);
    }
    
    // Kettlebell 3rd miss step-down
    {
      const KB: SessionExerciseRow = {
        ...BENCH,
        exercises: {
          mechanic: "compound",
          movement_pattern: "horizontal_press",
          equipment_ids: ["kettlebell"],
          progression_chain: null,
          progression_rank: null,
        },
      };
      
      const sets: SessionSetRow[] = [
        { reps: 7, weight_kg: 12, duration_seconds: null },
        { reps: 7, weight_kg: 12, duration_seconds: null },
        { reps: 7, weight_kg: 12, duration_seconds: null },
        { reps: 7, weight_kg: 12, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 12,
        current_target_reps: 12,
        consecutive_failures: 2,
        best_weight_kg: 16,
        best_reps: 12,
        best_e1rm: 21,
        total_sessions: 5,
        weight_at_failure_start_kg: 12,
      };
      
      const { decision } = progressionFeedback(KB, sets, prior, session, "right", null);
      checkNeutral("Kettlebell 3rd miss", decision.message);
      check("Kettlebell 3rd miss: exact neutral message",
        decision.message === "Missed three times in a row — dropping the weight to build back.",
        decision.message);
    }
    
    // Kettlebell 4th miss step-down
    {
      const KB: SessionExerciseRow = {
        ...BENCH,
        exercises: {
          mechanic: "compound",
          movement_pattern: "horizontal_press",
          equipment_ids: ["kettlebell"],
          progression_chain: null,
          progression_rank: null,
        },
      };
      
      const sets: SessionSetRow[] = [
        { reps: 7, weight_kg: 12, duration_seconds: null },
        { reps: 7, weight_kg: 12, duration_seconds: null },
        { reps: 7, weight_kg: 12, duration_seconds: null },
        { reps: 7, weight_kg: 12, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 12,
        current_target_reps: 12,
        consecutive_failures: 3,
        best_weight_kg: 16,
        best_reps: 12,
        best_e1rm: 21,
        total_sessions: 5,
        weight_at_failure_start_kg: 12,
      };
      
      const { decision } = progressionFeedback(KB, sets, prior, session, "right", null);
      checkNeutral("Kettlebell 4th miss", decision.message);
      check("Kettlebell 4th miss: exact neutral message",
        decision.message === "Missed again — dropping the weight to build back.",
        decision.message);
    }
    
    // Bodyweight back-off
    {
      const PULL_UP: SessionExerciseRow = {
        ...BENCH,
        exercises: {
          mechanic: "compound",
          movement_pattern: "vertical_pull",
          equipment_ids: [],
          progression_chain: null,
          progression_rank: null,
        },
      };
      
      const sets: SessionSetRow[] = [
        { reps: 7, weight_kg: 1.25, duration_seconds: null },
        { reps: 7, weight_kg: 1.25, duration_seconds: null },
        { reps: 7, weight_kg: 1.25, duration_seconds: null },
        { reps: 7, weight_kg: 1.25, duration_seconds: null },
      ];
      
      const prior: ExerciseProgressRow = {
        current_working_weight_kg: 1.25,
        current_target_reps: 12,
        consecutive_failures: 1,
        best_weight_kg: 2.5,
        best_reps: 12,
        best_e1rm: 3.4,
        total_sessions: 5,
        weight_at_failure_start_kg: 1.25,
      };
      
      const { decision } = progressionFeedback(PULL_UP, sets, prior, session, "right", null);
      checkNeutral("Bodyweight back-off", decision.message);
      check("Bodyweight back-off: exact neutral message",
        decision.message === "Missed twice in a row — back to bodyweight to build up again.",
        decision.message);
    }
  }

  console.log("\n7. Imperial user gets 'lb' in feedback");
  {
    type SessionExerciseRow = Parameters<typeof progressionFeedback>[0];
    type SessionSetRow = Parameters<typeof progressionFeedback>[1][0];
    type ExerciseProgressRow = Parameters<typeof progressionFeedback>[2];
    type SessionRow = Parameters<typeof progressionFeedback>[3];
    
    const se: SessionExerciseRow = {
      id: "se-1",
      session_id: "sess-1",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };
    
    const sets: SessionSetRow[] = [
      { reps: 12, weight_kg: 60, duration_seconds: null },
      { reps: 12, weight_kg: 60, duration_seconds: null },
      { reps: 12, weight_kg: 60, duration_seconds: null },
      { reps: 12, weight_kg: 60, duration_seconds: null },
    ];
    
    const prior: ExerciseProgressRow = {
      current_working_weight_kg: 60,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 60,
      best_reps: 12,
      best_e1rm: 84,
      total_sessions: 5,
      weight_at_failure_start_kg: null,
    };
    
    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-28",
      program_id: "prog-1",
    };
    
    const { decision } = progressionFeedback(se, sets, prior, session, "right", "imperial");
    
    const hasLb = /\blb\b/i.test(decision.message);
    check("Imperial user: message has 'lb'", hasLb, `message: ${decision.message}`);
  }

  console.log("\n8. Metric user gets 'kg' in feedback");
  {
    type SessionExerciseRow = Parameters<typeof progressionFeedback>[0];
    type SessionSetRow = Parameters<typeof progressionFeedback>[1][0];
    type ExerciseProgressRow = Parameters<typeof progressionFeedback>[2];
    type SessionRow = Parameters<typeof progressionFeedback>[3];
    
    const se: SessionExerciseRow = {
      id: "se-1",
      session_id: "sess-1",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };
    
    const sets: SessionSetRow[] = [
      { reps: 12, weight_kg: 60, duration_seconds: null },
      { reps: 12, weight_kg: 60, duration_seconds: null },
      { reps: 12, weight_kg: 60, duration_seconds: null },
      { reps: 12, weight_kg: 60, duration_seconds: null },
    ];
    
    const prior: ExerciseProgressRow = {
      current_working_weight_kg: 60,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 60,
      best_reps: 12,
      best_e1rm: 84,
      total_sessions: 5,
      weight_at_failure_start_kg: null,
    };
    
    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-28",
      program_id: "prog-1",
    };
    
    const { decision } = progressionFeedback(se, sets, prior, session, "right", "metric");
    
    const hasKg = /\bkg\b/i.test(decision.message);
    check("Metric user: message has 'kg'", hasKg, `message: ${decision.message}`);
  }

  console.log("\n9. Medicine ball at lightest ball: no null/undefined in message");
  {
    const se: SessionExerciseRow = {
      id: "se-med",
      session_id: "session-1",
      exercise_id: "ex-med",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "isolation",
        movement_pattern: "core",
        equipment_ids: ["medicine_ball"],
        progression_chain: null,
        progression_rank: null,
      },
    };
    
    const sets: SessionSetRow[] = [
      { reps: 6, weight_kg: 1, duration_seconds: null },
      { reps: 6, weight_kg: 1, duration_seconds: null },
      { reps: 6, weight_kg: 1, duration_seconds: null },
    ];
    
    const prior: ExerciseProgressRow = {
      current_working_weight_kg: 1,
      current_target_reps: 12,
      consecutive_failures: 2,
      best_weight_kg: 1,
      best_reps: 10,
      best_e1rm: null,
      total_sessions: 3,
      weight_at_failure_start_kg: 1,
    };
    
    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-28",
      program_id: "prog-1",
    };
    
    const { decision } = progressionFeedback(se, sets, prior, session, "right", null);
    
    const hasNull = /\b(null|undefined)\b/i.test(decision.message);
    const hasKg = /\bkg\b/i.test(decision.message);
    const hasLb = /\blb\b/i.test(decision.message);
    
    check("Medicine ball counter 3: no 'null'", !hasNull, `message: ${decision.message}`);
    check("Medicine ball counter 3: no 'kg'", !hasKg, `message: ${decision.message}`);
    check("Medicine ball counter 3: no 'lb'", !hasLb, `message: ${decision.message}`);
    check("Medicine ball counter 3: exact neutral message", decision.message === "Staying at this weight — aim for clean reps.", decision.message);
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
