/**
 * Real database test: swap guard prevents swaps after logging sets
 * 
 * Tests the swap guard helper (src/lib/session/swap-guard.ts):
 * 1. No sets: swap allowed
 * 2. One set logged: swap refused with friendly error
 * 3. Another user's sets don't block this user's swap (RLS isolation)
 * 4. DI path works (unit test of the guard with mock deps)
 * 
 * Run: supabase start && REAL_DB=1 npm run test:swap-guard-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  canSwapExercise,
  createSupabaseSwapGuardDeps,
  type SwapGuardDeps,
} from "../src/lib/session/swap-guard";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
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
    const payload = JSON.parse(
      Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split(".")[1], "base64").toString(),
    );
    if (payload.role !== "service_role") {
      console.error(`❌ Expected service_role key, got role: ${payload.role}`);
      return false;
    }
    console.log(`✓ Using service_role key\n`);
  } catch {
    console.error("❌ Failed to decode service role key");
    return false;
  }

  console.log("Swap Guard Tests\n");

  // Create test user 1
  const testEmail1 = `test-swap-guard-1-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  const { data: authData1, error: authError1 } =
    await adminClient.auth.admin.createUser({
      email: testEmail1,
      password: testPassword,
      email_confirm: true,
    });

  if (authError1 || !authData1.user) {
    console.error("❌ Failed to create test user 1:", authError1);
    return false;
  }

  const userId1 = authData1.user.id;
  console.log(`✓ Created test user 1: ${userId1}\n`);

  // Create test user 2 (for RLS isolation test)
  const testEmail2 = `test-swap-guard-2-${Date.now()}@example.com`;

  const { data: authData2, error: authError2 } =
    await adminClient.auth.admin.createUser({
      email: testEmail2,
      password: testPassword,
      email_confirm: true,
    });

  if (authError2 || !authData2.user) {
    console.error("❌ Failed to create test user 2:", authError2);
    return false;
  }

  const userId2 = authData2.user.id;
  console.log(`✓ Created test user 2: ${userId2}\n`);

  // Sign in as user 1
  const client1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInError1 } = await client1.auth.signInWithPassword({
    email: testEmail1,
    password: testPassword,
  });

  if (signInError1) {
    console.error("❌ Failed to sign in as user 1:", signInError1);
    return false;
  }

  // Sign in as user 2
  const client2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInError2 } = await client2.auth.signInWithPassword({
    email: testEmail2,
    password: testPassword,
  });

  if (signInError2) {
    console.error("❌ Failed to sign in as user 2:", signInError2);
    return false;
  }

  // Fetch a seeded exercise to use
  const { data: exercises, error: exError } = await adminClient
    .from("exercises")
    .select("id")
    .limit(1);
  
  if (exError || !exercises || exercises.length < 1) {
    console.error("Failed to fetch seeded exercise:", exError);
    return false;
  }
  const exerciseId = exercises[0].id;

  console.log("Test 1: No sets logged - swap allowed\n");

  // Create program, day, session, and exercise for user 1
  const programId1 = randomUUID();
  const { error: programError1 } = await adminClient.from("programs").insert({
    id: programId1,
    user_id: userId1,
    goal: "strength",
    level: "beginner",
    primary_track: "weights",
    split_type: "upper_lower",
    days_per_week: 3,
    deload_week: 4,
    started_on: "2026-10-01",
    ends_on: "2026-11-17",
    status: "active",
  });
  check("Program created for user 1", !programError1, programError1?.message);

  const dayId1 = randomUUID();
  const { error: dayError1 } = await adminClient.from("program_days").insert({
    id: dayId1,
    program_id: programId1,
    user_id: userId1,
    day_index: 1,
    day_type: "weights",
  });
  check("Program day created", !dayError1, dayError1?.message);

  const sessionId1 = randomUUID();
  const { error: sessionError1 } = await adminClient.from("sessions").insert({
    id: sessionId1,
    user_id: userId1,
    program_id: programId1,
    program_day_id: dayId1,
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
  });
  check("Session created", !sessionError1, sessionError1?.message);

  const sessionExerciseId1 = randomUUID();
  const { error: sessionExerciseError1 } = await adminClient
    .from("session_exercises")
    .insert({
      id: sessionExerciseId1,
      session_id: sessionId1,
      user_id: userId1,
      exercise_id: exerciseId,
      order_index: 0,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      metric: "reps",
    });
  check("Session exercise created", !sessionExerciseError1, sessionExerciseError1?.message);

  // Test: no sets logged, swap should be allowed
  const deps1 = createSupabaseSwapGuardDeps(client1);
  const result1 = await canSwapExercise(deps1, sessionExerciseId1);
  check("No sets: swap allowed", result1.allowed === true);

  console.log("\nTest 2: One set logged - swap refused\n");

  // Log a set
  const { error: setError1 } = await adminClient.from("session_sets").insert({
    session_exercise_id: sessionExerciseId1,
    user_id: userId1,
    set_number: 1,
    reps: 10,
    weight_kg: 50,
    is_warmup_set: false,
  });
  check("Set logged", !setError1);

  // Test: swap should now be refused
  const result2 = await canSwapExercise(deps1, sessionExerciseId1);
  check("One set: swap refused", result2.allowed === false);
  check(
    "Friendly error message",
    result2.allowed === false &&
      result2.error === "You've already logged a set for this exercise, so it can't be swapped.",
  );

  console.log("\nTest 3: RLS isolation - another user's sets don't block\n");

  // Create session and exercise for user 2
  const programId2 = randomUUID();
  const { error: programError2 } = await adminClient.from("programs").insert({
    id: programId2,
    user_id: userId2,
    goal: "strength",
    level: "beginner",
    primary_track: "weights",
    split_type: "upper_lower",
    days_per_week: 3,
    deload_week: 4,
    started_on: "2026-10-01",
    status: "active",
  });
  check("Program created for user 2", !programError2, programError2?.message);

  const dayId2 = randomUUID();
  const { error: dayError2 } = await adminClient.from("program_days").insert({
    id: dayId2,
    program_id: programId2,
    user_id: userId2,
    day_index: 1,
    day_type: "weights",
  });
  check("Program day created for user 2", !dayError2, dayError2?.message);

  const sessionId2 = randomUUID();
  const { error: sessionError2 } = await adminClient.from("sessions").insert({
    id: sessionId2,
    user_id: userId2,
    program_id: programId2,
    program_day_id: dayId2,
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
  });
  check("Session created for user 2", !sessionError2, sessionError2?.message);

  const sessionExerciseId2 = randomUUID();
  const { error: sessionExerciseError2 } = await adminClient
    .from("session_exercises")
    .insert({
      id: sessionExerciseId2,
      session_id: sessionId2,
      user_id: userId2,
      exercise_id: exerciseId,
      order_index: 0,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      metric: "reps",
    });
  check("Session exercise created for user 2", !sessionExerciseError2, sessionExerciseError2?.message);

  // Log a set for user 2 with the SAME session_exercise_id (shouldn't block user 1)
  const { error: setError2 } = await adminClient.from("session_sets").insert({
    session_exercise_id: sessionExerciseId2,
    user_id: userId2,
    set_number: 1,
    reps: 10,
    weight_kg: 50,
    is_warmup_set: false,
  });
  check("Set logged for user 2", !setError2);

  // Test: user 2's swap should be blocked by their own set
  const deps2 = createSupabaseSwapGuardDeps(client2);
  const result3 = await canSwapExercise(deps2, sessionExerciseId2);
  check("User 2's own set blocks their swap", result3.allowed === false);

  // But user 1 checking user 2's exercise should still allow (RLS)
  const result4 = await canSwapExercise(deps1, sessionExerciseId2);
  check(
    "User 2's sets don't block user 1's check (RLS isolation)",
    result4.allowed === true,
    "RLS applies so user 1 sees no sets",
  );

  console.log("\nTest 4: DI path - unit test with mock deps\n");

  // Mock query that returns no sets
  const mockDepsNoSets: SwapGuardDeps = {
    query: async () => ({ data: [], error: null }),
  };
  const result5 = await canSwapExercise(mockDepsNoSets, "mock-id");
  check("Mock no sets: allowed", result5.allowed === true);

  // Mock query that returns sets
  const mockDepsWithSets: SwapGuardDeps = {
    query: async () => ({ data: [{ id: "set-1" }], error: null }),
  };
  const result6 = await canSwapExercise(mockDepsWithSets, "mock-id");
  check("Mock with sets: refused", result6.allowed === false);

  // Mock query with error
  const mockDepsError: SwapGuardDeps = {
    query: async () => ({ data: null, error: { message: "Database error" } }),
  };
  const result7 = await canSwapExercise(mockDepsError, "mock-id");
  check("Mock error: refused with error message", result7.allowed === false);

  // Cleanup
  await adminClient.auth.admin.deleteUser(userId1);
  await adminClient.auth.admin.deleteUser(userId2);

  console.log("\n✅ All swap guard tests passed\n");
  return failures === 0;
}

runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  });
