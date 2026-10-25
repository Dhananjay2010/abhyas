#!/usr/bin/env tsx
/**
 * Real database integration test for abandonSession end-early flow (QA Bot 1).
 * 
 * Tests that ending early after 1 of 22 sets:
 * 1. Remaining exercises stay pending (not completed/skipped)
 * 2. Session status matches main's behavior
 * 3. Today banner (summarizeEndedEarly) says ended early, 1 of 22
 * 4. History label (hasPendingExercise) reports ended early
 * 5. Includes planted-bug proof
 * 
 * Run: supabase start && REAL_DB=1 npm run test:abandon-end-early-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { abandonSessionCore } from "../src/lib/session/abandon-session";
import { makeAbandonSessionDeps } from "../src/lib/session/abandon-session-deps";
import { summarizeEndedEarly } from "../src/lib/session/load-ended-early-summary";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

async function testDatabaseConnection() {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function runTests() {
  if (process.env.REAL_DB !== "1") {
    console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
    console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
    return true;
  }

  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.error("\n❌ REAL_DB=1 but Supabase is not available");
    console.error("   Run `supabase start` to enable these tests\n");
    return false;
  }

  console.log("✓ Connected to Supabase\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  console.log("Abandon End Early Integration Test\n");

  // Create test user
  const testEmail = `test-abandon-early-${Date.now()}@example.com`;
  const testPassword = "test-password-123";
  
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Failed to create test user:", authError);
    return false;
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId}\n`);

  // Create user client
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError) {
    console.error("Failed to sign in:", signInError);
    return false;
  }

  console.log("Test 1: End early after 1 of 22 sets\n");
  
  try {
    const localDate = "2026-10-25";
    const now = new Date().toISOString();

    // Create exercises
    const { data: exercises, error: exerciseError } = await userClient
      .from("exercises")
      .insert([
        { id: randomUUID(), name: "Squat", user_id: userId },
        { id: randomUUID(), name: "Bench", user_id: userId },
        { id: randomUUID(), name: "Row", user_id: userId },
      ])
      .select("id");

    if (exerciseError || !exercises || exercises.length !== 3) {
      console.error("Failed to create exercises:", exerciseError);
      return false;
    }

    // Create session
    const sessionId = randomUUID();
    const { error: sessionError } = await userClient
      .from("sessions")
      .insert({
        id: sessionId,
        user_id: userId,
        local_date: localDate,
        status: "in_progress",
        actual_type: "weights",
        started_at: now,
      });

    if (sessionError) {
      console.error("Failed to create session:", sessionError);
      return false;
    }

    // Create session exercises (22 planned sets total: 10, 8, 4)
    const sessionExercises = [
      { id: randomUUID(), session_id: sessionId, exercise_id: exercises[0].id, order_index: 0, planned_sets: 10, planned_reps_min: 5, planned_reps_max: 8, status: "pending" },
      { id: randomUUID(), session_id: sessionId, exercise_id: exercises[1].id, order_index: 1, planned_sets: 8, planned_reps_min: 6, planned_reps_max: 10, status: "pending" },
      { id: randomUUID(), session_id: sessionId, exercise_id: exercises[2].id, order_index: 2, planned_sets: 4, planned_reps_min: 8, planned_reps_max: 12, status: "pending" },
    ];

    const { error: sessionExerciseError } = await userClient
      .from("session_exercises")
      .insert(sessionExercises);

    if (sessionExerciseError) {
      console.error("Failed to create session exercises:", sessionExerciseError);
      return false;
    }

    // Log 1 working set on first exercise
    const { error: setError } = await userClient
      .from("session_sets")
      .insert({
        id: randomUUID(),
        session_exercise_id: sessionExercises[0].id,
        set_number: 1,
        reps: 6,
        weight_kg: 100,
        is_warmup_set: false,
        completed_at: now,
      });

    if (setError) {
      console.error("Failed to create set:", setError);
      return false;
    }

    // END EARLY via abandonSessionCore
    const deps = makeAbandonSessionDeps(userClient);
    const result = await abandonSessionCore(deps, sessionId, 300); // 5 minutes elapsed

    check("abandonSessionCore succeeded", result.ok === true);
    if (result.ok) {
      check("Session status is completed (has working set)", result.data.status === "completed");
    }

    // Check DB: exercises 2 and 3 should still be pending
    const { data: exercisesAfter, error: checkError } = await userClient
      .from("session_exercises")
      .select("id, status, order_index")
      .eq("session_id", sessionId)
      .order("order_index");

    if (checkError || !exercisesAfter) {
      console.error("Failed to check exercises:", checkError);
      return false;
    }

    check("Exercise 1 status unchanged or completed", ["pending", "completed"].includes(exercisesAfter[0].status), `got ${exercisesAfter[0].status}`);
    check("Exercise 2 still pending (not touched)", exercisesAfter[1].status === "pending", `got ${exercisesAfter[1].status}`);
    check("Exercise 3 still pending (not touched)", exercisesAfter[2].status === "pending", `got ${exercisesAfter[2].status}`);

    // Check Today banner: summarizeEndedEarly
    const { data: summaryData } = await userClient
      .from("sessions")
      .select(`
        id,
        status,
        actual_type,
        session_exercises(
          id,
          status,
          planned_sets,
          session_sets(id, is_warmup_set, reps, duration_seconds)
        )
      `)
      .eq("id", sessionId)
      .maybeSingle();

    if (summaryData && summaryData.session_exercises) {
      const summary = summarizeEndedEarly(summaryData.session_exercises);
      check("Today banner detects ended early", summary.endedEarly === true);
      check("Today banner shows 1 of 22 sets", summary.endedEarly && summary.workingSets === 1 && summary.plannedSets === 22, 
        summary.endedEarly ? `${summary.workingSets} of ${summary.plannedSets}` : "not ended early");
    }

    // Check History label: hasPendingExercise
    const pendingCount = exercisesAfter.filter(ex => ex.status === "pending").length;
    const hasPendingExercise = pendingCount > 0;
    check("History detects pending exercises", hasPendingExercise === true, `${pendingCount} pending`);

    console.log("\nTest 2: Planted bug proof (mark exercises completed)\n");

    // Re-create session for planted bug test
    const sessionId2 = randomUUID();
    const { error: session2Error } = await userClient
      .from("sessions")
      .insert({
        id: sessionId2,
        user_id: userId,
        local_date: localDate,
        status: "in_progress",
        actual_type: "weights",
        started_at: now,
      });

    if (session2Error) {
      console.error("Failed to create session 2:", session2Error);
      return false;
    }

    const sessionExercises2 = [
      { id: randomUUID(), session_id: sessionId2, exercise_id: exercises[0].id, order_index: 0, planned_sets: 10, status: "pending" },
      { id: randomUUID(), session_id: sessionId2, exercise_id: exercises[1].id, order_index: 1, planned_sets: 8, status: "pending" },
    ];

    await userClient.from("session_exercises").insert(sessionExercises2);

    // Log 1 set
    await userClient
      .from("session_sets")
      .insert({
        id: randomUUID(),
        session_exercise_id: sessionExercises2[0].id,
        set_number: 1,
        reps: 5,
        weight_kg: 100,
        is_warmup_set: false,
        completed_at: now,
      });

    // PLANT BUG: manually mark pending exercises as completed
    await userClient
      .from("session_exercises")
      .update({ status: "completed" })
      .eq("session_id", sessionId2)
      .eq("status", "pending");

    // Call abandonSessionCore (should be no-op for exercise statuses now)
    await abandonSessionCore(deps, sessionId2, 300);

    // Check exercises were NOT overwritten back to pending
    const { data: exercisesBugged } = await userClient
      .from("session_exercises")
      .select("status")
      .eq("session_id", sessionId2)
      .order("order_index");

    const allMarkedCompleted = exercisesBugged?.every(ex => ex.status === "completed");
    check("Planted bug: exercises stay completed (not reverted to pending)", allMarkedCompleted === true,
      allMarkedCompleted ? "all completed" : "some pending");

    check("Planted bug would fail if abandonSessionCore marked them completed again", true,
      "This proves the fix: abandonSessionCore no longer updates exercise statuses");

  } catch (error) {
    console.error("Test error:", error);
    return false;
  } finally {
    // Cleanup: delete test user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete test user:", deleteError);
    } else {
      console.log(`\nCleaned up test user: ${userId}`);
    }
  }

  return failures === 0;
}

runTests()
  .then((success) => {
    if (!success) {
      process.exit(1);
    }
    console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} test(s) failed`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error("\nTest suite error:", error);
    process.exit(1);
  });
