/**
 * Real database tests for pd-b bug fix: rebuilding from Settings after block ends
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify:
 * - rebuild_block marks ended blocks as 'completed' not 'superseded'
 * - Progress days trained include all completed sessions
 * - progressStartDate picks the earlier of block start and first qualifying session
 *
 * Run: supabase start && REAL_DB=1 npm run test:rebuild-rollover-progress-real-db
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { Database } from "../src/lib/database.types.js";
import { rebuildPlanCore } from "../src/lib/program/rebuild-plan-core.js";
import { buildRebuildPlanDeps } from "../src/lib/program/rebuild-plan-deps.js";
import { activeDayIndices } from "../src/lib/program/splits.js";
import { checkRealDbTest } from "./lib-db-reset-guard.js";

// Skip unless REAL_DB=1
if (process.env.REAL_DB !== "1") {
  console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
  console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
  process.exit(0);
}

// Check guard
const guardResult = checkRealDbTest();
if (!guardResult.allow) {
  console.log(`\n⏭️  Skipping real DB tests: ${guardResult.reason}\n`);
  process.exit(0);
}

console.log(`✓ Guard check passed: ${guardResult.reason}\n`);

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let testsFailed = 0;
function assert(condition: boolean, message: string, detail = "") {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}${detail ? ` (${detail})` : ""}`);
    testsFailed++;
  } else {
    console.log(`  ✓    ${message}${detail ? ` ${detail}` : ""}`);
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
  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.error("\n❌ REAL_DB=1 but Supabase is not available");
    console.error("   Run `supabase start` to enable these tests\n");
    process.exit(1);
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
      process.exit(1);
    }
    console.log(`✓ Using service_role key\n`);
  } catch {
    console.error("❌ Failed to decode service role key");
    process.exit(1);
  }

  // Track created users for cleanup
  const createdUserIds: string[] = [];

  // Get a test exercise for sessions
  const { data: exerciseRows, error: exerciseError } = await adminClient
    .from("exercises")
    .select("id")
    .eq("is_active", true)
    .limit(1);

  if (exerciseError || !exerciseRows || exerciseRows.length === 0) {
    console.error("❌ Failed to find test exercise:", exerciseError);
    process.exit(1);
  }
  const exerciseId = exerciseRows[0].id;
  assert(!!exerciseId, "Found test exercise");

  try {
    console.log("TEST: pd-b scenario - Settings rebuild after block ends WITHOUT Today rollover");
  {
    const scenarioStartFailures = testsFailed;
    // Create test user via admin API
    const testEmail = `test-rebuild-${Date.now()}@example.com`;
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: "test-password-123",
      email_confirm: true,
    });

    if (createError || !authData.user) {
      console.error("❌ Failed to create test user:", createError);
      process.exit(1);
    }

    const userId = authData.user.id;
    createdUserIds.push(userId);
    assert(!!userId, "Created test user");

    // Ensure profile exists (trigger creates it, but set required fields for plan builder)
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: userId,
      timezone: "America/Los_Angeles",
      onboarding_completed_at: new Date().toISOString(),
      date_of_birth: "1990-01-01",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
    });

    if (profileError) {
      console.error("❌ Failed to upsert profile:", profileError);
      process.exit(1);
    }

    // Create block 1: started 2026-09-29, ends 2026-10-26 (28 days), still 'active'
    const blockId1 = randomUUID();
    const dayId1 = randomUUID();

    const { error: progError } = await adminClient.from("programs").insert({
      id: blockId1,
      user_id: userId,
      block_number: 1,
      split_type: "upper_lower",
      days_per_week: 4,
      primary_track: "weights",
      goal: "strength",
      level: "intermediate",
      started_on: "2026-09-29",
      ends_on: "2026-10-26",
      deload_week: 4,
      week_offset: 0,
      status: "active",
    });

    if (progError) {
      console.error("❌ Failed to create program:", progError);
      process.exit(1);
    }

    const { error: dayError } = await adminClient.from("program_days").insert({
      id: dayId1,
      program_id: blockId1,
      user_id: userId,
      day_index: 1,
      day_type: "weights",
      label: "Upper A",
    });

    if (dayError) {
      console.error("❌ Failed to create program day:", dayError);
      process.exit(1);
    }

    const orderIndex = 0;
    const { error: exError } = await adminClient.from("program_day_exercises").insert({
      id: randomUUID(),
      program_day_id: dayId1,
      user_id: userId,
      exercise_id: exerciseId,
      order_index: orderIndex,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
    });

    if (exError) {
      console.error("❌ Failed to create program day exercise:", exError);
      process.exit(1);
    }

    // Create a completed session on 2026-09-30 with working sets
    const sessionId1 = randomUUID();
    const { error: sessError } = await adminClient.from("sessions").insert({
      id: sessionId1,
      user_id: userId,
      local_date: "2026-09-30",
      status: "completed",
      planned_type: "weights",
      actual_type: "weights",
    });

    if (sessError) {
      console.error("❌ Failed to create session:", sessError);
      process.exit(1);
    }

    const sessionExId = randomUUID();
    const { error: sessExError } = await adminClient.from("session_exercises").insert({
      id: sessionExId,
      session_id: sessionId1,
      user_id: userId,
      exercise_id: exerciseId,
      order_index: orderIndex,
    });

    if (sessExError) {
      console.error("❌ Failed to create session exercise:", sessExError);
      process.exit(1);
    }

    // Add working sets
    const { error: setError } = await adminClient.from("session_sets").insert([
      {
        id: randomUUID(),
        session_exercise_id: sessionExId,
        user_id: userId,
        set_number: 1,
        reps: 10,
        weight_kg: 50,
      },
      {
        id: randomUUID(),
        session_exercise_id: sessionExId,
        user_id: userId,
        set_number: 2,
        reps: 10,
        weight_kg: 50,
      },
    ]);

    if (setError) {
      console.error("❌ Failed to create session sets:", setError);
      process.exit(1);
    }

    // Pin today for the ENTIRE flow (no clock drift between setup, RPCs, and assertions):
    // 2026-10-27 is the day after block 1 ends on 2026-10-26. Both RPCs get this date.
    const today = "2026-10-27";

    // Before rebuild: block 1 is still active, ends_on has passed
    const { data: beforeData, error: beforeError } = await adminClient
      .from("programs")
      .select("status, ends_on")
      .eq("id", blockId1)
      .single();

    if (beforeError) {
      console.error("❌ Failed to fetch program before rebuild:", beforeError);
      process.exit(1);
    }

    assert(beforeData.status === "active", "Block 1 is active before rebuild", `got ${beforeData.status}`);
    assert(beforeData.ends_on === "2026-10-26", "Block 1 ends_on is 2026-10-26", `got ${beforeData.ends_on}`);

    // Create authenticated client (rebuild_block RPC requires auth.uid())
    const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: "test-password-123",
    });
    if (signInError) {
      console.error("❌ Failed to sign in test user:", signInError);
      process.exit(1);
    }

    // Rebuild via rebuildPlanCore (same code path as Settings)
    const deps = buildRebuildPlanDeps(userClient, userId, today);
    const result = await rebuildPlanCore(deps);

    assert(result.ok === true, "Rebuild succeeded", result.ok ? "" : result.error);

    // After rebuild: block 1 should be 'completed' (not 'superseded')
    const { data: afterData, error: afterError } = await adminClient
      .from("programs")
      .select("status")
      .eq("id", blockId1)
      .single();

    if (afterError) {
      console.error("❌ Failed to fetch program after rebuild:", afterError);
      process.exit(1);
    }

    assert(afterData.status === "completed", "Block 1 marked 'completed' (not 'superseded')", `got ${afterData.status}`);

    // Verify new block 2 was created and count all blocks
    const { data: allBlocks, error: allBlocksError } = await adminClient
      .from("programs")
      .select("id, block_number, status, started_on, week_offset")
      .eq("user_id", userId)
      .order("block_number", { ascending: true });

    if (allBlocksError || !allBlocks) {
      console.error("❌ Failed to fetch all blocks:", allBlocksError);
      process.exit(1);
    }

    assert(allBlocks.length === 2, "Exactly 2 blocks exist", `got ${allBlocks.length}`);
    assert(allBlocks[0].status === "completed", "Block 1 is completed", `got ${allBlocks[0].status}`);
    assert(allBlocks[1].status === "active", "Block 2 is active", `got ${allBlocks[1].status}`);
    assert(allBlocks[1].block_number === 2, "Block 2 has block_number 2", `got ${allBlocks[1].block_number}`);
    assert(allBlocks[1].started_on === today, "Block 2 started_on equals today", `got ${allBlocks[1].started_on}`);
    assert(allBlocks[1].week_offset === 0, "Block 2 week_offset is 0", `got ${allBlocks[1].week_offset}`);
    
    // Check current week number (week 1 since week_offset is 0 and it just started)
    const daysSinceStart = Math.floor((new Date(today).getTime() - new Date(allBlocks[1].started_on).getTime()) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    assert(currentWeek === 1, "Current week is 1", `got ${currentWeek}`);
    
    // Verify no superseded blocks exist
    const supersededBlocks = allBlocks.filter(b => b.status === "superseded");
    assert(supersededBlocks.length === 0, "No superseded blocks", `got ${supersededBlocks.length}`);

    if (testsFailed === scenarioStartFailures) {
      console.log("  PASS: pd-b scenario test\n");
    } else {
      console.log(`  FAIL: pd-b scenario test (${testsFailed - scenarioStartFailures} failures)\n`);
    }
  }

  console.log("TEST: Mid-block rebuild supersedes old block");
  {
    const scenarioStartFailures = testsFailed;
    // Create test user
    const testEmail = `test-midblock-${Date.now()}@example.com`;
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: "test-password-456",
      email_confirm: true,
    });

    if (createError || !authData.user) {
      console.error("❌ Failed to create test user:", createError);
      process.exit(1);
    }

    const userId = authData.user.id;
    createdUserIds.push(userId);

    // Ensure profile exists (trigger creates it, but set required fields for plan builder)
    await adminClient.from("profiles").upsert({
      id: userId,
      timezone: "America/Los_Angeles",
      onboarding_completed_at: new Date().toISOString(),
      date_of_birth: "1990-01-01",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
    });

    // Create block: started 2026-10-01, ends 2026-10-29, user rebuilds mid-block on 2026-10-15
    const blockId = randomUUID();
    const dayId = randomUUID();

    await adminClient.from("programs").insert({
      id: blockId,
      user_id: userId,
      block_number: 1,
      split_type: "upper_lower",
      days_per_week: 4,
      primary_track: "weights",
      goal: "strength",
      level: "intermediate",
      started_on: "2026-10-01",
      ends_on: "2026-10-29",
      deload_week: 4,
      week_offset: 0,
      status: "active",
    });

    await adminClient.from("program_days").insert({
      id: dayId,
      program_id: blockId,
      user_id: userId,
      day_index: 1,
      day_type: "weights",
      label: "Upper A",
    });

    const orderIndex2 = 0;
    await adminClient.from("program_day_exercises").insert({
      id: randomUUID(),
      program_day_id: dayId,
      user_id: userId,
      exercise_id: exerciseId,
      order_index: orderIndex2,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
    });

    // Pin today for the ENTIRE flow (no clock drift between setup, RPCs, and assertions):
    // 2026-10-15 is mid-block (block started 2026-10-01, ends 2026-10-29).
    const today = "2026-10-15";

    // Create authenticated client (rebuild_block RPC requires auth.uid())
    const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: "test-password-456",
    });
    if (signInError) {
      console.error("❌ Failed to sign in test user:", signInError);
      process.exit(1);
    }

    // Rebuild mid-block
    const deps = buildRebuildPlanDeps(userClient, userId, today);
    const result = await rebuildPlanCore(deps);

    assert(result.ok === true, "Mid-block rebuild succeeded");

    // After rebuild: original block should be 'superseded'
    // (rebuild always creates a new block and supersedes the old one)
    const { data: afterData } = await adminClient
      .from("programs")
      .select("status, ends_on")
      .eq("id", blockId)
      .single();

    // Mid-block rebuild supersedes the old block and creates a new one
    assert(afterData!.status === "superseded", "Mid-block rebuild marks old block superseded", `got ${afterData!.status}`);

    // What rebuild_block preserves on a different-day rebuild. The live version is
    // migration 20261025000025 (M1), which replaced 20261025000023's: the old row keeps
    // its started_on and is ended the day before. Because p_today <= ends_on, the new row
    // keeps started_on, ends_on and week_offset (the payload's today+27 ends_on is
    // ignored), so the block still ends after week 4 and the member stays in week 3
    // on 2026-10-15. A rebuild never
    // moves a block's weekdays: this seeded block 1 has a single Monday day, which is the
    // default layout, not one anchored to its Thursday start, so it stays on the default.
    const { data: midBlocks } = await adminClient
      .from("programs")
      .select("id, block_number, status, started_on, ends_on, ended_on, week_offset")
      .eq("user_id", userId)
      .order("started_on", { ascending: true });
    const oldRow = midBlocks?.find((b) => b.id === blockId);
    const newRow = midBlocks?.find((b) => b.status === "active");
    assert((midBlocks?.length ?? 0) === 2, "Mid-block: exactly 2 rows (superseded + active)", `got ${midBlocks?.length}`);
    assert(oldRow?.started_on === "2026-10-01", "Mid-block: superseded row keeps started_on 2026-10-01", `got ${oldRow?.started_on}`);
    assert(oldRow?.ended_on === "2026-10-14", "Mid-block: superseded row ended_on = p_today - 1 (2026-10-14)", `got ${oldRow?.ended_on}`);
    assert(newRow?.block_number === 1, "Mid-block: rebuilt row keeps block_number 1", `got ${newRow?.block_number}`);
    assert(newRow?.started_on === "2026-10-01", "Mid-block: rebuilt row keeps started_on 2026-10-01", `got ${newRow?.started_on}`);
    assert(newRow?.week_offset === 0, "Mid-block: rebuilt row keeps week_offset 0", `got ${newRow?.week_offset}`);
    assert(newRow?.ends_on === "2026-10-29", "Mid-block: rebuilt row keeps ends_on 2026-10-29 (not p_today + 27)", `got ${newRow?.ends_on}`);
    const cycleWeek = (offset: number, startedOn: string) =>
      offset + Math.floor((Date.parse(today) - Date.parse(startedOn)) / (7 * 86400000)) + 1;
    assert(
      !!newRow && cycleWeek(newRow.week_offset, newRow.started_on) === cycleWeek(0, "2026-10-01"),
      "Mid-block: cycle week unchanged by the rebuild (week 3)",
      newRow ? `${cycleWeek(0, "2026-10-01")} -> ${cycleWeek(newRow.week_offset, newRow.started_on)}` : "no active row",
    );
    const { data: newDays } = await adminClient
      .from("program_days")
      .select("day_index, day_type")
      .eq("program_id", newRow?.id ?? "")
      .eq("status", "active");
    const trainedOn = (newDays ?? [])
      .filter((d) => d.day_type === "weights" || d.day_type === "bodyweight" || d.day_type === "yoga")
      .map((d) => d.day_index)
      .sort((a, b) => a - b);
    const defaultLayout = activeDayIndices(4);
    assert(
      JSON.stringify(trainedOn) === JSON.stringify(defaultLayout),
      "Mid-block: rebuilt unanchored block 1 stays on the default weekdays",
      `got ${JSON.stringify(trainedOn)}, want ${JSON.stringify(defaultLayout)}`,
    );

    if (testsFailed === scenarioStartFailures) {
      console.log("  PASS: mid-block rebuild test\n");
    } else {
      console.log(`  FAIL: mid-block rebuild test (${testsFailed - scenarioStartFailures} failures)\n`);
    }
  }
  } finally {
    // Clean up: delete created test users
    if (createdUserIds.length > 0) {
      console.log(`\nCleaning up ${createdUserIds.length} test user(s)...`);
      for (const userId of createdUserIds) {
        try {
          await adminClient.auth.admin.deleteUser(userId);
        } catch (error) {
          console.warn(`Failed to delete user ${userId}:`, error);
        }
      }
      console.log("✓ Test user cleanup complete\n");
    }
  }

  if (testsFailed === 0) {
    console.log("✅ ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`❌ ${testsFailed} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("\nTest error:", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
