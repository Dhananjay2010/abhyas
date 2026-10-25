#!/usr/bin/env tsx
/**
 * MUTANT TEST: Invert the guard's condition
 * 
 * This mutant inverts the condition in canSwapExercise from
 * "if (data && data.length > 0) refuse" to "if (!data || data.length === 0) refuse"
 * 
 * Expected: The test should FAIL because the guard now refuses when it should allow
 * and allows when it should refuse.
 * 
 * DO NOT COMMIT THIS FILE.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { SwapGuardDeps } from "../src/lib/session/swap-guard";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

console.log("MUTANT TEST: Invert guard condition\n");

// Mutant version of canSwapExercise with inverted logic
async function canSwapExerciseMutant(
  deps: SwapGuardDeps,
  sessionExerciseId: string,
) {
  const { data, error } = await deps.query(sessionExerciseId);

  if (error) {
    return { allowed: false, error: error.message };
  }

  // MUTANT: Inverted condition
  if (!data || data.length === 0) {
    return {
      allowed: false,
      error: "You've already logged a set for this exercise, so it can't be swapped.",
    };
  }

  return { allowed: true };
}

(async () => {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const testEmail = `test-mutant-invert-${Date.now()}@example.com`;
  const { data: authData } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: "test-password-123",
    email_confirm: true,
  });

  const userId = authData!.user!.id;

  // Create program, day, session, and exercise
  const programId = randomUUID();
  await adminClient.from("programs").insert({
    id: programId,
    user_id: userId,
    goal: "strength",
    level: "beginner",
    primary_track: "barbell",
    days_per_week: 3,
    deload_week: 4,
    started_on: "2026-10-01",
    status: "active",
  });

  const dayId = randomUUID();
  await adminClient.from("program_days").insert({
    id: dayId,
    program_id: programId,
    user_id: userId,
    day_index: 1,
    day_type: "weights",
  });

  const sessionId = randomUUID();
  await adminClient.from("sessions").insert({
    id: sessionId,
    user_id: userId,
    program_id: programId,
    program_day_id: dayId,
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
  });

  const sessionExerciseId = randomUUID();
  await adminClient.from("session_exercises").insert({
    id: sessionExerciseId,
    session_id: sessionId,
    user_id: userId,
    exercise_id: "bench-press",
    order_index: 0,
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    metric: "reps",
  });

  const client = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0");
  const { error: signInError } = await client.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError) {
    console.error("❌ Failed to sign in:", signInError);
    await adminClient.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  const deps: SwapGuardDeps = {
    query: async (seId: string) => {
      return await client
        .from("session_sets")
        .select("id")
        .eq("session_exercise_id", seId)
        .limit(1);
    },
  };

  console.log("Test 1: No sets logged");
  const result1 = await canSwapExerciseMutant(deps, sessionExerciseId);
  if (result1.allowed === false) {
    console.log("  ✗ MUTANT SURVIVES: Refused swap when no sets exist (inverted logic)");
  } else {
    console.log("  ✓ MUTANT KILLED: Allowed swap (unexpected for mutant)\n");
    await adminClient.auth.admin.deleteUser(userId);
    process.exit(0);
  }

  // Log a set
  await adminClient.from("session_sets").insert({
    session_exercise_id: sessionExerciseId,
    user_id: userId,
    set_number: 1,
    reps: 10,
    weight_kg: 50,
    is_warmup_set: false,
  });

  console.log("\nTest 2: One set logged");
  const result2 = await canSwapExerciseMutant(deps, sessionExerciseId);
  if (result2.allowed === true) {
    console.log("  ✗ MUTANT SURVIVES: Allowed swap when sets exist (inverted logic)");
    console.log("\n  This mutant inverts the guard's condition and should FAIL\n");
    await adminClient.auth.admin.deleteUser(userId);
    process.exit(1);
  } else {
    console.log("  ✓ MUTANT KILLED: Refused swap (unexpected for mutant)\n");
    await adminClient.auth.admin.deleteUser(userId);
    process.exit(0);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
