/**
 * Real database test: loadEndedEarlySummary and summarizeEndedEarly.
 * 
 * Creates test sessions in local Supabase and verifies:
 * 1. Fully completed session returns endedEarly=false
 * 2. Session with pending exercise returns endedEarly=true with correct counts
 * 3. Session with 0 working sets returns endedEarly=true
 * 4. Skipped exercises are excluded from planned set count
 * 5. Warmup sets are excluded from working set count
 * 
 * Run: supabase start && REAL_DB=1 npm run test:ended-early-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { loadEndedEarlySummary } from "../src/lib/session/load-ended-early-summary";

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

  console.log("Ended Early Summary Tests\n");

  // Create test user
  const testEmail = `test-ended-early-${Date.now()}@example.com`;
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
  console.log(`✓ Created test user ${userId}\n`);

  // Sign in as the test user
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError) {
    console.error("❌ Failed to sign in as test user:", signInError);
    await adminClient.auth.admin.deleteUser(userId);
    return false;
  }

  console.log("✓ Signed in as test user\n");

  // Get test exercises from seed data
  const { data: exercises } = await adminClient
    .from("exercises")
    .select("id, name")
    .in("name", ["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press"])
    .limit(2);

  if (!exercises || exercises.length < 2) {
    console.error("❌ Failed to fetch test exercises");
    await adminClient.auth.admin.deleteUser(userId);
    return false;
  }

  const exercise1 = exercises[0];
  const exercise2 = exercises[1];
  console.log(`✓ Using exercises: ${exercise1.name}, ${exercise2.name}\n`);

  try {
    // Test 1: Fully completed session
    console.log("Test 1: Fully completed session\n");
    {
      const sessionId = randomUUID();
      
      // Create session
      const { error: sessionError } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-25",
        status: "completed",
        actual_type: "weights",
      });
      check("Insert session", !sessionError, sessionError?.message);

      // Create completed exercise 1
      const ex1Id = randomUUID();
      const { error: ex1Error } = await adminClient.from("session_exercises").insert({
        id: ex1Id,
        session_id: sessionId,
        exercise_id: exercise1.id,
        order_index: 1,
        planned_sets: 4,
        status: "completed",
      });
      check("Insert exercise 1", !ex1Error, ex1Error?.message);

      // Add 4 working sets
      const sets1 = Array(4).fill(null).map((_, i) => ({
        session_exercise_id: ex1Id,
        set_number: i + 1,
        reps: 10,
        is_warmup_set: false,
      }));
      const { error: sets1Error } = await adminClient.from("session_sets").insert(sets1);
      check("Insert sets for ex1", !sets1Error, sets1Error?.message);

      // Create completed exercise 2
      const ex2Id = randomUUID();
      const { error: ex2Error } = await adminClient.from("session_exercises").insert({
        id: ex2Id,
        session_id: sessionId,
        order_index: 2,
        exercise_id: exercise2.id,
        planned_sets: 3,
        status: "completed",
      });
      check("Insert exercise 2", !ex2Error, ex2Error?.message);

      // Add 3 working sets
      const sets2 = Array(3).fill(null).map((_, i) => ({
        session_exercise_id: ex2Id,
        set_number: i + 1,
        reps: 12,
        is_warmup_set: false,
      }));
      const { error: sets2Error } = await adminClient.from("session_sets").insert(sets2);
      check("Insert sets for ex2", !sets2Error, sets2Error?.message);

      // Load summary
      const summary = await loadEndedEarlySummary(userClient, sessionId);
      check("Summary loaded", summary !== null);
      check("Not ended early", summary?.endedEarly === false);
      check("Working sets = 7", summary?.workingSets === 7, `got ${summary?.workingSets}`);
      check("Planned sets = 7", summary?.plannedSets === 7, `got ${summary?.plannedSets}`);
    }

    // Test 2: Session with pending exercise
    console.log("\nTest 2: Session with pending exercise\n");
    {
      const sessionId = randomUUID();
      
      const { error: sessionError } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-25",
        status: "completed",
        actual_type: "weights",
      });
      check("Insert session", !sessionError, sessionError?.message);

      // Completed exercise with 4 sets
      const ex1Id = randomUUID();
      const { error: ex1Error } = await adminClient.from("session_exercises").insert({
        id: ex1Id,
        session_id: sessionId,
        order_index: 1,
        exercise_id: exercise1.id,
        planned_sets: 4,
        status: "completed",
      });
      check("Insert exercise 1", !ex1Error, ex1Error?.message);
      
      const sets1 = Array(4).fill(null).map((_, i) => ({
        session_exercise_id: ex1Id,
        set_number: i + 1,
        reps: 10,
        is_warmup_set: false,
      }));
      const { error: sets1Error } = await adminClient.from("session_sets").insert(sets1);
      check("Insert sets for ex1", !sets1Error, sets1Error?.message);

      // Pending exercise with only 1 set
      const ex2Id = randomUUID();
      const { error: ex2Error } = await adminClient.from("session_exercises").insert({
        id: ex2Id,
        session_id: sessionId,
        order_index: 2,
        exercise_id: exercise2.id,
        planned_sets: 3,
        status: "pending",
      });
      check("Insert exercise 2", !ex2Error, ex2Error?.message);
      
      const sets2 = [{
        session_exercise_id: ex2Id,
        set_number: 1,
        reps: 12,
        is_warmup_set: false,
      }];
      const { error: sets2Error } = await adminClient.from("session_sets").insert(sets2);
      check("Insert sets for ex2", !sets2Error, sets2Error?.message);

      // Load summary
      const summary = await loadEndedEarlySummary(userClient, sessionId);
      check("Summary loaded", summary !== null);
      check("Ended early", summary?.endedEarly === true);
      check("Working sets = 5", summary?.workingSets === 5, `got ${summary?.workingSets}`);
      check("Planned sets = 7", summary?.plannedSets === 7, `got ${summary?.plannedSets}`);
    }

    // Test 3: Session with 0 working sets
    console.log("\nTest 3: Session with 0 working sets (all pending)\n");
    {
      const sessionId = randomUUID();
      
      const { error: sessionError } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-25",
        status: "completed",
        actual_type: "weights",
      });
      check("Insert session", !sessionError, sessionError?.message);

      // Pending exercises with no sets
      const { error: exError } = await adminClient.from("session_exercises").insert([
        {
          id: randomUUID(),
          session_id: sessionId,
          order_index: 1,
          exercise_id: exercise1.id,
          planned_sets: 4,
          status: "pending",
        },
        {
          id: randomUUID(),
          session_id: sessionId,
          order_index: 2,
          exercise_id: exercise2.id,
          planned_sets: 3,
          status: "pending",
        },
      ]);
      check("Insert exercises", !exError, exError?.message);

      // Load summary
      const summary = await loadEndedEarlySummary(userClient, sessionId);
      check("Summary loaded", summary !== null);
      check("Ended early", summary?.endedEarly === true);
      check("Working sets = 0", summary?.workingSets === 0);
      check("Planned sets = 7", summary?.plannedSets === 7);
    }

    // Test 4: Skipped exercises excluded from planned
    console.log("\nTest 4: Skipped exercises excluded from planned count\n");
    {
      const sessionId = randomUUID();
      
      const { error: sessionError } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-25",
        status: "completed",
        actual_type: "weights",
      });
      check("Insert session", !sessionError, sessionError?.message);

      // Completed exercise
      const ex1Id = randomUUID();
      const { error: ex1Error } = await adminClient.from("session_exercises").insert({
        id: ex1Id,
        session_id: sessionId,
        order_index: 1,
        exercise_id: exercise1.id,
        planned_sets: 4,
        status: "completed",
      });
      check("Insert exercise 1", !ex1Error, ex1Error?.message);
      
      const sets1 = Array(4).fill(null).map((_, i) => ({
        session_exercise_id: ex1Id,
        set_number: i + 1,
        reps: 10,
        is_warmup_set: false,
      }));
      const { error: sets1Error } = await adminClient.from("session_sets").insert(sets1);
      check("Insert sets for ex1", !sets1Error, sets1Error?.message);

      // Skipped exercise (should not count toward planned)
      const { error: ex2Error } = await adminClient.from("session_exercises").insert({
        id: randomUUID(),
        session_id: sessionId,
        order_index: 2,
        exercise_id: exercise2.id,
        planned_sets: 3,
        status: "skipped",
      });
      check("Insert exercise 2 (skipped)", !ex2Error, ex2Error?.message);

      // Load summary
      const summary = await loadEndedEarlySummary(userClient, sessionId);
      check("Summary loaded", summary !== null);
      check("Not ended early", summary?.endedEarly === false);
      check("Working sets = 4", summary?.workingSets === 4);
      check("Planned sets = 4 (skipped excluded)", summary?.plannedSets === 4);
    }

    // Test 5: Warmup sets excluded from working count
    console.log("\nTest 5: Warmup sets excluded from working count\n");
    {
      const sessionId = randomUUID();
      
      const { error: sessionError } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-25",
        status: "completed",
        actual_type: "weights",
      });
      check("Insert session", !sessionError, sessionError?.message);

      const exId = randomUUID();
      const { error: exError } = await adminClient.from("session_exercises").insert({
        id: exId,
        session_id: sessionId,
        order_index: 1,
        exercise_id: exercise1.id,
        planned_sets: 2,
        status: "completed",
      });
      check("Insert exercise", !exError, exError?.message);

      // 2 warmup sets + 2 working sets
      const sets = [
        { session_exercise_id: exId, set_number: 1, reps: 5, is_warmup_set: true },
        { session_exercise_id: exId, set_number: 2, reps: 5, is_warmup_set: true },
        { session_exercise_id: exId, set_number: 3, reps: 10, is_warmup_set: false },
        { session_exercise_id: exId, set_number: 4, reps: 10, is_warmup_set: false },
      ];
      const { error: setsError } = await adminClient.from("session_sets").insert(sets);
      check("Insert sets", !setsError, setsError?.message);

      // Load summary
      const summary = await loadEndedEarlySummary(userClient, sessionId);
      check("Summary loaded", summary !== null);
      check("Not ended early", summary?.endedEarly === false);
      check("Working sets = 2 (warmups excluded)", summary?.workingSets === 2);
      check("Planned sets = 2", summary?.plannedSets === 2);
    }

    if (failures === 0) {
      console.log("\n✅ All ended-early real-db tests passed\n");
    } else {
      console.log(`\n❌ ${failures} test(s) failed\n`);
    }

  } finally {
    // Clean up test user and all related data
    await adminClient.auth.admin.deleteUser(userId);
    console.log("✓ Cleaned up test user\n");
  }

  return failures === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
