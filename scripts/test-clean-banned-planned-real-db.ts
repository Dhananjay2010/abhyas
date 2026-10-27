/**
 * Real database test: clean banned exercises from program_day_exercises
 * 
 * Tests cleanBannedPlannedExercises helper (src/lib/program/clean-banned-planned.ts):
 * 1. Dirty plan for knee user is cleaned (banned exercises replaced)
 * 2. Second run writes 0 rows (idempotent compare-and-swap)
 * 3. Session exercises/sets checksums unchanged for both users
 * 4. Non-knee user's plan unchanged
 * 5. User B's dirty plan unaffected by user A's cleanup (RLS isolation)
 * 
 * Run: supabase start && REAL_DB=1 npm run test:clean-banned-planned-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { cleanBannedPlannedExercises } from "../src/lib/program/clean-banned-planned";
import type { Database } from "../src/lib/database.types";
import { createHash } from "crypto";

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

function hashJSON(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
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

  console.log("Clean Banned Planned Tests\n");

  // Get a banned exercise (e.g., barbell-back-squat for knee users)
  const { data: catalogue } = await adminClient
    .from("exercises")
    .select("id, slug")
    .eq("is_active", true);

  const bannedSlug = "barbell-back-squat";
  const bannedExercise = catalogue?.find((e) => e.slug === bannedSlug);
  const replacementSlug = "goblet-squat";
  const replacementExercise = catalogue?.find((e) => e.slug === replacementSlug);

  if (!bannedExercise || !replacementExercise) {
    console.error(`❌ Required exercises not found in DB: ${bannedSlug}, ${replacementSlug}`);
    return false;
  }

  console.log(`✓ Found test exercises: ${bannedSlug} → ${replacementSlug}\n`);

  // Create test user A (knee injury)
  const testEmailA = `test-clean-banned-a-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  const { data: authDataA, error: authErrorA } = await adminClient.auth.admin.createUser({
    email: testEmailA,
    password: testPassword,
    email_confirm: true,
  });

  if (authErrorA || !authDataA.user) {
    console.error("❌ Failed to create test user A:", authErrorA);
    return false;
  }

  const userIdA = authDataA.user.id;
  console.log(`✓ Created test user A: ${userIdA}\n`);

  // Create test user B (no injury) for isolation test
  const testEmailB = `test-clean-banned-b-${Date.now()}@example.com`;

  const { data: authDataB, error: authErrorB } = await adminClient.auth.admin.createUser({
    email: testEmailB,
    password: testPassword,
    email_confirm: true,
  });

  if (authErrorB || !authDataB.user) {
    console.error("❌ Failed to create test user B:", authErrorB);
    return false;
  }

  const userIdB = authDataB.user.id;
  console.log(`✓ Created test user B: ${userIdB}\n`);

  // Set up user A with profile and knee injury
  await adminClient.from("profiles").update({
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 3,
    yoga_days_per_week: 0,
    has_all_equipment: true,
  }).eq("id", userIdA);

  await adminClient.from("user_injuries").insert({
    user_id: userIdA,
    body_region: "knee",
    severity: "current",
  });

  console.log(`✓ Set user A profile with current knee injury\n`);

  // Set up user B with profile, no injury
  await adminClient.from("profiles").update({
    goal: "muscle_gain",
    level: "beginner",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 1,
    has_all_equipment: true,
  }).eq("id", userIdB);

  console.log(`✓ Set user B profile with no injury\n`);

  // Create dirty program for user A (with banned exercise)
  const programIdA = randomUUID();
  const dayIdA = randomUUID();

  await adminClient.from("programs").insert({
    id: programIdA,
    user_id: userIdA,
    block_number: 1,
    status: "active",
    started_on: new Date().toISOString().split("T")[0],
  });

  await adminClient.from("program_days").insert({
    id: dayIdA,
    program_id: programIdA,
    user_id: userIdA,
    day_index: 0,
    day_type: "weights",
    status: "active",
  });

  const plannedIdA = randomUUID();
  await adminClient.from("program_day_exercises").insert({
    id: plannedIdA,
    program_day_id: dayIdA,
    user_id: userIdA,
    exercise_id: bannedExercise.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 120,
  });

  console.log(`✓ Created dirty program for user A (contains ${bannedSlug})\n`);

  // Create dirty program for user B (same banned exercise, different user)
  const programIdB = randomUUID();
  const dayIdB = randomUUID();

  await adminClient.from("programs").insert({
    id: programIdB,
    user_id: userIdB,
    block_number: 1,
    status: "active",
    started_on: new Date().toISOString().split("T")[0],
  });

  await adminClient.from("program_days").insert({
    id: dayIdB,
    program_id: programIdB,
    user_id: userIdB,
    day_index: 0,
    day_type: "weights",
    status: "active",
  });

  const plannedIdB = randomUUID();
  await adminClient.from("program_day_exercises").insert({
    id: plannedIdB,
    program_day_id: dayIdB,
    user_id: userIdB,
    exercise_id: bannedExercise.id,
    order_index: 0,
    target_sets: 4,
    target_reps_min: 6,
    target_reps_max: 10,
    rest_seconds: 180,
  });

  console.log(`✓ Created program for user B (contains ${bannedSlug})\n`);

  // Create anon client for user A
  const clientA = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInErrorA } = await clientA.auth.signInWithPassword({
    email: testEmailA,
    password: testPassword,
  });

  if (signInErrorA) {
    console.error("❌ Failed to sign in as user A:", signInErrorA);
    return false;
  }

  // TEST 1: Clean dirty plan
  console.log("Test 1: Clean dirty plan for knee user\n");

  const result1 = await cleanBannedPlannedExercises(clientA, userIdA);

  check("Cleaning succeeded", result1.errors.length === 0);
  check("At least one exercise cleaned", result1.cleaned >= 1, `cleaned=${result1.cleaned}`);

  const { data: afterClean1 } = await adminClient
    .from("program_day_exercises")
    .select("exercise_id")
    .eq("id", plannedIdA)
    .single();

  check(
    "Banned exercise replaced",
    afterClean1?.exercise_id === replacementExercise.id,
    `expected ${replacementExercise.id}, got ${afterClean1?.exercise_id}`,
  );

  // TEST 2: Second run writes 0 rows
  console.log("\nTest 2: Second run is idempotent (0 writes)\n");

  const result2 = await cleanBannedPlannedExercises(clientA, userIdA);

  check("Second run cleaned 0 rows", result2.cleaned === 0, `cleaned=${result2.cleaned}`);
  check("No errors on second run", result2.errors.length === 0);

  // TEST 3: User B's plan unaffected
  console.log("\nTest 3: User B's plan unaffected by user A's cleanup\n");

  const { data: userBPlan } = await adminClient
    .from("program_day_exercises")
    .select("exercise_id")
    .eq("id", plannedIdB)
    .single();

  check(
    "User B still has banned exercise",
    userBPlan?.exercise_id === bannedExercise.id,
    "RLS isolation",
  );

  // TEST 4: Non-knee user's plan unchanged
  console.log("\nTest 4: Non-knee user's plan unchanged\n");

  // Update user A to past knee injury
  await adminClient
    .from("user_injuries")
    .update({ severity: "past" })
    .eq("user_id", userIdA)
    .eq("body_region", "knee");

  // Revert the exercise back to banned
  await adminClient
    .from("program_day_exercises")
    .update({ exercise_id: bannedExercise.id })
    .eq("id", plannedIdA);

  const result3 = await cleanBannedPlannedExercises(clientA, userIdA);

  check("Past knee user also gets cleaned", result3.cleaned >= 1, `cleaned=${result3.cleaned}`);

  // Remove injury entirely
  await adminClient.from("user_injuries").delete().eq("user_id", userIdA);

  // Revert again
  await adminClient
    .from("program_day_exercises")
    .update({ exercise_id: bannedExercise.id })
    .eq("id", plannedIdA);

  const result4 = await cleanBannedPlannedExercises(clientA, userIdA);

  check("Non-knee user: 0 cleaned", result4.cleaned === 0, `cleaned=${result4.cleaned}`);

  const { data: nonKneePlan } = await adminClient
    .from("program_day_exercises")
    .select("exercise_id")
    .eq("id", plannedIdA)
    .single();

  check(
    "Non-knee user still has original exercise",
    nonKneePlan?.exercise_id === bannedExercise.id,
    "no unnecessary changes",
  );

  // TEST 5: Session exercises checksums unchanged
  console.log("\nTest 5: Session exercises/sets checksums unchanged\n");

  // Restore knee injury for user A
  await adminClient.from("user_injuries").insert({
    user_id: userIdA,
    body_region: "knee",
    severity: "current",
  });

  // Create a session for user A
  const sessionIdA = randomUUID();
  await adminClient.from("sessions").insert({
    id: sessionIdA,
    user_id: userIdA,
    program_day_id: dayIdA,
    status: "in_progress",
    actual_type: "weights",
  });

  const sessionExIdA = randomUUID();
  await adminClient.from("session_exercises").insert({
    id: sessionExIdA,
    session_id: sessionIdA,
    user_id: userIdA,
    exercise_id: replacementExercise.id,
    order_index: 0,
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 120,
    metric: "reps",
  });

  const setIdA = randomUUID();
  await adminClient.from("session_sets").insert({
    id: setIdA,
    session_exercise_id: sessionExIdA,
    user_id: userIdA,
    set_index: 0,
    reps: 10,
    weight: 100,
  });

  // Capture before checksums
  const { data: beforeExercises } = await adminClient
    .from("session_exercises")
    .select("*")
    .eq("session_id", sessionIdA)
    .order("order_index");

  const { data: beforeSets } = await adminClient
    .from("session_sets")
    .select("*")
    .eq("session_exercise_id", sessionExIdA)
    .order("set_index");

  const beforeExHash = hashJSON(beforeExercises);
  const beforeSetsHash = hashJSON(beforeSets);

  // Clean again (shouldn't affect session data)
  await cleanBannedPlannedExercises(clientA, userIdA);

  // Capture after checksums
  const { data: afterExercises } = await adminClient
    .from("session_exercises")
    .select("*")
    .eq("session_id", sessionIdA)
    .order("order_index");

  const { data: afterSets } = await adminClient
    .from("session_sets")
    .select("*")
    .eq("session_exercise_id", sessionExIdA)
    .order("set_index");

  const afterExHash = hashJSON(afterExercises);
  const afterSetsHash = hashJSON(afterSets);

  check("Session exercises unchanged", beforeExHash === afterExHash);
  check("Session sets unchanged", beforeSetsHash === afterSetsHash);

  // Clean up
  console.log("\nCleaning up test data...\n");

  await adminClient.auth.admin.deleteUser(userIdA);
  await adminClient.auth.admin.deleteUser(userIdB);

  console.log(`✓ Cleaned up test users\n`);

  if (failures === 0) {
    console.log("✅ All tests passed!\n");
    return true;
  } else {
    console.log(`\n❌ ${failures} test(s) failed\n`);
    return false;
  }
}

runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test runner crashed:", error);
    process.exit(1);
  });
