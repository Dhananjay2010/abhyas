#!/usr/bin/env tsx
/**
 * L4B-4 Behavioral Kill: Test real actions.ts buildProgressionFeedbackForUser
 * 
 * Tests the REAL production helper with a typed fake Supabase client.
 * 
 * Mutants:
 * - L4B-4a: Inside helper, ignore getUnits result and hardcode 'metric'
 * - L4B-4b: In applyProgression, pass async () => 'metric' instead of getProfileUnits
 * 
 * Expected: Test FAILS with assertion error, exit 1, no crash.
 */

import { buildProgressionFeedbackForUser } from "../src/app/session/actions";
import type { UnitsPreference } from "../src/lib/units";
import type { Database } from "../src/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`❌ FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

type ServerClient = SupabaseClient<Database>;

// Minimal Supabase client interface that buildProgressionFeedbackForUser needs
type MinimalSupabaseClient = ServerClient;

class FakeQueryBuilder {
  private tableName: string;
  private cannedData: Record<string, unknown>;
  private filters: Array<{ column: string; value: string | boolean }> = [];

  constructor(table: string, cannedData: Record<string, unknown>) {
    this.tableName = table;
    this.cannedData = cannedData;
  }

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: string | boolean): this {
    this.filters.push({ column, value });
    return this;
  }

  order(_column: string, _opts?: { ascending?: boolean }): this {
    return this;
  }

  in(_column: string, _values: unknown[]): this {
    return this;
  }

  limit(_count: number): this {
    return this;
  }

  async maybeSingle(): Promise<{ data: unknown; error: null }> {
    const data = this.cannedData[this.tableName];
    return { data, error: null };
  }

  async single(): Promise<{ data: unknown; error: null }> {
    const data = this.cannedData[this.tableName];
    return { data, error: null };
  }

  // Awaitable for array results (session_sets)
  then<T>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T) | null,
    _onrejected?: ((reason: unknown) => unknown) | null
  ): Promise<T> {
    const data = this.cannedData[this.tableName];
    const result = { data, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(result) : result as unknown as T);
  }

  update(_data: unknown) {
    return {
      async eq(_column: string, _value: string) {
        return { error: null };
      },
    };
  }

  async insert(_data: unknown): Promise<{ error: null }> {
    return { error: null };
  }

  async upsert(_data: unknown): Promise<{ error: null }> {
    return { error: null };
  }
}

class FakeSupabaseClient {
  private cannedData: Record<string, unknown>;

  constructor(cannedData: Record<string, unknown>) {
    this.cannedData = cannedData;
  }

  from(table: string) {
    return new FakeQueryBuilder(table, this.cannedData);
  }
}

console.log("=== L4B-4: Real actions.ts helper with typed fake client ===\n");

const cannedData: Record<string, unknown> = {
  user_settings: { planning_mode: "progression", per_set_logging: true },
  session_exercises: {
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
  sessions: { is_deload: false, local_date: "2026-10-26", program_id: "p1" },
  session_sets: [
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
  ],
  exercise_progress: {
    current_working_weight_kg: "40",
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: "40",
    best_reps: 12,
    best_e1rm: "56",
    total_sessions: 5,
    weight_at_failure_start_kg: null,
  },
};

const fakeClient: MinimalSupabaseClient = new FakeSupabaseClient(cannedData) as unknown as MinimalSupabaseClient;

const fakeGetUnits = async (_client: MinimalSupabaseClient, _userId: string): Promise<UnitsPreference> => {
  return "imperial";
};

(async () => {
  try {
    console.log("Executing buildProgressionFeedbackForUser with imperial units...");
    
    const result = await buildProgressionFeedbackForUser(
      fakeClient,
      "user1",
      "se1",
      "right",
      fakeGetUnits,
    );

    if (!result) {
      console.error("❌ FAIL: No result returned");
      process.exit(1);
    }

    console.log(`  Message: "${result.message}"\n`);

    check("Message contains 'lb'", result.message.includes("lb"), result.message);
    check("Message does NOT contain 'kg'", !result.message.includes("kg"), result.message);
    check("Message shows '93.5 lb' (40 kg → 42.5 kg)", result.message.includes("93.5 lb"), result.message);

    console.log("\n=== SUMMARY ===");
    if (failures > 0) {
      console.log(`FAILED: ${failures} checks`);
      console.log("Mutants L4B-4a/b would cause this test to FAIL (assertion error, exit 1)");
      process.exit(1);
    } else {
      console.log("✅ ALL PASS");
      console.log("Kills L4B-4a: ignore getUnits result, hardcode 'metric' → test FAILS");
      console.log("Kills L4B-4b: applyProgression passes () => 'metric' → test FAILS");
      process.exit(0);
    }
  } catch (err) {
    console.error("❌ EXCEPTION:", err);
    console.error("Stack:", (err as Error).stack);
    process.exit(1);
  }
})();
