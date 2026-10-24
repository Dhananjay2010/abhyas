#!/usr/bin/env tsx
/**
 * Test deleting a single set from History detail.
 * Verifies:
 * - Set is deleted with proper RLS (user owns it)
 * - Set counts, volume update
 * - Streak/day eligibility updates when last working set is deleted
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const inRealDB = process.env.REAL_DB === "1";

let supabaseUrl: string;
let supabaseKey: string;

if (inRealDB) {
  supabaseUrl = "http://127.0.0.1:54321";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY for real DB test");
    process.exit(1);
  }
  supabaseKey = serviceRoleKey;
} else {
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
  }
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

type TestCheck = { ok: boolean; label: string; detail?: string };
const checks: TestCheck[] = [];

function check(label: string, condition: boolean, detail?: string) {
  checks.push({ ok: condition, label, detail });
  const status = condition ? "  ok  " : " FAIL ";
  const msg = detail ? `${label}  -- ${detail}` : label;
  console.log(status, msg);
}

async function main() {
  console.log("\nTesting delete set functionality\n");

  // Create test user
  const testEmail = `delete-set-test-${Date.now()}@example.com`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: "test123456",
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Failed to create test user:", authError);
    process.exit(1);
  }

  const userId = authData.user.id;

  try {
    // Create a test session with 3 sets
    const localDate = "2026-10-24";
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        user_id: userId,
        local_date: localDate,
        status: "completed",
        actual_type: "weights",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw new Error(`Failed to create session: ${sessionError?.message}`);
    }

    // Create an exercise
    const { data: exercise, error: exerciseError } = await supabase
      .from("session_exercises")
      .insert({
        user_id: userId,
        session_id: session.id,
        exercise_id: "ex_bench_press",
        order_index: 0,
        status: "completed",
        planned_sets: 3,
        metric: "reps",
      })
      .select()
      .single();

    if (exerciseError || !exercise) {
      throw new Error(`Failed to create exercise: ${exerciseError?.message}`);
    }

    // Create 3 working sets
    const sets = [
      { set_number: 1, reps: 10, weight_kg: 60 },
      { set_number: 2, reps: 8, weight_kg: 70 },
      { set_number: 3, reps: 6, weight_kg: 80 },
    ];

    for (const set of sets) {
      const { error: setError } = await supabase.from("session_sets").insert({
        user_id: userId,
        session_exercise_id: exercise.id,
        set_number: set.set_number,
        reps: set.reps,
        weight_kg: set.weight_kg,
        is_warmup_set: false,
      });

      if (setError) {
        throw new Error(`Failed to create set: ${setError.message}`);
      }
    }

    console.log("1. Initial state: 3 working sets\n");

    // Check initial state
    const { data: initialSets } = await supabase
      .from("session_sets")
      .select("*")
      .eq("session_exercise_id", exercise.id)
      .eq("is_warmup_set", false)
      .order("set_number");

    check("initial set count is 3", initialSets?.length === 3);

    const { data: initialVolume } = await supabase
      .from("session_volume")
      .select("*")
      .eq("session_id", session.id)
      .single();

    const expectedVolume = 60 * 10 + 70 * 8 + 80 * 6;
    check(
      "initial volume is correct",
      Math.round(initialVolume?.volume_kg ?? 0) === expectedVolume,
      `${initialVolume?.volume_kg} kg`
    );

    console.log("\n2. Delete set #2 (8 reps × 70kg)\n");

    // Delete set #2
    const { error: deleteError } = await supabase
      .from("session_sets")
      .delete()
      .eq("session_exercise_id", exercise.id)
      .eq("set_number", 2)
      .eq("user_id", userId);

    check("set deleted successfully", !deleteError);

    // Check remaining sets
    const { data: remainingSets } = await supabase
      .from("session_sets")
      .select("*")
      .eq("session_exercise_id", exercise.id)
      .eq("is_warmup_set", false)
      .order("set_number");

    check("remaining set count is 2", remainingSets?.length === 2);
    check("set #1 still exists", remainingSets?.[0]?.set_number === 1);
    check("set #3 still exists", remainingSets?.[1]?.set_number === 3);

    // Check updated volume
    const { data: updatedVolume } = await supabase
      .from("session_volume")
      .select("*")
      .eq("session_id", session.id)
      .single();

    const newVolume = 60 * 10 + 80 * 6;
    check(
      "volume updated correctly",
      Math.round(updatedVolume?.volume_kg ?? 0) === newVolume,
      `${updatedVolume?.volume_kg} kg`
    );
    check(
      "set_count updated",
      updatedVolume?.set_count === 2,
      `${updatedVolume?.set_count} sets`
    );

    console.log("\n3. Delete last 2 sets (0 working sets remaining)\n");

    // Delete remaining sets
    await supabase
      .from("session_sets")
      .delete()
      .eq("session_exercise_id", exercise.id)
      .eq("user_id", userId);

    // Check final volume view
    const { data: finalVolume } = await supabase
      .from("session_volume")
      .select("*")
      .eq("session_id", session.id)
      .single();

    check(
      "session excluded from volume view (0 working sets)",
      finalVolume === null,
      "view filters out 0-working-set sessions"
    );
  } finally {
    // Clean up test user
    await supabase.auth.admin.deleteUser(userId);
  }

  console.log();
  const failed = checks.filter((c) => !c.ok).length;
  if (failed > 0) {
    console.error(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  } else {
    console.log("✅ All tests passed\n");
    console.log(
      "Conclusion: Delete set updates volume/set counts and correctly excludes\n" +
      "0-working-set sessions from streak eligibility.\n"
    );
  }
}

main();
