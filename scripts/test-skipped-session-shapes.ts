#!/usr/bin/env tsx
/**
 * Test zero-set strength session exclusion with both storage shapes.
 * 
 * Product rule (2026-10-24):
 * - Strength sessions count toward streaks/days trained ONLY when:
 *   status = 'completed' AND working_sets >= 1
 * - Two storage shapes must both be excluded:
 *   1. Legacy: status = 'completed' with 0 working sets
 *   2. New: status = 'skipped' (Dev 3's change)
 * - History shows both as 'Skipped'
 * 
 * Test case: Same day with skipped strength + completed yoga
 * - The day still counts via yoga
 * 
 * USAGE:
 *   REAL_DB=1 npx tsx scripts/test-skipped-session-shapes.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\n=== Testing zero-set session exclusion (both storage shapes) ===\n");

  // Create test user
  const testEmail = `test-skipped-${Date.now()}@example.com`;
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: "test123456",
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Failed to create test user:", authError);
    return false;
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId}\n`);

  // Create profile (no explicit insert needed - trigger creates it on auth.users insert)
  // Just verify it exists
  await new Promise((resolve) => setTimeout(resolve, 100)); // Let trigger run
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (!profile) {
    console.error("Profile was not automatically created");
    return false;
  }

  // Create program
  const { data: program, error: programError } = await adminClient
    .from("programs")
    .insert({
      user_id: userId,
      started_on: "2026-10-20",
      ends_on: "2026-11-16",
      status: "active",
      split_type: "ppl",
      weeks: 4,
    })
    .select("id")
    .single();

  if (programError || !program) {
    console.error("Program creation failed:", programError);
    return false;
  }

  // Create program days
  for (let i = 1; i <= 7; i++) {
    await adminClient.from("program_days").insert({
      program_id: program.id,
      day_index: i,
      day_type: i === 7 ? "rest" : "weights",
    });
  }

  // Test 1: Legacy shape - completed with 0 sets
  console.log("Test 1: Legacy completed strength session with 0 working sets");
  
  const { data: legacySession, error: legacyError } = await adminClient
    .from("sessions")
    .insert({
      user_id: userId,
      local_date: "2026-10-21",
      status: "completed",
      actual_type: "weights",
      started_at: "2026-10-21T10:00:00Z",
      completed_at: "2026-10-21T10:30:00Z",
    })
    .select("id")
    .single();

  if (legacyError || !legacySession) {
    console.error("Legacy session creation failed:", legacyError);
    return false;
  }

  // Create session exercise but no working sets (only warmup or nothing)
  const { data: legacyExercise, error: legacyExError } = await adminClient
    .from("session_exercises")
    .insert({
      user_id: userId,
      session_id: legacySession.id,
      exercise_id: "squat",
      status: "completed",
      planned_sets: 3,
    })
    .select("id")
    .single();

  if (legacyExError || !legacyExercise) {
    console.error("Legacy exercise creation failed:", legacyExError);
    return false;
  }

  // Add only warmup sets (0 working sets)
  await adminClient.from("session_sets").insert([
    {
      user_id: userId,
      session_exercise_id: legacyExercise.id,
      set_number: 1,
      reps: 10,
      weight_kg: 20,
      is_warmup_set: true,
    },
    {
      user_id: userId,
      session_exercise_id: legacyExercise.id,
      set_number: 2,
      reps: 8,
      weight_kg: 40,
      is_warmup_set: true,
    },
  ]);

  // Check: session_volume should be empty (migration excludes 0-working-set)
  const { data: legacyVolume } = await adminClient
    .from("session_volume")
    .select("*")
    .eq("session_id", legacySession.id);

  check("Legacy (completed+0 sets) excluded from session_volume", legacyVolume?.length === 0);

  // Test 2: New shape - skipped status
  console.log("\nTest 2: New skipped strength session");

  const { data: skippedSession, error: skippedError } = await adminClient
    .from("sessions")
    .insert({
      user_id: userId,
      local_date: "2026-10-22",
      status: "skipped",
      actual_type: "weights",
      started_at: "2026-10-22T10:00:00Z",
    })
    .select("id")
    .single();

  if (skippedError || !skippedSession) {
    console.error("Skipped session creation failed:", skippedError);
    return false;
  }

  // Check: session_volume should be empty (skipped never has sets)
  const { data: skippedVolume } = await adminClient
    .from("session_volume")
    .select("*")
    .eq("session_id", skippedSession.id);

  check("New (skipped status) excluded from session_volume", skippedVolume?.length === 0);

  // Test 3: Skipped strength + completed yoga on same day
  console.log("\nTest 3: Same day with skipped strength + completed yoga");

  const { data: mixedSkipped, error: mixedSkippedError } = await adminClient
    .from("sessions")
    .insert({
      user_id: userId,
      local_date: "2026-10-23",
      status: "skipped",
      actual_type: "weights",
      started_at: "2026-10-23T10:00:00Z",
    })
    .select("id")
    .single();

  if (mixedSkippedError || !mixedSkipped) {
    console.error("Mixed skipped creation failed:", mixedSkippedError);
    return false;
  }

  const { data: mixedYoga, error: mixedYogaError } = await adminClient
    .from("sessions")
    .insert({
      user_id: userId,
      local_date: "2026-10-23",
      status: "completed",
      actual_type: "yoga",
      started_at: "2026-10-23T18:00:00Z",
      completed_at: "2026-10-23T19:00:00Z",
      duration_seconds: 3600,
    })
    .select("id")
    .single();

  if (mixedYogaError || !mixedYoga) {
    console.error("Mixed yoga creation failed:", mixedYogaError);
    return false;
  }

  // Query sessions that should count toward streaks (completed, with volume for strength)
  const { data: allSessions } = await adminClient
    .from("sessions")
    .select("id, local_date, status, actual_type")
    .eq("user_id", userId)
    .eq("status", "completed");

  const sessionIds = (allSessions ?? []).map((s) => s.id);

  const { data: volumeData } = await adminClient
    .from("session_volume")
    .select("session_id")
    .in("session_id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  const sessionsWithVolume = new Set((volumeData ?? []).map((v) => v.session_id));

  // Filter: keep yoga always, keep strength only if it has volume
  const countingSessions = (allSessions ?? []).filter((s) => {
    if (s.actual_type === "yoga") return true;
    if (s.actual_type === "weights" || s.actual_type === "bodyweight") {
      return sessionsWithVolume.has(s.id);
    }
    return false;
  });

  check(
    "Only yoga session counts (skipped strength excluded)",
    countingSessions.length === 1 && countingSessions[0].actual_type === "yoga"
  );
  check("Day 2026-10-23 counts via yoga", countingSessions.some((s) => s.local_date === "2026-10-23"));

  // Test 4: Completed strength with working sets DOES count
  console.log("\nTest 4: Completed strength with working sets (control)");

  const { data: validSession, error: validError } = await adminClient
    .from("sessions")
    .insert({
      user_id: userId,
      local_date: "2026-10-24",
      status: "completed",
      actual_type: "weights",
      started_at: "2026-10-24T10:00:00Z",
      completed_at: "2026-10-24T11:00:00Z",
    })
    .select("id")
    .single();

  if (validError || !validSession) {
    console.error("Valid session creation failed:", validError);
    return false;
  }

  const { data: validExercise, error: validExError } = await adminClient
    .from("session_exercises")
    .insert({
      user_id: userId,
      session_id: validSession.id,
      exercise_id: "squat",
      status: "completed",
      planned_sets: 3,
    })
    .select("id")
    .single();

  if (validExError || !validExercise) {
    console.error("Valid exercise creation failed:", validExError);
    return false;
  }

  // Add working sets
  await adminClient.from("session_sets").insert([
    {
      user_id: userId,
      session_exercise_id: validExercise.id,
      set_number: 1,
      reps: 5,
      weight_kg: 100,
      is_warmup_set: false,
    },
    {
      user_id: userId,
      session_exercise_id: validExercise.id,
      set_number: 2,
      reps: 5,
      weight_kg: 100,
      is_warmup_set: false,
    },
    {
      user_id: userId,
      session_exercise_id: validExercise.id,
      set_number: 3,
      reps: 5,
      weight_kg: 100,
      is_warmup_set: false,
    },
  ]);

  const { data: validVolume } = await adminClient
    .from("session_volume")
    .select("*")
    .eq("session_id", validSession.id);

  check(
    "Valid completed+working sets IS in session_volume",
    validVolume !== null && validVolume.length > 0
  );

  // Cleanup
  await adminClient.auth.admin.deleteUser(userId);

  return true;
}

runTests()
  .then((ok) => {
    console.log();
    if (!ok || failures > 0) {
      console.error(`❌ ${failures} test(s) failed\n`);
      process.exit(1);
    } else {
      console.log("✅ All tests passed\n");
      console.log("Conclusion:");
      console.log("- Legacy completed+0 sets: excluded from session_volume ✓");
      console.log("- New skipped status: excluded from session_volume ✓");
      console.log("- Skipped strength + completed yoga on same day: day counts via yoga ✓");
      console.log("- Completed strength with working sets: included in session_volume ✓\n");
    }
  })
  .catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  });
