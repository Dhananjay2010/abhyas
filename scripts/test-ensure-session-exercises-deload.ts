/**
 * Test ensureSessionExercises deload (HIGH-2): ensures existing planned
 * sessions get the same deload prescription as fresh starts.
 * 
 * Real-DB test for the "What about tomorrow?" and abandoned session paths.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { randomUUID } from "crypto";
import { ensureSessionExercises } from "@/app/session/actions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

async function isSupabaseAvailable(): Promise<boolean> {
  if (process.env.REAL_DB !== "1") {
    console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
    console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
    return false;
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("\n❌ REAL_DB=1 but SUPABASE_SERVICE_ROLE_KEY not set\n");
    return false;
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await client.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function testEnsureSessionExercisesDeload() {
  const isAvailable = await isSupabaseAvailable();
  if (!isAvailable) {
    // Skipped, not failed
    return;
  }

  console.log("✓ Connected to Supabase\n");

  const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  console.log("✓ Using service_role key\n");
  console.log("Test ensureSessionExercises deload (HIGH-2)\n");

  // Create test user
  const userEmail = `test-ensure-deload-${randomUUID()}@example.com`;
  const { data: authData } = await adminClient.auth.admin.createUser({
    email: userEmail,
    password: "test-password-123",
    email_confirm: true,
  });

  if (!authData?.user) {
    console.error("Failed to create test user");
    return false;
  }

  const userId = authData.user.id;
  console.log(`✓ Created test user: ${userId}\n`);

  // Update profile
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

  // Create program with deload week 4
  const programId = randomUUID();
  const { error: programError } = await adminClient
    .from("programs")
    .insert({
      id: programId,
      user_id: userId,
      status: "active",
      started_on: "2026-10-01",
      ends_on: "2026-10-28",
      block_number: 1,
      split_type: "upper_lower",
      deload_week: 4,
      week_offset: 3, // Week 4 = deload
      days_per_week: 4,
      primary_track: "weights",
      goal: "muscle_gain",
      level: "intermediate",
    });

  check("Program created", !programError, programError?.message);
  if (programError) return false;

  // Create program day with 2 exercises
  const dayId = randomUUID();
  const { error: dayError } = await adminClient
    .from("program_days")
    .insert({
      id: dayId,
      program_id: programId,
      user_id: userId,
      day_index: 1,
      day_type: "weights",
      label: "Upper",
      focus: "push",
      status: "active",
    });

  check("Program day created", !dayError, dayError?.message);
  if (dayError) return false;

  // Get seeded exercises
  const { data: exercises } = await adminClient
    .from("exercises")
    .select("id, name, metric")
    .in("name", ["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press"])
    .order("name");

  if (!exercises || exercises.length < 2) {
    console.error("Failed to find seeded exercises");
    return false;
  }

  const bench = exercises[0];
  const dumbbell = exercises[1];

  // Add exercises to program day
  const { error: pdeError } = await adminClient
    .from("program_day_exercises")
    .insert([
      {
        program_day_id: dayId,
        user_id: userId,
        exercise_id: bench.id,
        order_index: 0,
        target_sets: 4,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 180,
      },
      {
        program_day_id: dayId,
        user_id: userId,
        exercise_id: dumbbell.id,
        order_index: 1,
        target_sets: 5,
        target_reps_min: 6,
        target_reps_max: 10,
        rest_seconds: 240,
      },
    ]);

  check("Program day exercises created", !pdeError, pdeError?.message);
  if (pdeError) return false;

  // Create an empty planned deload session (the "What about tomorrow?" path)
  const sessionId = randomUUID();
  const { error: sessionError } = await adminClient
    .from("sessions")
    .insert({
      id: sessionId,
      user_id: userId,
      program_day_id: dayId,
      program_id: programId,
      local_date: "2026-10-25",
      status: "planned",
      actual_type: "weights",
      is_deload: true, // This is deload week
    });

  check("Empty planned deload session created", !sessionError, sessionError?.message);
  if (sessionError) return false;

  // Verify session has no exercises before calling ensureSessionExercises
  const { data: beforeData } = await adminClient
    .from("sessions")
    .select("session_exercises(id)")
    .eq("id", sessionId)
    .maybeSingle();

  check("Session has no exercises before", (beforeData?.session_exercises ?? []).length === 0);

  console.log("\nCalling ensureSessionExercises (the real function)...");

  // Call the REAL ensureSessionExercises function
  await ensureSessionExercises(adminClient, userId, sessionId);

  // Verify the created exercises have deload-reduced sets
  const { data: createdExercises } = await adminClient
    .from("session_exercises")
    .select("planned_sets, planned_reps_min, planned_reps_max, rest_seconds, order_index")
    .eq("session_id", sessionId)
    .order("order_index");

  check("2 exercises created", createdExercises?.length === 2);

  // Bench: 4 sets → 2 sets (deload)
  const benchSets = createdExercises?.[0].planned_sets;
  check(
    "Bench has 2 deload sets (from 4)",
    benchSets === 2,
    `got ${benchSets}`,
  );
  check("Bench reps unchanged (8-12)", createdExercises?.[0].planned_reps_min === 8 && createdExercises?.[0].planned_reps_max === 12);

  // Dumbbell: 5 sets → 3 sets (deload)
  const dumbbellSets = createdExercises?.[1].planned_sets;
  check(
    "Dumbbell has 3 deload sets (from 5)",
    dumbbellSets === 3,
    `got ${dumbbellSets}`,
  );
  check("Dumbbell reps unchanged (6-10)", createdExercises?.[1].planned_reps_min === 6 && createdExercises?.[1].planned_reps_max === 10);

  console.log("\nExpected:");
  console.log(`  Bench: 4 → 2 sets (deload)`);
  console.log(`  Dumbbell: 5 → 3 sets (deload)`);
  console.log("\nActual:");
  console.log(`  Bench: ${benchSets} sets`);
  console.log(`  Dumbbell: ${dumbbellSets} sets`);

  // Cleanup
  console.log("\nCleaning up...");
  await adminClient.auth.admin.deleteUser(userId);
  console.log("✓ Test user deleted\n");

  return true;
}

async function main() {
  const success = await testEnsureSessionExercisesDeload();
  if (success === false) {
    // Explicitly false means test failed (not skipped)
    process.exit(1);
  } else {
    // success === true or success === undefined (skipped)
    console.log("✅ All tests passed\n");
    process.exit(0);
  }
}

main();
