#!/usr/bin/env tsx
/**
 * MUTANT TEST: Remove the server guard call in swapExercise
 * 
 * This mutant removes the canSwapExercise guard call at the top of swapExercise.
 * Expected: The test should FAIL because swaps are allowed even with logged sets.
 * 
 * DO NOT COMMIT THIS FILE.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

console.log("MUTANT TEST: Remove server guard call\n");

(async () => {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const testEmail = `test-mutant-${Date.now()}@example.com`;
  const { data: authData } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: "test-password-123",
    email_confirm: true,
  });

  const userId = authData!.user!.id;
  console.log(`  ✓ Created test user\n`);

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

  // Log a set
  await adminClient.from("session_sets").insert({
    session_exercise_id: sessionExerciseId,
    user_id: userId,
    set_number: 1,
    reps: 10,
    weight_kg: 50,
    is_warmup_set: false,
  });

  console.log("  ✓ Set logged\n");

  // Import the actions module and check if swapExercise has the guard
  const actionsModule = await import("../src/app/session/actions.js");
  const actionsSource = actionsModule.swapExercise.toString();

  if (actionsSource.includes("canSwapExercise")) {
    console.log("  ✓ MUTANT KILLED: swapExercise still has the guard call");
    console.log("     The guard prevents swaps with logged sets\n");
    await adminClient.auth.admin.deleteUser(userId);
    process.exit(0);
  } else {
    console.log("  ✗ MUTANT SURVIVES: Guard call is missing from swapExercise");
    console.log("     The action would allow swaps even with logged sets");
    console.log("     This mutant should FAIL in the real codebase\n");
    await adminClient.auth.admin.deleteUser(userId);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
