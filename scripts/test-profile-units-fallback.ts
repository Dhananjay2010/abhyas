#!/usr/bin/env tsx
/**
 * Test: readProfileUnitsOrNull returns null on error, and progression feedback is unit-neutral
 * 
 * When profile read fails (error, throw, null profile), readProfileUnitsOrNull must return null,
 * and the progression feedback must contain neither "kg" nor "lb".
 */

import { readProfileUnitsOrNull } from "../src/lib/program/read-profile-units-or-null";
import { progressionFeedback } from "../src/lib/session/progression-feedback";

type SupabaseQuery<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseQueryBuilder<T> = {
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  single: () => Promise<SupabaseQuery<T>>;
};

type MinimalSupabaseClient = {
  from: <T>(table: string) => {
    select: (columns: string) => SupabaseQueryBuilder<T>;
  };
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTest: readProfileUnitsOrNull fallback and unit-neutral feedback\n");

// Typed fake client that returns error
function createErrorClient(): MinimalSupabaseClient {
  return {
    from: <T>() => {
      const builder: SupabaseQueryBuilder<T> = {
        eq: () => builder,
        single: async () => ({
          data: null,
          error: { message: "Connection timeout" },
        }),
      };
      return {
        select: () => builder,
      };
    },
  };
}

// Typed fake client that throws exception
function createThrowingClient(): MinimalSupabaseClient {
  return {
    from: <T>() => {
      const builder: SupabaseQueryBuilder<T> = {
        eq: () => builder,
        single: async () => {
          throw new Error("Network failure");
        },
      };
      return {
        select: () => builder,
      };
    },
  };
}

// Typed fake client that returns null profile
function createNullProfileClient(): MinimalSupabaseClient {
  return {
    from: <T>() => {
      const builder: SupabaseQueryBuilder<T> = {
        eq: () => builder,
        single: async () => ({
          data: null,
          error: null,
        }),
      };
      return {
        select: () => builder,
      };
    },
  };
}

// Typed fake client that returns imperial
function createImperialClient(): MinimalSupabaseClient {
  return {
    from: <T>(table: string) => {
      const builder: SupabaseQueryBuilder<T> = {
        eq: () => builder,
        single: async () => {
          if (table === "profiles") {
            return {
              data: { units: "imperial" } as T,
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return {
        select: () => builder,
      };
    },
  };
}

// Typed fake client that returns metric
function createMetricClient(): MinimalSupabaseClient {
  return {
    from: <T>(table: string) => {
      const builder: SupabaseQueryBuilder<T> = {
        eq: () => builder,
        single: async () => {
          if (table === "profiles") {
            return {
              data: { units: "metric" } as T,
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return {
        select: () => builder,
      };
    },
  };
}

// Test helper to call readProfileUnitsOrNull with a minimal fake client
async function testReader(client: MinimalSupabaseClient, userId: string) {
  // In test code, we use the minimal client directly
  // The type system knows it's compatible for the methods we actually call
  return readProfileUnitsOrNull(client as never, userId);
}

async function main() {
  console.log("1. Error case returns null");
  {
    const client = createErrorClient();
    const units = await testReader(client, "user-1");
    check("Error case returns null", units === null, `got: ${units}`);
  }

  console.log("\n2. Throw case returns null");
  {
    const client = createThrowingClient();
    const units = await testReader(client, "user-1");
    check("Throw case returns null", units === null, `got: ${units}`);
  }

  console.log("\n3. Null profile returns null");
  {
    const client = createNullProfileClient();
    const units = await testReader(client, "user-1");
    check("Null profile returns null", units === null, `got: ${units}`);
  }

  console.log("\n4. Valid imperial returns 'imperial'");
  {
    const client = createImperialClient();
    const units = await testReader(client, "user-1");
    check("Valid imperial returns 'imperial'", units === "imperial", `got: ${units}`);
  }

  console.log("\n5. Valid metric returns 'metric'");
  {
    const client = createMetricClient();
    const units = await testReader(client, "user-1");
    check("Valid metric returns 'metric'", units === "metric", `got: ${units}`);
  }

  console.log("\n6. Unit-neutral feedback contains neither /\\bkg\\b/ nor /\\blb\\b/");
  {
    // Mock session exercise, sets, prior, session for progression feedback
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
      { reps: 7, weight_kg: 60, duration_seconds: null },
      { reps: 7, weight_kg: 60, duration_seconds: null },
      { reps: 7, weight_kg: 60, duration_seconds: null },
      { reps: 7, weight_kg: 60, duration_seconds: null },
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
    
    const { decision, personalBest } = progressionFeedback(se, sets, prior, session, "right", null);
    
    const hasKg = /\bkg\b/i.test(decision.message);
    const hasLb = /\blb\b/i.test(decision.message);
    
    check("Null units: message has no 'kg'", !hasKg, `message: ${decision.message}`);
    check("Null units: message has no 'lb'", !hasLb, `message: ${decision.message}`);
    check("Null units: personalBest is null", personalBest === null, `got: ${personalBest}`);
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

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});

// Mutant: readProfileUnitsOrNull returns "metric" on error (not null)
console.log("\n=== MUTANT: Return 'metric' on error instead of null ===");
{
  const BACKUP = "/tmp/read-profile-units-backup-$(date +%s%N).ts";
  const TARGET = "src/lib/program/read-profile-units-or-null.ts";
  
  // Inline mutation test
  const fs = require("fs");
  const original = fs.readFileSync(TARGET, "utf8");
  
  try {
    // Apply mutation: return "metric" instead of null
    const mutated = original.replace(/return null;/g, 'return "metric";');
    fs.writeFileSync(TARGET, mutated);
    
    // Re-import the mutated module
    delete require.cache[require.resolve("../src/lib/program/read-profile-units-or-null")];
    const { readProfileUnitsOrNull: mutatedReader } = require("../src/lib/program/read-profile-units-or-null");
    
    // Test should fail
    const client = createErrorClient();
    const units = await mutatedReader(client as any, "user-1");
    
    if (units === null) {
      console.log("  ❌ MUTANT SURVIVED: Still returns null");
      failures++;
    } else {
      console.log(`  ✅ KILLED: Mutant detected - returns '${units}' instead of null`);
    }
    
  } finally {
    // Restore original
    fs.writeFileSync(TARGET, original);
  }
}

if (failures > 0) {
  console.log(`\n❌ FINAL: ${failures} FAILURES\n`);
  process.exit(1);
}

console.log("\n✅ FINAL: ALL CHECKS AND MUTANT PASSED\n");
