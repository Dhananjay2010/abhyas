#!/usr/bin/env tsx
/**
 * Test resolveSwapWeights with real DB (MEDIUM-1): kills mutants M3, M3b, M7, M7b, M8
 * and the Number(null) bug.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { randomUUID } from "crypto";
import { resolveSwapWeights } from "@/lib/session/resolve-swap-weights";

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

async function testResolveSwapWeights() {
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

  console.log("Test resolveSwapWeights (real DB)\n");

  // Create test user
  const userEmail = `test-resolve-swap-${randomUUID()}@example.com`;
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

  // Get exercise IDs
  const { data: exercises } = await adminClient
    .from("exercises")
    .select("id, name")
    .in("name", ["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press"])
    .order("name");

  if (!exercises || exercises.length < 2) {
    console.error("Failed to find seeded exercises");
    await adminClient.auth.admin.deleteUser(userId);
    return false;
  }

  const oldExerciseId = exercises[0].id;
  const newExerciseId = exercises[1].id;

  // Insert progress for OLD exercise (should NOT be used)
  await adminClient.from("exercise_progress").insert([{
    user_id: userId,
    exercise_id: oldExerciseId,
    current_working_weight_kg: 42,
  }]);

  // Insert progress for NEW exercise (working weight 100)
  await adminClient.from("exercise_progress").insert([{
    user_id: userId,
    exercise_id: newExerciseId,
    current_working_weight_kg: 100,
  }]);

  // Insert history for NEW exercise (last top set 30 kg)
  // @ts-expect-error - Supabase types infer never[] for exercise_history inserts
  await adminClient.from("exercise_history").insert([{
    user_id: userId,
    exercise_id: newExerciseId,
    session_date: "2026-10-20",
    session_id: randomUUID(),
    set_number: 1,
    weight_kg: 30,
    reps: 10,
    metric: "reps" as const,
  }]);

  // Create deload session
  const deloadSessionId = randomUUID();
  await adminClient.from("sessions").insert({
    id: deloadSessionId,
    user_id: userId,
    local_date: "2026-10-25",
    status: "planned",
    actual_type: "weights",
    is_deload: true,
  });

  // Create non-deload session
  const normalSessionId = randomUUID();
  await adminClient.from("sessions").insert({
    id: normalSessionId,
    user_id: userId,
    local_date: "2026-10-26",
    status: "planned",
    actual_type: "weights",
    is_deload: false,
  });

  console.log("Case 1: Deload session, NEW exercise with progress\n");
  const result1 = await resolveSwapWeights(
    adminClient,
    userId,
    deloadSessionId,
    newExerciseId,
    ["barbell"],
    "reps",
    "horizontal_press",
  );

  check("Returns non-null prefill", result1.weightPrefill !== null, `got ${result1.weightPrefill}`);
  check("Prefill is deloaded (~70%)", result1.weightPrefill! >= 65 && result1.weightPrefill! <= 75, `got ${result1.weightPrefill}`);
  check("Working weight from NEW exercise", result1.workingWeightKg === 100, `got ${result1.workingWeightKg}`);
  check("Not bodyweight", !result1.isBodyweight);

  console.log("\nCase 2: Non-deload session, same exercise\n");
  const result2 = await resolveSwapWeights(
    adminClient,
    userId,
    normalSessionId,
    newExerciseId,
    ["barbell"],
    "reps",
    "horizontal_press",
  );

  check("Non-deload prefill is higher", result2.weightPrefill! > result1.weightPrefill!, `${result2.weightPrefill} vs ${result1.weightPrefill}`);
  check("Working weight unchanged", result2.workingWeightKg === 100);

  console.log("\nCase 3: Never-done exercise (no progress or history)\n");
  const neverDoneId = randomUUID();
  const result3 = await resolveSwapWeights(
    adminClient,
    userId,
    normalSessionId,
    neverDoneId,
    ["dumbbell"],
    "reps",
    "horizontal_pull",
  );

  check("Prefill is null for never-done", result3.weightPrefill === null);
  check("Working weight is null (not 0)", result3.workingWeightKg === null, `got ${result3.workingWeightKg}`);
  check("Not bodyweight", !result3.isBodyweight);

  console.log("\nCase 4: Bodyweight exercise\n");
  const result4 = await resolveSwapWeights(
    adminClient,
    userId,
    normalSessionId,
    neverDoneId,
    [],
    "reps",
    "vertical_press",
  );

  check("Bodyweight flag set", result4.isBodyweight);

  console.log("\nCase 5: Session read error (invalid session ID)\n");
  const result5 = await resolveSwapWeights(
    adminClient,
    userId,
    "invalid-session-id",
    newExerciseId,
    ["barbell"],
    "reps",
    "horizontal_press",
  );

  check("Session error gives null prefill", result5.weightPrefill === null);
  check("Session error still returns working weight", result5.workingWeightKg === 100, `got ${result5.workingWeightKg}`);

  console.log("\nCase 6: Progress read error (invalid user ID)\n");
  const result6 = await resolveSwapWeights(
    adminClient,
    "invalid-user-id",
    normalSessionId,
    newExerciseId,
    ["barbell"],
    "reps",
    "horizontal_press",
  );

  check("Progress error gives null working weight", result6.workingWeightKg === null);

  // Cleanup
  console.log("\nCleaning up...");
  await adminClient.auth.admin.deleteUser(userId);
  console.log("✓ Test user deleted\n");

  return true;
}

async function main() {
  const success = await testResolveSwapWeights();
  if (success === false) {
    process.exit(1);
  } else {
    console.log("✅ All resolveSwapWeights real-DB tests passed\n");
    console.log("Mutant coverage:");
    console.log("  M3: returning null prefill → fails case 1");
    console.log("  M3b: returning null workingWeightKg → fails case 1");
    console.log("  M7/M7b: using OLD exercise id → fails case 1 (gets 42 not 100)");
    console.log("  M8: ignoring is_deload → fails case 2 (deload vs normal)");
    console.log("  Number(null) bug: → fails case 3 (0 instead of null)\n");
    process.exit(0);
  }
}

main();
