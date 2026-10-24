/**
 * Real database test for rebuild session re-pointing (QA H1).
 *
 * This test runs against a real local Supabase instance (supabase start).
 * It verifies that after a program rebuild:
 * - Planned sessions are re-pointed to the new program's matching day (label → day_index → day_type priority)
 * - Sessions with logged sets keep their original program_day_id
 * - A bodyweight-only rebuild deletes sessions pointing at barbell exercises
 *
 * Run: supabase start && REAL_DB=1 npm run test:rebuild-repoint-db
 *
 * In CI: REAL_DB=1 is set to require a running database (fails if unavailable).
 * Locally: skips gracefully if REAL_DB=1 is not set.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { repointSessionsAfterRebuild } from "../src/lib/program/repoint-sessions";

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
  const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

  // Create test user
  const testEmail = `test-rebuild-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  const { data: authData, error: signUpError } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (signUpError || !authData.user) {
    console.error("❌ Failed to create test user:", signUpError?.message);
    return false;
  }

  const userId = authData.user.id;
  console.log(`✓ Created test user: ${userId}\n`);

  // Create profile
  const { error: profileError } = await adminClient
    .from("profiles")
    .insert({
      id: userId,
      timezone: "America/New_York",
      level: "intermediate",
      goal: "strength",
      days_per_week: 4,
      primary_track: "weights",
      has_all_equipment: true,
    });

  if (profileError) {
    console.error("❌ Failed to create profile:", profileError.message);
    return false;
  }

  console.log("✓ Created profile\n");

  // Test 1: Label-based matching (Lower stays Lower, doesn't become Upper)
  console.log("Test 1: Label-based matching (Lower session stays Lower)");
  {
    // Create old program with Upper/Lower split
    const { data: oldProgram, error: oldProgramError } = await adminClient
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        status: "active",
      })
      .select("id")
      .single();

    if (oldProgramError || !oldProgram) {
      console.error("❌ Failed to create old program:", oldProgramError?.message);
      return false;
    }

    // Create old program days: Upper (day 1) and Lower (day 2)
    const { data: oldDays, error: oldDaysError } = await adminClient
      .from("program_days")
      .insert([
        {
          program_id: oldProgram.id,
          user_id: userId,
          day_index: 1,
          day_type: "weights",
          label: "Upper",
          focus: "Chest, Back, Shoulders, Arms",
        },
        {
          program_id: oldProgram.id,
          user_id: userId,
          day_index: 2,
          day_type: "weights",
          label: "Lower",
          focus: "Legs, Glutes, Core",
        },
      ])
      .select("id, label")
      .order("day_index");

    if (oldDaysError || !oldDays || oldDays.length !== 2) {
      console.error("❌ Failed to create old program days:", oldDaysError?.message);
      return false;
    }

    const oldLowerId = oldDays[1].id;

    // Create a planned session pointing at the old Lower day
    const { data: oldSession, error: oldSessionError } = await adminClient
      .from("sessions")
      .insert({
        user_id: userId,
        program_id: oldProgram.id,
        program_day_id: oldLowerId,
        local_date: "2026-10-24",
        planned_type: "weights",
        actual_type: "weights",
        status: "planned",
      })
      .select("id")
      .single();

    if (oldSessionError || !oldSession) {
      console.error("❌ Failed to create old session:", oldSessionError?.message);
      return false;
    }

    // Mark old program as completed (simulate rebuild)
    const { error: completeError } = await adminClient
      .from("programs")
      .update({ status: "completed" })
      .eq("id", oldProgram.id);

    if (completeError) {
      console.error("❌ Failed to mark old program completed:", completeError?.message);
      return false;
    }

    // Create new program with same Upper/Lower split
    const { data: newProgram, error: newProgramError } = await adminClient
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        status: "active",
      })
      .select("id")
      .single();

    if (newProgramError || !newProgram) {
      console.error("❌ Failed to create new program:", newProgramError?.message);
      return false;
    }

    // Create new program days: Upper (day 1) and Lower (day 2)
    const { data: newDays, error: newDaysError } = await adminClient
      .from("program_days")
      .insert([
        {
          program_id: newProgram.id,
          user_id: userId,
          day_index: 1,
          day_type: "weights",
          label: "Upper",
          focus: "Chest, Back, Shoulders, Arms",
        },
        {
          program_id: newProgram.id,
          user_id: userId,
          day_index: 2,
          day_type: "weights",
          label: "Lower",
          focus: "Legs, Glutes, Core",
        },
      ])
      .select("id, label")
      .order("day_index");

    if (newDaysError || !newDays || newDays.length !== 2) {
      console.error("❌ Failed to create new program days:", newDaysError?.message);
      return false;
    }

    const newLowerId = newDays[1].id;

    // Run re-pointing
    const result = await repointSessionsAfterRebuild(
      adminClient,
      userId,
      newProgram.id,
      "2026-10-24",
    );

    check("re-point succeeded", result.ok === true, result.error);

    // Verify session now points to new Lower (not new Upper)
    const { data: updatedSession, error: sessionError } = await adminClient
      .from("sessions")
      .select("program_day_id, program_id")
      .eq("id", oldSession.id)
      .single();

    if (sessionError || !updatedSession) {
      console.error("❌ Failed to fetch updated session:", sessionError?.message);
      return false;
    }

    check(
      "Lower session re-points to new Lower (not Upper)",
      updatedSession.program_day_id === newLowerId,
      `expected ${newLowerId}, got ${updatedSession.program_day_id}`,
    );
    check("program_id updated to new program", updatedSession.program_id === newProgram.id);

    // Cleanup
    await adminClient.from("sessions").delete().eq("user_id", userId);
    await adminClient.from("program_days").delete().in("program_id", [oldProgram.id, newProgram.id]);
    await adminClient.from("programs").delete().in("id", [oldProgram.id, newProgram.id]);
  }

  // Test 2: Bodyweight-only rebuild removes barbell exercises
  console.log("\nTest 2: Bodyweight-only rebuild removes sessions pointing at barbell exercises");
  {
    // Create old gym program
    const { data: oldProgram, error: oldProgramError } = await adminClient
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        status: "active",
      })
      .select("id")
      .single();

    if (oldProgramError || !oldProgram) {
      console.error("❌ Failed to create old program:", oldProgramError?.message);
      return false;
    }

    // Create old program day: Upper (barbell exercises)
    const { data: oldDay, error: oldDayError } = await adminClient
      .from("program_days")
      .insert({
        program_id: oldProgram.id,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper",
        focus: "Chest, Back, Shoulders, Arms",
      })
      .select("id")
      .single();

    if (oldDayError || !oldDay) {
      console.error("❌ Failed to create old program day:", oldDayError?.message);
      return false;
    }

    // Create a planned session with a train-anyway choice (Upper on a rest day)
    const { data: oldSession, error: oldSessionError } = await adminClient
      .from("sessions")
      .insert({
        user_id: userId,
        program_id: oldProgram.id,
        program_day_id: oldDay.id,
        local_date: "2026-10-24",
        planned_type: "rest",
        actual_type: "weights",
        status: "planned",
      })
      .select("id")
      .single();

    if (oldSessionError || !oldSession) {
      console.error("❌ Failed to create old session:", oldSessionError?.message);
      return false;
    }

    // Mark old program as completed
    const { error: completeError } = await adminClient
      .from("programs")
      .update({ status: "completed" })
      .eq("id", oldProgram.id);

    if (completeError) {
      console.error("❌ Failed to mark old program completed:", completeError?.message);
      return false;
    }

    // Create new bodyweight-only program
    const { data: newProgram, error: newProgramError } = await adminClient
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "bodyweight",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        status: "active",
      })
      .select("id")
      .single();

    if (newProgramError || !newProgram) {
      console.error("❌ Failed to create new program:", newProgramError?.message);
      return false;
    }

    // Create new program day: Full Body (bodyweight only)
    const { data: newDay, error: newDayError } = await adminClient
      .from("program_days")
      .insert({
        program_id: newProgram.id,
        user_id: userId,
        day_index: 1,
        day_type: "bodyweight",
        label: "Full Body A",
        focus: "Push-ups, Pull-ups, Squats",
      })
      .select("id")
      .single();

    if (newDayError || !newDay) {
      console.error("❌ Failed to create new program day:", newDayError?.message);
      return false;
    }

    // Run re-pointing
    const result = await repointSessionsAfterRebuild(
      adminClient,
      userId,
      newProgram.id,
      "2026-10-24",
    );

    check("re-point succeeded", result.ok === true, result.error);

    // Verify session was deleted (no matching day_type in new plan)
    const { data: deletedSession, error: sessionError } = await adminClient
      .from("sessions")
      .select("id")
      .eq("id", oldSession.id)
      .maybeSingle();

    if (sessionError) {
      console.error("❌ Failed to check for deleted session:", sessionError?.message);
      return false;
    }

    check("weights session deleted (new plan is bodyweight-only)", deletedSession === null);

    // Cleanup
    await adminClient.from("sessions").delete().eq("user_id", userId);
    await adminClient.from("program_days").delete().in("program_id", [oldProgram.id, newProgram.id]);
    await adminClient.from("programs").delete().in("id", [oldProgram.id, newProgram.id]);
  }

  // Test 3: Sessions with logged sets are kept unchanged
  console.log("\nTest 3: Sessions with logged sets are kept unchanged");
  {
    // Create old program
    const { data: oldProgram, error: oldProgramError } = await adminClient
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        status: "active",
      })
      .select("id")
      .single();

    if (oldProgramError || !oldProgram) {
      console.error("❌ Failed to create old program:", oldProgramError?.message);
      return false;
    }

    // Create old program day
    const { data: oldDay, error: oldDayError } = await adminClient
      .from("program_days")
      .insert({
        program_id: oldProgram.id,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper",
        focus: "Chest, Back",
      })
      .select("id")
      .single();

    if (oldDayError || !oldDay) {
      console.error("❌ Failed to create old program day:", oldDayError?.message);
      return false;
    }

    // Create session with status "in_progress"
    const { data: startedSession, error: startedSessionError } = await adminClient
      .from("sessions")
      .insert({
        user_id: userId,
        program_id: oldProgram.id,
        program_day_id: oldDay.id,
        local_date: "2026-10-24",
        planned_type: "weights",
        actual_type: "weights",
        status: "in_progress",
      })
      .select("id")
      .single();

    if (startedSessionError || !startedSession) {
      console.error("❌ Failed to create started session:", startedSessionError?.message);
      return false;
    }

    // Add a session_exercise and session_set (simulate logged work)
    // First get a valid exercise_id
    const { data: exercise, error: getExerciseError } = await adminClient
      .from("exercises")
      .select("id")
      .eq("slug", "barbell-bench-press-medium-grip")
      .single();

    if (getExerciseError || !exercise) {
      console.error("❌ Failed to get exercise:", getExerciseError?.message);
      return false;
    }

    const { data: sessionExercise, error: exerciseError } = await adminClient
      .from("session_exercises")
      .insert({
        session_id: startedSession.id,
        user_id: userId,
        exercise_id: exercise.id,
        order_index: 1,
        planned_sets: 3,
        planned_reps_min: 8,
        planned_reps_max: 10,
        rest_seconds: 180,
        metric: "reps",
        status: "pending",
      })
      .select("id")
      .single();

    if (exerciseError || !sessionExercise) {
      console.error("❌ Failed to create session exercise:", exerciseError?.message);
      return false;
    }

    const { error: setError } = await adminClient
      .from("session_sets")
      .insert({
        session_exercise_id: sessionExercise.id,
        user_id: userId,
        set_number: 1,
        reps: 8,
        weight_kg: 60,
        is_warmup_set: false,
      });

    if (setError) {
      console.error("❌ Failed to create session set:", setError?.message);
      return false;
    }

    // Mark old program completed
    const { error: completeError } = await adminClient
      .from("programs")
      .update({ status: "completed" })
      .eq("id", oldProgram.id);

    if (completeError) {
      console.error("❌ Failed to mark old program completed:", completeError?.message);
      return false;
    }

    // Create new program
    const { data: newProgram, error: newProgramError } = await adminClient
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        status: "active",
      })
      .select("id")
      .single();

    if (newProgramError || !newProgram) {
      console.error("❌ Failed to create new program:", newProgramError?.message);
      return false;
    }

    // Create new program day
    const { data: newDay, error: newDayError } = await adminClient
      .from("program_days")
      .insert({
        program_id: newProgram.id,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper",
        focus: "Chest, Back",
      })
      .select("id")
      .single();

    if (newDayError || !newDay) {
      console.error("❌ Failed to create new program day:", newDayError?.message);
      return false;
    }

    // Run re-pointing
    const result = await repointSessionsAfterRebuild(
      adminClient,
      userId,
      newProgram.id,
      "2026-10-24",
    );

    check("re-point succeeded", result.ok === true, result.error);

    // Verify session still points to old day (has logged sets)
    const { data: unchangedSession, error: sessionError } = await adminClient
      .from("sessions")
      .select("program_day_id, program_id")
      .eq("id", startedSession.id)
      .single();

    if (sessionError || !unchangedSession) {
      console.error("❌ Failed to fetch unchanged session:", sessionError?.message);
      return false;
    }

    check(
      "session with sets kept at old program_day_id",
      unchangedSession.program_day_id === oldDay.id,
      `expected ${oldDay.id}, got ${unchangedSession.program_day_id}`,
    );
    check("session with sets kept at old program_id", unchangedSession.program_id === oldProgram.id);

    // Cleanup
    await adminClient.from("session_sets").delete().eq("user_id", userId);
    await adminClient.from("session_exercises").delete().eq("user_id", userId);
    await adminClient.from("sessions").delete().eq("user_id", userId);
    await adminClient.from("program_days").delete().in("program_id", [oldProgram.id, newProgram.id]);
    await adminClient.from("programs").delete().in("id", [oldProgram.id, newProgram.id]);
  }

  // Cleanup test user
  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error("⚠️  Failed to delete test user:", deleteUserError.message);
  }

  return failures === 0;
}

runTests()
  .then((ok) => {
    if (!ok) {
      console.error(`\n❌ ${failures} test(s) failed\n`);
      process.exit(1);
    } else {
      console.log("\n✓ All tests passed\n");
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error("\n❌ Fatal error:", err);
    process.exit(1);
  });
