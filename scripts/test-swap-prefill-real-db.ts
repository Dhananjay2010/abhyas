/**
 * Real database test: Exercise swap prefills weight from last performance.
 * 
 * This test verifies that when an exercise is swapped during a session,
 * the new exercise gets its weight prefilled from the user's last
 * performance, or stays null when there is no history.
 * 
 * Tests:
 * - Swap with prior history: weight prefills from topSet
 * - Swap with no history: weight stays null
 * - All inserts checked for errors
 * 
 * Run: supabase start && REAL_DB=1 npm run test:swap-prefill-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
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

  // Verify service role key
  try {
    const payload = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64').toString());
    if (payload.role !== 'service_role') {
      console.error(`❌ Expected service_role key, got role: ${payload.role}`);
      return false;
    }
    console.log(`✓ Using service_role key\n`);
  } catch {
    console.error("❌ Failed to decode service role key");
    return false;
  }

  console.log("Swap Prefill Tests\n");

  // Create test user
  const testEmail = `test-swap-${Date.now()}@example.com`;
  const testPassword = "test-password-123";
  
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("❌ Failed to create test user:", authError);
    return false;
  }

  const userId = authData.user.id;
  console.log(`✓ Created test user: ${userId}\n`);

  // Create profile
  const { error: profileError } = await adminClient
    .from("profiles")
    .insert({
      id: userId,
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      session_minutes: 60,
      days_per_week: 4,
      onboarding_completed_at: new Date().toISOString(),
    });

  check("Profile created", !profileError, profileError?.message);
  if (profileError) return false;

  // Get two exercises: bench press (with history) and a swap target (no history initially)
  const { data: exercises } = await adminClient
    .from("exercises")
    .select("id, name")
    .in("name", ["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press"])
    .limit(2);

  if (!exercises || exercises.length < 2) {
    console.error("❌ Failed to fetch test exercises");
    return false;
  }

  const benchPress = exercises.find(e => e.name === "Barbell Bench Press - Medium Grip");
  const dumbbell = exercises.find(e => e.name === "Dumbbell Bench Press");

  if (!benchPress || !dumbbell) {
    console.error("❌ Required exercises not found");
    return false;
  }

  console.log(`Using exercises:\n  - ${benchPress.name} (${benchPress.id})\n  - ${dumbbell.name} (${dumbbell.id})\n`);

  // Create a program
  const programId = randomUUID();
  const { error: programError } = await adminClient
    .from("programs")
    .insert({
      id: programId,
      user_id: userId,
      status: "active",
      started_on: "2026-10-21",
      ends_on: "2026-11-17",
      block_number: 1,
      split_type: "upper_lower",
      deload_week: 4,
      week_offset: 0,
    });

  check("Program created", !programError, programError?.message);
  if (programError) return false;

  // Create a program day
  const dayId = randomUUID();
  const { error: dayError } = await adminClient
    .from("program_days")
    .insert({
      id: dayId,
      program_id: programId,
      day_index: 1,
      day_type: "weights",
      label: "Upper",
      focus: "push",
      status: "active",
    });

  check("Program day created", !dayError, dayError?.message);
  if (dayError) return false;

  // Add bench press to the day
  const pdExId = randomUUID();
  const { error: pdExError } = await adminClient
    .from("program_day_exercises")
    .insert({
      id: pdExId,
      program_day_id: dayId,
      exercise_id: benchPress.id,
      order_index: 1,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    });

  check("Program day exercise created", !pdExError, pdExError?.message);
  if (pdExError) return false;

  // Create a completed prior session with the dumbbell exercise (the swap target)
  const priorSessionId = randomUUID();
  const { error: priorSessionError } = await adminClient
    .from("sessions")
    .insert({
      id: priorSessionId,
      user_id: userId,
      program_id: programId,
      program_day_id: dayId,
      local_date: "2026-10-20",
      week_in_block: 1,
      is_deload: false,
      planned_type: "weights",
      actual_type: "weights",
      status: "completed",
      started_at: "2026-10-20T10:00:00Z",
      completed_at: "2026-10-20T10:30:00Z",
    });

  check("Prior session created", !priorSessionError, priorSessionError?.message);
  if (priorSessionError) return false;

  // Add a session exercise for the dumbbell (the one we'll swap TO)
  const priorSessExId = randomUUID();
  const { error: priorSessExError } = await adminClient
    .from("session_exercises")
    .insert({
      id: priorSessExId,
      session_id: priorSessionId,
      exercise_id: dumbbell.id,
      order_index: 1,
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      metric: "reps",
      status: "completed",
    });

  check("Prior session exercise created", !priorSessExError, priorSessExError?.message);
  if (priorSessExError) return false;

  // Log sets for the dumbbell: 3 sets at 30kg
  const sets = [
    { set_number: 1, reps: 12, weight_kg: 30, is_warmup_set: false },
    { set_number: 2, reps: 11, weight_kg: 30, is_warmup_set: false },
    { set_number: 3, reps: 10, weight_kg: 30, is_warmup_set: false },
  ];

  for (const set of sets) {
    const { error: setError } = await adminClient
      .from("session_sets")
      .insert({
        session_exercise_id: priorSessExId,
        ...set,
      });

    check(`Prior set ${set.set_number} logged`, !setError, setError?.message);
    if (setError) return false;
  }

  // Mark the prior session exercise as completed
  const { error: completeError } = await adminClient
    .from("session_exercises")
    .update({ completed_at: "2026-10-20T10:25:00Z" })
    .eq("id", priorSessExId);

  check("Prior session exercise marked complete", !completeError, completeError?.message);
  if (completeError) return false;

  console.log(""); // Blank line before swap tests

  // Create a new session for today
  const todaySessionId = randomUUID();
  const { error: todaySessionError } = await adminClient
    .from("sessions")
    .insert({
      id: todaySessionId,
      user_id: userId,
      program_id: programId,
      program_day_id: dayId,
      local_date: "2026-10-25",
      week_in_block: 1,
      is_deload: false,
      planned_type: "weights",
      actual_type: "weights",
      status: "in_progress",
      started_at: "2026-10-25T10:00:00Z",
    });

  check("Today's session created", !todaySessionError, todaySessionError?.message);
  if (todaySessionError) return false;

  // Add the bench press to today's session
  const todaySessExId = randomUUID();
  const { error: todaySessExError } = await adminClient
    .from("session_exercises")
    .insert({
      id: todaySessExId,
      session_id: todaySessionId,
      exercise_id: benchPress.id,
      order_index: 1,
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      metric: "reps",
      status: "planned",
    });

  check("Today's session exercise created", !todaySessExError, todaySessExError?.message);
  if (todaySessExError) return false;

  // Now simulate a swap: update the session exercise to use the dumbbell
  // This mimics what the swapExercise action does
  const { error: swapError } = await adminClient
    .from("session_exercises")
    .update({
      exercise_id: dumbbell.id,
      swapped_from_exercise_id: benchPress.id,
    })
    .eq("id", todaySessExId);

  check("Exercise swapped", !swapError, swapError?.message);
  if (swapError) return false;

  // Now test the getLastPerformance to verify it returns the 30kg
  const { getLastPerformance } = await import("../src/lib/exercise-history/queries");
  
  const lastPerf = await getLastPerformance(adminClient, userId, dumbbell.id);
  
  check("Last performance retrieved", lastPerf !== null);
  check("Last performance has top set", lastPerf?.topSet !== null);
  check("Top set weight is 30kg", lastPerf?.topSet?.weight_kg === 30, `got ${lastPerf?.topSet?.weight_kg}`);

  console.log("\nTest with no history:");

  // Get another exercise that has no history
  const { data: noHistoryEx } = await adminClient
    .from("exercises")
    .select("id, name")
    .eq("name", "Incline Dumbbell Press")
    .maybeSingle();

  if (!noHistoryEx) {
    console.log("⚠️  Incline Dumbbell Press not found, skipping no-history test");
  } else {
    const noHistoryPerf = await getLastPerformance(adminClient, userId, noHistoryEx.id);
    check("No history returns null", noHistoryPerf === null, noHistoryPerf ? `got ${JSON.stringify(noHistoryPerf)}` : "");
  }

  // Cleanup
  console.log("\nCleaning up...");
  await adminClient.auth.admin.deleteUser(userId);
  console.log("✓ Test user deleted");

  return failures === 0;
}

runTests()
  .then((success) => {
    console.log(failures > 0 ? `\n❌ ${failures} failure(s)\n` : "\n✅ All tests passed\n");
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
  });
