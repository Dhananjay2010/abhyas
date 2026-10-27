/**
 * Real database test for repair-superseded-ended-blocks.sql
 * 
 * Seeds broken state using the REAL rebuild_block RPC (as main's bug creates it),
 * runs the actual SQL files via psql, and verifies repair with real helpers.
 *
 * Run: REAL_DB=1 npm run test:repair-superseded-blocks-real-db
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { join } from "path";
import type { Database } from "../src/lib/database.types.js";
import { checkRealDbTest } from "./lib-db-reset-guard.js";
import { cycleWeekFor } from "../src/lib/program/block-range.js";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks.js";
import { progressStartDate } from "../src/lib/progress/progress-start-date.js";

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

// Convert Supabase URL to postgres connection string (port 54322 for postgres)
const dbUrl = SUPABASE_URL.replace("http://", "postgresql://postgres:postgres@").replace(":54321", ":54322/postgres");

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

/**
 * Execute SQL file via psql
 * @param filePath Path to SQL file
 * @param tuplesOnly If true, use -tA flags (tuples only, unaligned) for detection queries
 */
function executeSQLFile(filePath: string, tuplesOnly = false): string {
  try {
    const flags = tuplesOnly ? "-tA -v ON_ERROR_STOP=1" : "-v ON_ERROR_STOP=1";
    const result = execSync(
      `psql "${dbUrl}" ${flags} -f "${filePath}"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    return result;
  } catch (error) {
    console.error(`❌ SQL file execution failed: ${filePath}`);
    throw error;
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

  console.log("TEST: Repair wrongly superseded blocks (seeded with real rebuild_block RPC)");
  {
    const scenarioStartFailures = testsFailed;
    
    // Create test user via admin API
    const testEmail = `test-repair-${Date.now()}@example.com`;
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
    const createdUserIds = [userId]; // Track for cleanup

    // Create second test user for mid-block rebuild test
    const testEmail2 = `test-midblock-${Date.now()}@example.com`;
    const { data: authData2, error: createError2 } = await adminClient.auth.admin.createUser({
      email: testEmail2,
      password: "test-password-456",
      email_confirm: true,
    });

    if (createError2 || !authData2.user) {
      console.error("❌ Failed to create second test user:", createError2);
      process.exit(1);
    }

    const userId2 = authData2.user.id;
    createdUserIds.push(userId2);

    try {
      assert(!!userId, "Created test user 1");
      assert(!!userId2, "Created test user 2");

      // === USER 1: Wrongly superseded scenario ===
      
      // Ensure profile exists with required fields
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

      // Create block 1: started 2026-09-29, ends 2026-10-26 (28 days)
      const blockId1 = randomUUID();
      const dayId1 = randomUUID();

      await adminClient.from("programs").insert({
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

      await adminClient.from("program_days").insert({
        id: dayId1,
        program_id: blockId1,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper A",
      });

      await adminClient.from("program_day_exercises").insert({
        id: randomUUID(),
        program_day_id: dayId1,
        user_id: userId,
        exercise_id: exerciseId,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
      });

      // Create completed session on 2026-09-30 with working sets
      const sessionId1 = randomUUID();
      await adminClient.from("sessions").insert({
        id: sessionId1,
        user_id: userId,
        program_id: blockId1,
        program_day_id: dayId1,
        local_date: "2026-09-30",
        status: "completed",
        planned_type: "weights",
        actual_type: "weights",
        week_in_block: 1,
        is_deload: false,
      });

      const sessionExId = randomUUID();
      await adminClient.from("session_exercises").insert({
        id: sessionExId,
        session_id: sessionId1,
        user_id: userId,
        exercise_id: exerciseId,
        order_index: 0,
        status: "completed",
      });

      // Add working sets
      const setIds = [randomUUID(), randomUUID(), randomUUID()];
      await adminClient.from("session_sets").insert([
        { id: setIds[0], session_exercise_id: sessionExId, user_id: userId, set_number: 1, reps: 10, weight_kg: 50 },
        { id: setIds[1], session_exercise_id: sessionExId, user_id: userId, set_number: 2, reps: 9, weight_kg: 50 },
        { id: setIds[2], session_exercise_id: sessionExId, user_id: userId, set_number: 3, reps: 8, weight_kg: 50 },
      ]);

      // Create authenticated client to call rebuild_block RPC (needs auth.uid())
      const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      await userClient.auth.signInWithPassword({
        email: testEmail,
        password: "test-password-123",
      });

      // Call rebuild_block RPC with p_today > ends_on (reproduces main's bug)
      const todayBuggy = "2026-10-27"; // Day after block 1 ended
      const payload1 = {
        id: randomUUID(),
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-23",
        deload_week: 4,
        days: [{
          day_index: 1,
          day_type: "weights",
          focus: null,
          label: "Upper A",
          exercises: [{
            exercise_id: exerciseId,
            order_index: 0,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            rest_seconds: 90,
          }],
        }],
      };

      const { error: rebuildError } = await userClient.rpc("rebuild_block", {
        p_today: todayBuggy,
        p_payload: payload1 as Database["public"]["Functions"]["rebuild_block"]["Args"]["p_payload"],
      });

      if (rebuildError) {
        console.error("❌ rebuild_block RPC failed:", rebuildError);
        throw rebuildError;
      }

      // Assert broken state BEFORE repair
      const { data: block1Before } = await adminClient
        .from("programs")
        .select("status, ended_on, ends_on, week_offset")
        .eq("id", blockId1)
        .single();

      assert(block1Before?.status === "superseded", 
        "Block 1 is 'superseded' (the bug)", 
        `got ${block1Before?.status}`);
      assert(block1Before?.ended_on === "2026-10-26", 
        "Block 1 ended_on = 2026-10-26", 
        `got ${block1Before?.ended_on}`);

      const { data: block2Before } = await adminClient
        .from("programs")
        .select("week_offset, started_on, id")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      assert(block2Before?.week_offset === 4, 
        "Block 2 has wrong week_offset (the bug)", 
        `got ${block2Before?.week_offset}`);

      // Verify Today shows "Week 5" due to bug
      const weekNumberBuggy = cycleWeekFor(
        { started_on: block2Before!.started_on, week_offset: block2Before!.week_offset },
        todayBuggy
      );
      assert(weekNumberBuggy === 5, "Today shows 'Week 5' due to bug", `got Week ${weekNumberBuggy}`);

      // === USER 2: Legitimate mid-block rebuild ===
      
      await adminClient.from("profiles").upsert({
        id: userId2,
        timezone: "America/Los_Angeles",
        onboarding_completed_at: new Date().toISOString(),
        date_of_birth: "1990-01-01",
        goal: "strength",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
      });

      const blockId2 = randomUUID();
      const dayId2 = randomUUID();

      await adminClient.from("programs").insert({
        id: blockId2,
        user_id: userId2,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-01",
        ends_on: "2026-10-28",
        deload_week: 4,
        week_offset: 0,
        status: "active",
      });

      await adminClient.from("program_days").insert({
        id: dayId2,
        program_id: blockId2,
        user_id: userId2,
        day_index: 1,
        day_type: "weights",
        label: "Upper A",
      });

      await adminClient.from("program_day_exercises").insert({
        id: randomUUID(),
        program_day_id: dayId2,
        user_id: userId2,
        exercise_id: exerciseId,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
      });

      // Mid-block rebuild on day 15 (2026-10-15)
      const userClient2 = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      await userClient2.auth.signInWithPassword({
        email: testEmail2,
        password: "test-password-456",
      });

      const payload2 = {
        id: randomUUID(),
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [{
          day_index: 1,
          day_type: "weights",
          focus: null,
          label: "Upper A",
          exercises: [{
            exercise_id: exerciseId,
            order_index: 0,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            rest_seconds: 90,
          }],
        }],
      };

      await userClient2.rpc("rebuild_block", {
        p_today: "2026-10-15",
        p_payload: payload2 as Database["public"]["Functions"]["rebuild_block"]["Args"]["p_payload"],
      });

      const { data: midBlockBefore } = await adminClient
        .from("programs")
        .select("*")
        .eq("id", blockId2)
        .single();

      // Checkpoint: capture session/set state BEFORE repair
      const { data: sessionsBefore } = await adminClient
        .from("sessions")
        .select("id")
        .in("user_id", createdUserIds);

      const { data: setsBefore } = await adminClient
        .from("session_sets")
        .select("id")
        .in("user_id", createdUserIds);

      const sessionCountBefore = sessionsBefore?.length ?? 0;
      const setCountBefore = setsBefore?.length ?? 0;
      const sessionIdsBefore = sessionsBefore?.map(s => s.id).sort().join(",");
      const setIdsBefore = setsBefore?.map(s => s.id).sort().join(",");

      // Run detection SQL (should find user 1's broken block)
      console.log("\n  Running detection SQL (before repair)...");
      const detectPath = join(process.cwd(), "scripts/sql/detect-superseded-ended-blocks.sql");
      const detectOutputBefore = executeSQLFile(detectPath, true);
      assert(detectOutputBefore.includes(blockId1), 
        "Detection finds user 1's broken block", 
        `output does not contain ${blockId1}`);
      assert(!detectOutputBefore.includes(blockId2), 
        "Detection does NOT find user 2's legitimate mid-block rebuild", 
        `output should not contain ${blockId2}`);

      // Run repair SQL (first time)
      console.log("\n  Running repair SQL (first time)...");
      const repairPath = join(process.cwd(), "scripts/sql/repair-superseded-ended-blocks.sql");
      executeSQLFile(repairPath, false);
      assert(true, "Repair SQL executed successfully (first time)");

      // Snapshot all programs for both users after first repair
      const { data: programsAfterFirstRepair } = await adminClient
        .from("programs")
        .select("*")
        .in("user_id", [userId, userId2])
        .order("id");

      // Run repair SQL (second time, idempotency test)
      console.log("\n  Running repair SQL (second time, idempotency)...");
      executeSQLFile(repairPath, false);
      assert(true, "Repair SQL executed successfully (second time, idempotent)");

      // Snapshot all programs after second repair
      const { data: programsAfterSecondRepair } = await adminClient
        .from("programs")
        .select("*")
        .in("user_id", [userId, userId2])
        .order("id");

      // Assert second repair was a no-op (byte-identical)
      assert(JSON.stringify(programsAfterFirstRepair) === JSON.stringify(programsAfterSecondRepair),
        "Second repair run is a no-op (programs unchanged)");

      // Run detection SQL again (should find nothing)
      console.log("\n  Running detection SQL (after repair)...");
      const detectOutputAfter = executeSQLFile(detectPath, true);
      assert(!detectOutputAfter.includes(blockId1), 
        "Detection does NOT find user 1's block after repair", 
        `output should not contain ${blockId1}`);
      assert(!detectOutputAfter.includes(blockId2), 
        "Detection does NOT find user 2's block after repair", 
        `output should not contain ${blockId2}`);

      // Verify user 1: block 1 is now 'completed'
      const { data: block1After } = await adminClient
        .from("programs")
        .select("status, ended_on, ends_on")
        .eq("id", blockId1)
        .single();

      assert(block1After?.status === "completed", 
        "Block 1 status is 'completed'", 
        `got ${block1After?.status}`);
      assert(block1After?.ended_on === block1After?.ends_on, 
        "Block 1 ended_on = ends_on", 
        `ended_on=${block1After?.ended_on}, ends_on=${block1After?.ends_on}`);

      // Verify user 1: block 2 has week_offset = 0
      const { data: block2After } = await adminClient
        .from("programs")
        .select("week_offset, started_on")
        .eq("id", block2Before!.id)
        .single();

      assert(block2After?.week_offset === 0, 
        "Block 2 week_offset is 0", 
        `got ${block2After?.week_offset}`);

      // Verify Today week number fixed
      const weekNumber1 = cycleWeekFor(
        { started_on: block2After!.started_on, week_offset: block2After!.week_offset },
        todayBuggy
      );
      assert(weekNumber1 === 1, "Today shows 'Week 1' on first day", `got Week ${weekNumber1}`);

      const lastWeekDate = "2026-11-17";
      const weekNumber4 = cycleWeekFor(
        { started_on: block2After!.started_on, week_offset: block2After!.week_offset },
        lastWeekDate
      );
      assert(weekNumber4 === 4, "Today shows 'Week 4' on day 22", `got Week ${weekNumber4}`);

      // Verify user 2: mid-block rebuild block is UNCHANGED
      const { data: midBlockAfter } = await adminClient
        .from("programs")
        .select("*")
        .eq("id", blockId2)
        .single();

      assert(JSON.stringify(midBlockBefore) === JSON.stringify(midBlockAfter),
        "Mid-block rebuild block unchanged (byte-identical)");

      // Verify Progress stats for user 1 via real code
      const { data: allPrograms } = await adminClient
        .from("programs")
        .select("id, started_on, ends_on, ended_on, created_at")
        .eq("user_id", userId)
        .neq("status", "superseded")
        .order("started_on")
        .order("created_at");

      const { data: programDays } = await adminClient
        .from("program_days")
        .select("program_id, day_index, day_type")
        .eq("user_id", userId)
        .eq("status", "active");

      const { data: completedSessions } = await adminClient
        .from("sessions")
        .select("local_date, actual_type, status")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("local_date");

      type DayType = Database["public"]["Enums"]["day_type"];
      const dayTypesByProgram: Record<string, Record<number, DayType>> = {};
      for (const d of programDays ?? []) {
        (dayTypesByProgram[d.program_id] ??= {})[d.day_index] = d.day_type;
      }

      const programs = (allPrograms ?? []).map(p => ({
        id: p.id,
        startedOn: p.started_on,
        endsOn: p.ends_on,
        endedOn: p.ended_on,
      }));

      const sessions = (completedSessions ?? []).map(s => ({
        local_date: s.local_date,
        actual_type: s.actual_type,
        status: s.status,
        working_set_count: 3,
      }));

      const today = todayBuggy;
      const dayRecords = buildDayRecords({
        programs,
        dayTypesByProgram,
        completedSessions: sessions,
        today,
      });

      const streaks = computeStreaks(dayRecords, today);

      assert(streaks.current === 0, "Current streak is 0 (broke on missed day)", `got ${streaks.current}`);
      assert(streaks.longest === 1, "Best streak is 1", `got ${streaks.longest}`);
      assert(streaks.totalSessions === 1, "Days trained is 1", `got ${streaks.totalSessions}`);

      const startDate = progressStartDate({
        programs,
        completedSessions: sessions
      });
      assert(startDate === "2026-09-29", "Progress start date is block 1 start", `got ${startDate}`);

      // Verify sessions and sets weren't touched
      const { data: sessionsAfter } = await adminClient
        .from("sessions")
        .select("id")
        .in("user_id", createdUserIds);

      const { data: setsAfter } = await adminClient
        .from("session_sets")
        .select("id")
        .in("user_id", createdUserIds);

      const sessionCountAfter = sessionsAfter?.length ?? 0;
      const setCountAfter = setsAfter?.length ?? 0;
      const sessionIdsAfter = sessionsAfter?.map(s => s.id).sort().join(",");
      const setIdsAfter = setsAfter?.map(s => s.id).sort().join(",");

      assert(sessionCountAfter === sessionCountBefore, 
        "Session count unchanged", 
        `before=${sessionCountBefore}, after=${sessionCountAfter}`);
      assert(setCountAfter === setCountBefore, 
        "Set count unchanged", 
        `before=${setCountBefore}, after=${setCountAfter}`);
      assert(sessionIdsAfter === sessionIdsBefore, 
        "Session IDs unchanged (checksum match)");
      assert(setIdsAfter === setIdsBefore, 
        "Set IDs unchanged (checksum match)");

      if (testsFailed === scenarioStartFailures) {
        console.log("\n  PASS: repair-superseded-blocks test\n");
      } else {
        console.log(`\n  FAIL: repair-superseded-blocks test (${testsFailed - scenarioStartFailures} failures)\n`);
      }

    } finally {
      // Clean up test users
      for (const uid of createdUserIds) {
        await adminClient.auth.admin.deleteUser(uid);
      }
      console.log(`✓ Cleaned up ${createdUserIds.length} test user(s)\n`);
    }
  }

  if (testsFailed === 0) {
    console.log("\n✅ ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${testsFailed} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("\n❌ Test runner failed:", error);
  process.exit(1);
});
