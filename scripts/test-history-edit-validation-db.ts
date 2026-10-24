/**
 * Real database tests for history edit validation.
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify:
 * - Future date rejected
 * - Nonexistent set returning error
 * - Deleting last set without flag refused, with flag deletes session
 * 
 * Run: supabase start && REAL_DB=1 npm run test:history-edit-validation-db
 * 
 * In CI: REAL_DB=1 is set to require a running database (fails if unavailable).
 * Locally: skips gracefully if REAL_DB=1 is not set.
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

// Import the action functions - we'll need to mock the getAuthedClient
// For now, we'll test the validation logic directly through database operations
async function runTests() {
  // Skip unless REAL_DB=1
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

  // Service role client for fixture setup (bypasses RLS)
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Create test user
  const testEmail = `test-validation-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  let userId: string | null = null;

  try {
    const { data: authData, error: signUpError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (signUpError || !authData.user) {
      console.error("Failed to create test user:", signUpError);
      return false;
    }

    userId = authData.user.id;
    console.log(`Created test user: ${userId.slice(0, 8)}...\n`);

    // Set profile timezone and created_at
    const signupDate = "2026-10-14T04:30:00Z"; // 2026-10-14 10:00 IST
    await adminClient.from("profiles").update({
      timezone: "Asia/Kolkata",
      created_at: signupDate,
    }).eq("id", userId);

    // Get seeded exercises
    const { data: exercises, error: exError } = await adminClient
      .from("exercises")
      .select("id, name")
      .order("id")
      .limit(3);

    if (exError || !exercises || exercises.length < 3) {
      console.error("Failed to fetch seeded exercises:", exError);
      return false;
    }

    const exerciseA = exercises[0].id;
    const exerciseB = exercises[1].id;

    console.log("1. Future date validation via updateSessionDateTimeCore");
    {
      const sessionId = randomUUID();
      const seId = randomUUID();

      // Create a session with a valid date
      const { error: e1 } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-15",
        status: "completed",
        started_at: "2026-10-15T10:00:00Z",
        completed_at: "2026-10-15T11:00:00Z",
        duration_seconds: 3600,
      });
      if (e1) { console.error("Insert session failed:", e1); return false; }

      const { error: e2 } = await adminClient.from("session_exercises").insert({
        id: seId,
        user_id: userId,
        session_id: sessionId,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });
      if (e2) { console.error("Insert session_exercise failed:", e2); return false; }

      await adminClient.from("session_sets").insert({
        user_id: userId,
        session_exercise_id: seId,
        set_number: 1,
        reps: 10,
        weight_kg: 100,
        is_warmup_set: false,
      });

      // Get user-scoped client
      const { data: sessionData } = await adminClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (!sessionData.session) {
        console.error("Failed to sign in test user");
        return false;
      }

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        },
      });

      // Try to update to a future date using the core function
      const { updateSessionDateTimeCore } = await import("../src/lib/history/edit-cores");
      
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      const [y, m, d] = today.split("-").map(Number);
      const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
      const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(tomorrow);
      
      const result = await updateSessionDateTimeCore(
        userClient,
        userId,
        sessionId,
        tomorrowStr,
        "2026-10-15T10:00:00Z",
        "2026-10-15T11:00:00Z",
        "Asia/Kolkata",
        signupDate
      );
      
      check("Future date is rejected by core function", !result.success);
      check("Future date error message is friendly", result.error === "That date is in the future.");
    }

    console.log("\n2. Nonexistent set returns error via updateSetCore and deleteSetCore");
    {
      const sessionId = randomUUID();
      const seId = randomUUID();

      const { error: e1 } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-16",
        status: "completed",
        started_at: "2026-10-16T10:00:00Z",
        completed_at: "2026-10-16T11:00:00Z",
        duration_seconds: 3600,
      });
      if (e1) { console.error("Insert session failed:", e1); return false; }

      const { error: e2 } = await adminClient.from("session_exercises").insert({
        id: seId,
        user_id: userId,
        session_id: sessionId,
        exercise_id: exerciseB,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });
      if (e2) { console.error("Insert session_exercise failed:", e2); return false; }

      await adminClient.from("session_sets").insert({
        user_id: userId,
        session_exercise_id: seId,
        set_number: 1,
        reps: 10,
        weight_kg: 100,
        is_warmup_set: false,
      });

      // Get user-scoped client
      const { data: sessionData } = await adminClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (!sessionData.session) {
        console.error("Failed to sign in test user");
        return false;
      }

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        },
      });

      // Try to update a nonexistent set (set_number 999)
      const { updateSetCore } = await import("../src/lib/history/edit-cores");
      const updateResult = await updateSetCore(
        userClient,
        userId,
        seId,
        999,
        20,
        null,
        null
      );

      check("Update nonexistent set returns error", !updateResult.success);
      check("Update nonexistent set error message", updateResult.error === "That set no longer exists.");

      // Try to delete a nonexistent set
      const { deleteSetCore } = await import("../src/lib/history/edit-cores");
      const deleteResult = await deleteSetCore(
        userClient,
        userId,
        seId,
        999,
        false
      );

      check("Delete nonexistent set returns error", !deleteResult.success);
      check("Delete nonexistent set error message", deleteResult.success === false && deleteResult.error === "That set no longer exists.");
    }

    console.log("\n3. Delete last working set behavior via deleteSetCore");
    {
      const sessionId = randomUUID();
      const seId = randomUUID();

      const { error: e1 } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-17",
        status: "completed",
        started_at: "2026-10-17T10:00:00Z",
        completed_at: "2026-10-17T11:00:00Z",
        duration_seconds: 3600,
      });
      if (e1) { console.error("Insert session failed:", e1); return false; }

      const { error: e2 } = await adminClient.from("session_exercises").insert({
        id: seId,
        user_id: userId,
        session_id: sessionId,
        exercise_id: exercises[2].id,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });
      if (e2) { console.error("Insert session_exercise failed:", e2); return false; }

      await adminClient.from("session_sets").insert({
        user_id: userId,
        session_exercise_id: seId,
        set_number: 1,
        reps: 10,
        weight_kg: 100,
        is_warmup_set: false,
      });

      // Count sets before deletion
      const { count: beforeCount } = await adminClient
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("session_exercise_id", seId)
        .eq("is_warmup_set", false);

      check("Session has exactly 1 working set", beforeCount === 1);

      // Get user-scoped client
      const { data: sessionData } = await adminClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (!sessionData.session) {
        console.error("Failed to sign in test user");
        return false;
      }

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        },
      });

      // Try to delete the last working set without deleteSessionIfEmpty flag
      const { deleteSetCore } = await import("../src/lib/history/edit-cores");
      const deleteResult = await deleteSetCore(
        userClient,
        userId,
        seId,
        1,
        false
      );

      check("Delete last working set without flag refused", !deleteResult.success);
      check("Last set error is 'last_set'", deleteResult.success === false && deleteResult.error === "last_set");

      // Now delete with the flag set to true
      const deleteWithFlagResult = await deleteSetCore(
        userClient,
        userId,
        seId,
        1,
        true
      );

      check("Delete last working set with flag succeeds", deleteWithFlagResult.success);
      check("Session deleted flag is set", deleteWithFlagResult.success === true && deleteWithFlagResult.sessionDeleted === true);

      // Verify session no longer exists
      const { data: session } = await adminClient
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .single();

      check("Session deleted from database", session === null);
    }

    console.log("\n4. Delete warmup set when 1 working set remains");
    {
      const sessionId = randomUUID();
      const seId = randomUUID();

      const { error: e1 } = await adminClient.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        local_date: "2026-10-18",
        status: "completed",
        started_at: "2026-10-18T10:00:00Z",
        completed_at: "2026-10-18T11:00:00Z",
        duration_seconds: 3600,
      });
      if (e1) { console.error("Insert session failed:", e1); return false; }

      const { error: e2 } = await adminClient.from("session_exercises").insert({
        id: seId,
        user_id: userId,
        session_id: sessionId,
        exercise_id: exercises[0].id,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });
      if (e2) { console.error("Insert session_exercise failed:", e2); return false; }

      // Insert 1 warmup set and 1 working set
      await adminClient.from("session_sets").insert([
        {
          user_id: userId,
          session_exercise_id: seId,
          set_number: 1,
          reps: 5,
          weight_kg: 50,
          is_warmup_set: true,
        },
        {
          user_id: userId,
          session_exercise_id: seId,
          set_number: 2,
          reps: 10,
          weight_kg: 100,
          is_warmup_set: false,
        },
      ]);

      // Count sets before deletion
      const { count: workingCount } = await adminClient
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("session_exercise_id", seId)
        .eq("is_warmup_set", false);

      check("Session has exactly 1 working set", workingCount === 1);

      const { count: warmupCount } = await adminClient
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("session_exercise_id", seId)
        .eq("is_warmup_set", true);

      check("Session has exactly 1 warmup set", warmupCount === 1);

      // Get user-scoped client
      const { data: sessionData } = await adminClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (!sessionData.session) {
        console.error("Failed to sign in test user");
        return false;
      }

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        },
      });

      // Try to delete the warmup set (should succeed without last-set check)
      const { deleteSetCore } = await import("../src/lib/history/edit-cores");
      const deleteResult = await deleteSetCore(
        userClient,
        userId,
        seId,
        1, // warmup set
        false
      );

      check("Delete warmup set succeeds even when 1 working set remains", deleteResult.success);
      check("Session not deleted (only warmup removed)", deleteResult.success === true && !deleteResult.sessionDeleted);

      // Verify warmup set is gone but working set remains
      const { count: afterWarmupCount } = await adminClient
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("session_exercise_id", seId)
        .eq("is_warmup_set", true);

      check("Warmup set deleted", afterWarmupCount === 0);

      const { count: afterWorkingCount } = await adminClient
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("session_exercise_id", seId)
        .eq("is_warmup_set", false);

      check("Working set still exists", afterWorkingCount === 1);

      // Verify session still exists
      const { data: session } = await adminClient
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .single();

      check("Session still exists", session !== null);
    }

    console.log("\n5. Update matching 0 rows (wrong user or revoked session)");
    {
      const { updateSessionDateTimeCore } = await import("../src/lib/history/edit-cores");
      
      // Sign in as the test user to get a valid client
      const { data: sessionData } = await adminClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (!sessionData.session) {
        console.error("Failed to sign in test user");
        check("Sign in for 0-row test", false);
        return false;
      }
      
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
      });
      
      // Try to update a session that doesn't belong to this user (use a random UUID)
      const fakeSessionId = "00000000-0000-0000-0000-000000000000";
      const result = await updateSessionDateTimeCore(
        userClient,
        userId,
        fakeSessionId,
        "2026-10-15",
        "2026-10-15T10:00:00Z",
        "2026-10-15T11:00:00Z",
        "Asia/Kolkata",
        signupDate
      );
      
      check("Update matching 0 rows fails", !result.success);
      check("Error message asks to sign in again", result.error === "Couldn't save — please sign in again", `got: ${result.error}`);
    }

    console.log("\n6. Validation: Pre-signup date rejected");
    {
      const { validateDateAfterSignup } = await import("../src/lib/history/edit-validation");
      
      // Signup was 2026-10-14 10:00 IST, so 2026-10-13 should be rejected
      const result = validateDateAfterSignup("2026-10-13", signupDate, "Asia/Kolkata");
      check("Pre-signup date is rejected", !result.valid);
      check("Pre-signup error message is friendly", result.error === "That date is before your signup date.");
      
      // Same day as signup should be valid
      const sameDay = validateDateAfterSignup("2026-10-14", signupDate, "Asia/Kolkata");
      check("Signup date itself is valid", sameDay.valid);
    }

    console.log("\n7. Validation: Reps boundaries");
    {
      const { validateReps } = await import("../src/lib/history/edit-validation");
      
      check("Reps 0 is invalid", !validateReps(0).valid);
      check("Reps 1 is valid", validateReps(1).valid);
      check("Reps 100 is valid", validateReps(100).valid);
      check("Reps 101 is invalid", !validateReps(101).valid);
      
      const error0 = validateReps(0);
      check("Reps error message is friendly", error0.error === "Reps must be between 1 and 100.");
    }

    console.log("\n8. Validation: Weight boundaries");
    {
      const { validateWeightKg } = await import("../src/lib/history/edit-validation");
      
      check("Weight -0.01 is invalid", !validateWeightKg(-0.01).valid);
      check("Weight 0 is valid", validateWeightKg(0).valid);
      check("Weight 500 is valid", validateWeightKg(500).valid);
      check("Weight 500.01 is invalid", !validateWeightKg(500.01).valid);
      
      const error = validateWeightKg(600);
      check("Weight error message is friendly", error.error === "Weight must be between 0 and 500 kg.");
    }

    if (failures > 0) {
      console.log(`\n❌ ${failures} FAILURES\n`);
      return false;
    }

    console.log("\n✅ All real DB validation tests passed\n");
    return true;
  } finally {
    // Cleanup test user and their data
    console.log("\nCleaning up test user...");
    try {
      if (userId) await adminClient.auth.admin.deleteUser(userId);
      console.log("✓ Test user deleted\n");
    } catch (cleanupError) {
      console.error("Warning: cleanup failed:", cleanupError);
    }
  }
}

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error("\n❌ Test error:", err);
    process.exit(1);
  });
