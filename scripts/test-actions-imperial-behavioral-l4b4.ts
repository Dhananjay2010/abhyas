#!/usr/bin/env tsx
/**
 * L4B-4 Behavioral Kill: Test real actions.ts code path with injected units loader
 */

import { buildProgressionFeedbackForUser } from "../src/app/session/actions";
import type { UnitsPreference } from "../src/lib/units";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`❌ FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("=== L4B-4: Real actions.ts helper with fake units ===\n");

const fakeDb: any = {
  from(table: string) {
    return {
      select() {
        return {
          eq() {
            return {
              async maybeSingle() {
                if (table === "user_settings") {
                  return { data: { planning_mode: "progression", per_set_logging: true }, error: null };
                }
                if (table === "session_exercises") {
                  return {
                    data: {
                      id: "se1",
                      session_id: "s1",
                      exercise_id: "e1",
                      planned_sets: 3,
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
                    },
                    error: null,
                  };
                }
                if (table === "sessions") {
                  return { data: { is_deload: false, local_date: "2026-10-26", program_id: "p1" }, error: null };
                }
                if (table === "exercise_progress") {
                  return {
                    data: {
                      current_working_weight_kg: "40",
                      current_target_reps: 12,
                      consecutive_failures: 0,
                      best_weight_kg: "40",
                      best_reps: 12,
                      best_e1rm: "56",
                      total_sessions: 5,
                      weight_at_failure_start_kg: null,
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
              order() { return this; },
            };
          },
        };
      },
      update() {
        return { async eq() { return { error: null }; } };
      },
      async insert() { return { error: null }; },
      async upsert() { return { error: null }; },
    };
  },
};

const fakeGetUnits = async (): Promise<UnitsPreference> => "imperial";

(async () => {
  try {
    const result = await buildProgressionFeedbackForUser(fakeDb, "user1", "se1", "right", fakeGetUnits);
    if (!result) {
      console.error("❌ No result");
      process.exit(1);
    }

    console.log(`Message: "${result.message}"\n`);

    check("Contains 'lb'", result.message.includes("lb"), result.message);
    check("No 'kg'", !result.message.includes("kg"), result.message);
    check("Shows '93.5 lb'", result.message.includes("93.5 lb"), result.message);

    if (failures > 0) {
      console.log(`\nFAILED: ${failures} checks`);
      process.exit(1);
    } else {
      console.log("\n✅ PASS - Kills L4B-4");
      process.exit(0);
    }
  } catch (err) {
    console.error("❌ EXCEPTION:", err);
    process.exit(1);
  }
})();
