/**
 * Real database test: resolveSwapPrefill computes weight correctly.
 * 
 * This test verifies that resolveSwapPrefill():
 * 1. Uses suggestedWeight when exercise_progress exists (respects deload)
 * 2. Falls back to getLastPerformance top set when no progress
 * 3. Returns null when the exercise has never been trained
 * 
 * Tests:
 * - With progress: applies suggestedWeight (deload reduces to ~70%)
 * - Without progress but with history: returns last performance weight
 * - No history at all: returns null
 * - All inserts checked for errors
 * 
 * Run: supabase start && REAL_DB=1 npm run test:swap-prefill-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { resolveSwapPrefill } from "../src/lib/session/swap-prefill";

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

  // Update profile (createUser trigger already created it)
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  check("Profile updated", !profileError, profileError?.message);
  if (profileError) return false;

  // Get test exercises
  const { data: exercises } = await adminClient
    .from("exercises")
    .select("id, name, movement_pattern, equipment_ids")
    .in("name", ["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press", "Incline Dumbbell Press"])
    .limit(3);

  if (!exercises || exercises.length < 3) {
    console.error("❌ Failed to fetch test exercises");
    return false;
  }

  const benchPress = exercises.find(e => e.name === "Barbell Bench Press - Medium Grip");
  const dumbbell = exercises.find(e => e.name === "Dumbbell Bench Press");
  const incline = exercises.find(e => e.name === "Incline Dumbbell Press");

  if (!benchPress || !dumbbell || !incline) {
    console.error("❌ Required exercises not found");
    return false;
  }

  console.log(`Using exercises:\n  - ${benchPress.name}\n  - ${dumbbell.name}\n  - ${incline.name}\n`);

  // Test 1: With progress (uses suggestedWeight)
  console.log("Test 1: With exercise_progress:");
  
  // Create progress entry for bench press at 100kg
  const { error: progressError } = await adminClient
    .from("exercise_progress")
    .insert({
      user_id: userId,
      exercise_id: benchPress.id,
      current_working_weight_kg: 100,
      current_target_reps: 12,
    });

  check("Progress entry created", !progressError, progressError?.message);
  if (progressError) return false;

  // Non-deload: should return 100kg (working weight as-is)
  const prefillNonDeload = await resolveSwapPrefill(
    adminClient,
    userId,
    benchPress.id,
    false,
    benchPress.equipment_ids ?? [],
    null, // mechanic
    "reps",
    benchPress.movement_pattern ?? "push",
    undefined,
    true,
  );

  check("Non-deload with progress returns working weight", prefillNonDeload === 100, `got ${prefillNonDeload}`);

  // Deload: should return ~70kg (70% of 100kg)
  const prefillDeload = await resolveSwapPrefill(
    adminClient,
    userId,
    benchPress.id,
    true,
    benchPress.equipment_ids ?? [],
      null, // mechanic
    "reps",
    benchPress.movement_pattern ?? "push",
    undefined,
    true,
  );

  check("Deload with progress returns ~70%", prefillDeload !== null && prefillDeload >= 67.5 && prefillDeload <= 72.5, `got ${prefillDeload}`);

  // remembersWeights = false: should return null even with progress
  const prefillNoMemory = await resolveSwapPrefill(
    adminClient,
    userId,
    benchPress.id,
    false,
    benchPress.equipment_ids ?? [],
      null, // mechanic
    "reps",
    benchPress.movement_pattern ?? "push",
    undefined,
    false,
  );

  check("remembersWeights=false returns null (ignores progress)", prefillNoMemory === null, `got ${prefillNoMemory}`);

  // Test 2: Without progress but with history
  console.log("\nTest 2: Without progress, with history:");

  // Create a completed session with dumbbell (30kg)
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
      days_per_week: 4,
      primary_track: "weights",
      goal: "muscle_gain",
      level: "intermediate",
    });

  check("Program created", !programError, programError?.message);
  if (programError) return false;

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
      completed_at: "2026-10-20T10:25:00Z",
    });

  check("Prior session exercise created", !priorSessExError, priorSessExError?.message);
  if (priorSessExError) return false;

  // Log sets at 30kg
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

  // Dumbbell has no progress, should fall back to last performance (30kg)
  const prefillHistory = await resolveSwapPrefill(
    adminClient,
    userId,
    dumbbell.id,
    false,
    dumbbell.equipment_ids ?? [],
    null, // mechanic
    "reps",
    dumbbell.movement_pattern ?? "push",
    undefined,
    true,
  );

  check("Without progress, with history returns last performance", prefillHistory === 30, `got ${prefillHistory}`);

  // remembersWeights = false: should return null even with history
  const prefillHistoryNoMemory = await resolveSwapPrefill(
    adminClient,
    userId,
    dumbbell.id,
    false,
    dumbbell.equipment_ids ?? [],
    null, // mechanic
    "reps",
    dumbbell.movement_pattern ?? "push",
    undefined,
    false,
  );

  check("remembersWeights=false returns null (ignores history)", prefillHistoryNoMemory === null, `got ${prefillHistoryNoMemory}`);

  // Test 3: No history at all
  console.log("\nTest 3: No history:");

  const prefillNoHistory = await resolveSwapPrefill(
    adminClient,
    userId,
    incline.id,
    false,
    incline.equipment_ids ?? [],
    null, // mechanic
    "reps",
    incline.movement_pattern ?? "push",
    undefined,
    true,
  );

  check("No history returns null", prefillNoHistory === null, `got ${prefillNoHistory}`);

  // Test 4: MED-1 - swap prefill must equal runner suggestion for deload
  console.log("\nTest 4: MED-1 - Deload swap prefill matches runner:");

  // Create an isolation barbell exercise at 20 kg
  const barbellCurl = await adminClient.from("exercises").insert({
    name: "Barbell Curl Test",
    movement_pattern: "biceps",
    mechanic: "isolation",
    metric: "reps",
    equipment_ids: ["barbell"],
    primary_muscles: ["biceps"],
  }).select("id, equipment_ids, movement_pattern, mechanic").single();

  if (barbellCurl.error) {
    console.log("  FAIL: Could not create test exercise:", barbellCurl.error.message);
    failures++;
  } else {
    // Set progress to 20 kg
    const { error: progressError } = await adminClient.from("exercise_progress").insert({
      user_id: userId,
      exercise_id: barbellCurl.data.id,
      current_working_weight_kg: 20,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 20,
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3,
      weight_at_failure_start_kg: null,
    });

    if (progressError) {
      console.log("  FAIL: Could not insert progress:", progressError.message);
      failures++;
    } else {
      // Get swap prefill (deload)
      const swapPrefill = await resolveSwapPrefill(
        adminClient,
        userId,
        barbellCurl.data.id,
        true, // isDeload
        barbellCurl.data.equipment_ids ?? [],
        barbellCurl.data.mechanic,
        "reps",
        barbellCurl.data.movement_pattern ?? "biceps",
        undefined,
        true,
      );

      // Compute what runner would suggest using suggestedWeight
      const { suggestedWeight } = await import("../src/lib/program/progression");
      const runnerSuggestion = suggestedWeight(
        { currentWorkingWeightKg: 20 },
        true, // isDeload
        {
          mechanic: barbellCurl.data.mechanic,
          movementPattern: barbellCurl.data.movement_pattern ?? "biceps",
          metric: "reps",
          isBodyweight: false,
          progressionChain: null,
          progressionRank: null,
        },
        barbellCurl.data.equipment_ids,
      );

      check("Swap prefill equals runner suggestion", swapPrefill === runnerSuggestion, `swap=${swapPrefill}, runner=${runnerSuggestion}`);
      check("Deload isolation barbell 20kg (~14kg)", swapPrefill !== null && swapPrefill >= 13 && swapPrefill <= 15, `got ${swapPrefill}`);
    }
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
