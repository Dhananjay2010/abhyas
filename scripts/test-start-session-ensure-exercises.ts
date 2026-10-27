#!/usr/bin/env tsx
/**
 * Test startSession existing-session branch calls ensureSessionExercises (A1).
 * 
 * LIMITATION: This test cannot directly invoke startSession without editing
 * actions.ts:104-260 because:
 * - startSession is a server action requiring Next.js runtime
 * - It calls getAuthedClient() which needs server context
 * - Module mocking for ESM is unreliable
 * 
 * This test verifies ensureSessionExercises behavior (which startSession calls),
 * but CANNOT catch mutant A1 (removing the ensureSessionExercises call at line 151).
 * 
 * To properly test A1, actions.ts would need dependency injection or a test seam
 * outside the protected 104-260 range.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { randomUUID } from "crypto";
import { ensureSessionExercises } from "@/lib/session/ensure-session-exercises";
import { checkRealDbTest } from "./lib-db-reset-guard";

if (!checkRealDbTest("./supabase/config.toml").allow) {
  console.error("❌ REAL_DB=1 guard refused (see above reason)");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
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

async function testStartSessionEnsureExercises() {
  const isAvailable = await isSupabaseAvailable();
  if (!isAvailable) {
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
  console.log("Test ensureSessionExercises (called by startSession at line 151)\n");
  console.log("⚠️  LIMITATION: Cannot test startSession directly without editing protected code\n");

  // Create test user
  const userEmail = `test-start-ensure-${randomUUID()}@example.com`;
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
      timezone: "America/New_York",
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  check("Profile updated", !profileError, profileError?.message);
  if (profileError) return false;

  // Create program
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
      week_offset: 3,
      days_per_week: 4,
      primary_track: "weights",
      goal: "muscle_gain",
      level: "intermediate",
    });

  check("Program created", !programError, programError?.message);
  if (programError) return false;

  // Create program day with 2 exercises
  const dayId = randomUUID();
  const { error: dayError} = await adminClient
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
    .select("id, name")
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
        target_sets: 3,
        target_reps_min: 10,
        target_reps_max: 15,
        rest_seconds: 120,
      },
    ]);

  check("Program day exercises created", !pdeError, pdeError?.message);
  if (pdeError) return false;

  // Create an EMPTY planned session
  const sessionId = randomUUID();
  const localDate = "2026-10-25";
  const { error: sessionError } = await adminClient
    .from("sessions")
    .insert({
      id: sessionId,
      user_id: userId,
      program_day_id: dayId,
      program_id: programId,
      local_date: localDate,
      status: "planned",
      actual_type: "weights",
      is_deload: false,
    });

  check("Empty planned session created", !sessionError, sessionError?.message);
  if (sessionError) return false;

  // Verify session has no exercises before
  const { data: beforeData } = await adminClient
    .from("sessions")
    .select("session_exercises(id)")
    .eq("id", sessionId)
    .maybeSingle();

  check("Session has no exercises before", (beforeData?.session_exercises ?? []).length === 0);

  console.log("\nCalling ensureSessionExercises (what startSession calls at line 151)...\n");

  // Call ensureSessionExercises (what startSession does)
  await ensureSessionExercises(adminClient, userId, sessionId);

  // Verify exercises exist after
  const { data: afterData } = await adminClient
    .from("sessions")
    .select("session_exercises(id, planned_sets, exercise_id)")
    .eq("id", sessionId)
    .maybeSingle();

  const exerciseCount = (afterData?.session_exercises ?? []).length;

  check(
    "Session has exercises after ensureSessionExercises",
    exerciseCount === 2,
    `got ${exerciseCount}, expected 2`,
  );

  // Verify correct sets
  const sessionExercises = afterData?.session_exercises ?? [];
  type SessionExerciseRow = { id: string; planned_sets: number | null; exercise_id: string };
  check("Bench exercise created", sessionExercises.some((e: SessionExerciseRow) => e.planned_sets === 4));
  check("Dumbbell exercise created", sessionExercises.some((e: SessionExerciseRow) => e.planned_sets === 3));

  console.log("\n✅ ensureSessionExercises test passed");
  console.log("\n⚠️  MUTANT A1 LIMITATION:");
  console.log("   This test CANNOT catch mutant A1 (removing ensureSessionExercises call)");
  console.log("   because it doesn't invoke the actual startSession server action.");
  console.log("   To test A1, actions.ts would need a test seam outside lines 104-260.\n");

  // Cleanup
  console.log("Cleaning up...");
  await adminClient.auth.admin.deleteUser(userId);
  console.log("✓ Test user deleted\n");

  return true;
}

async function main() {
  const success = await testStartSessionEnsureExercises();
  if (success === false) {
    process.exit(1);
  } else {
    console.log("✅ Test passed (with limitation noted above)\n");
    process.exit(0);
  }
}

main();
