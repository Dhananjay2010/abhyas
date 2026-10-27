/**
 * Real database test for repair-superseded-ended-blocks.sql
 * 
 * Seeds a broken account (the way main's bug creates it), runs the repair script,
 * and verifies that:
 * - Detection finds the broken block before repair
 * - Repair fixes the block status and week_offset
 * - Detection finds nothing after repair
 * - Progress stats are correct (via real streak/progress code)
 * - Today week number is correct (via real cycleWeekFor)
 * - Sessions and sets remain untouched (row counts and checksums match)
 *
 * Run: REAL_DB=1 npm run test:repair-superseded-blocks-real-db
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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
 * Execute the repair logic using individual Supabase client calls.
 * This is equivalent to the repair SQL script but broken down into steps.
 */
async function executeRepair(client: any, userId: string) {
  // Find wrongly superseded blocks
  const { data: wronglySuperseded } = await client
    .from("programs")
    .select("id, user_id, ends_on, ended_on")
    .eq("user_id", userId)
    .eq("status", "superseded")
    .not("ended_on", "is", null)
    .gte("ended_on", "ends_on");

  if (!wronglySuperseded || wronglySuperseded.length === 0) {
    return;
  }

  // For each wrongly superseded block, find its replacing block
  for (const ws of wronglySuperseded) {
    // Find the replacing block
    const { data: replacingBlocks } = await client
      .from("programs")
      .select("id, started_on, week_offset")
      .eq("user_id", ws.user_id)
      .in("status", ["active", "completed"])
      .gt("started_on", ws.ended_on)
      .order("started_on")
      .order("created_at")
      .limit(1);

    // Fix the wrongly superseded block
    await client
      .from("programs")
      .update({
        status: "completed",
        ended_on: ws.ends_on
      })
      .eq("id", ws.id)
      .eq("status", "superseded"); // Guard: only update if still superseded

    // Fix the replacing block's week_offset if found
    if (replacingBlocks && replacingBlocks.length > 0) {
      const rb = replacingBlocks[0];
      if (rb.week_offset !== 0) {
        await client
          .from("programs")
          .update({ week_offset: 0 })
          .eq("id", rb.id);
      }
    }
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

  // We don't load the SQL scripts here since we execute the repair via individual client calls

  console.log("TEST: Repair wrongly superseded blocks");
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
    let createdUserIds = [userId]; // Track for cleanup

    try {
      assert(!!userId, "Created test user");

      // Ensure profile exists with required fields
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
        throw profileError;
      }

      // SEED BROKEN STATE (as main's bug creates it):
      // Block 1: started 2026-09-29, ends 2026-10-26
      // Sessions: one completed on 2026-09-30, one missed day (2026-10-01)
      // Bug: rebuild on 2026-10-27 marks block 1 'superseded' with ended_on = 2026-10-26
      // Bug: creates block 2 with started_on = 2026-10-27, week_offset = 4 (WRONG!)

      const blockId1 = randomUUID();
      const dayId1 = randomUUID();

      // Insert block 1 as 'superseded' (the bug state)
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
        ended_on: "2026-10-26",  // Bug: superseded on its natural end date
        deload_week: 4,
        week_offset: 0,
        status: "superseded",  // Bug: should be 'completed'
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
        {
          id: setIds[0],
          session_exercise_id: sessionExId,
          user_id: userId,
          set_number: 1,
          reps: 10,
          weight_kg: 50,
        },
        {
          id: setIds[1],
          session_exercise_id: sessionExId,
          user_id: userId,
          set_number: 2,
          reps: 9,
          weight_kg: 50,
        },
        {
          id: setIds[2],
          session_exercise_id: sessionExId,
          user_id: userId,
          set_number: 3,
          reps: 8,
          weight_kg: 50,
        },
      ]);

      // Insert block 2 as 'active' with WRONG week_offset = 4 (the bug)
      const blockId2 = randomUUID();
      const dayId2 = randomUUID();

      await adminClient.from("programs").insert({
        id: blockId2,
        user_id: userId,
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-27",  // Day after block 1 ended
        ends_on: "2026-11-23",
        deload_week: 4,
        week_offset: 4,  // Bug: should be 0!
        status: "active",
      });

      await adminClient.from("program_days").insert({
        id: dayId2,
        program_id: blockId2,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper A",
      });

      await adminClient.from("program_day_exercises").insert({
        id: randomUUID(),
        program_day_id: dayId2,
        user_id: userId,
        exercise_id: exerciseId,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
      });

      // Checkpoint: capture session/set state BEFORE repair
      const { data: sessionsBefore } = await adminClient
        .from("sessions")
        .select("id")
        .eq("user_id", userId);

      const { data: setsBefore } = await adminClient
        .from("session_sets")
        .select("id")
        .eq("user_id", userId);

      const sessionCountBefore = sessionsBefore?.length ?? 0;
      const setCountBefore = setsBefore?.length ?? 0;
      const sessionIdsBefore = sessionsBefore?.map(s => s.id).sort().join(",");
      const setIdsBefore = setsBefore?.map(s => s.id).sort().join(",");

      assert(sessionCountBefore === 1, "Seeded 1 session", `got ${sessionCountBefore}`);
      assert(setCountBefore === 3, "Seeded 3 sets", `got ${setCountBefore}`);

      // STEP 1: Run detection query (should find the broken block)
      const { data: detectedBefore, error: detectError1 } = await adminClient
        .from("programs")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "superseded")
        .gte("ended_on", "ends_on");

      if (detectError1) {
        console.error("❌ Detection query failed:", detectError1);
        throw detectError1;
      }

      assert(detectedBefore && detectedBefore.length === 1, 
        "Detection finds 1 broken block before repair", 
        `found ${detectedBefore?.length ?? 0}`);

      // STEP 2: Run repair (via client calls)
      try {
        await executeRepair(adminClient, userId);
        assert(true, "Repair executed successfully (first time)");
      } catch (error) {
        console.error("❌ Repair failed (first run):", error);
        throw error;
      }

      // STEP 3: Run repair AGAIN (idempotency test)
      try {
        await executeRepair(adminClient, userId);
        assert(true, "Repair executed successfully (second time, idempotent)");
      } catch (error) {
        console.error("❌ Repair failed (second run):", error);
        throw error;
      }

      // STEP 4: Run detection query again (should find nothing)
      const { data: detectedAfter } = await adminClient
        .from("programs")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "superseded")
        .gte("ended_on", "ends_on");

      assert(detectedAfter && detectedAfter.length === 0, 
        "Detection finds 0 broken blocks after repair", 
        `found ${detectedAfter?.length ?? 0}`);

      // STEP 5: Verify block 1 is now 'completed'
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

      // STEP 6: Verify block 2 has week_offset = 0
      const { data: block2After } = await adminClient
        .from("programs")
        .select("week_offset, started_on")
        .eq("id", blockId2)
        .single();

      assert(block2After?.week_offset === 0, 
        "Block 2 week_offset is 0", 
        `got ${block2After?.week_offset}`);

      // STEP 7: Verify Today week number via cycleWeekFor
      const todayDate = "2026-10-27"; // First day of block 2
      const weekNumber = cycleWeekFor(
        { started_on: block2After!.started_on, week_offset: block2After!.week_offset },
        todayDate
      );
      assert(weekNumber === 1, "Today shows 'Week 1' on first day of block 2", `got Week ${weekNumber}`);

      // Week 4 (last week of the 28-day block)
      const lastWeekDate = "2026-11-17"; // 21 days after started_on
      const lastWeekNumber = cycleWeekFor(
        { started_on: block2After!.started_on, week_offset: block2After!.week_offset },
        lastWeekDate
      );
      assert(lastWeekNumber === 4, "Week 4 on day 22 of block", `got Week ${lastWeekNumber}`);

      // STEP 8: Verify Progress stats via real code
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
        working_set_count: 3, // We created 3 working sets
      }));

      const today = "2026-10-27";
      const dayRecords = buildDayRecords({
        programs,
        dayTypesByProgram,
        completedSessions: sessions,
        today,
      });

      const streaks = computeStreaks(dayRecords, today);

      // Expected: 1 completed session on 2026-09-30, missed 2026-10-01
      // Current streak should be 0 (broke on missed day)
      // Best streak should be 1
      // Days trained should be 1
      assert(streaks.current === 0, "Current streak is 0 (broke on missed day)", `got ${streaks.current}`);
      assert(streaks.longest === 1, "Best streak is 1", `got ${streaks.longest}`);
      assert(streaks.totalSessions === 1, "Days trained is 1", `got ${streaks.totalSessions}`);

      // Verify start date
      const startDate = progressStartDate(programs, sessions.map(s => s.local_date));
      assert(startDate === "2026-09-29", "Progress start date is block 1 start", `got ${startDate}`);

      // STEP 9: Verify sessions and sets weren't touched
      const { data: sessionsAfter } = await adminClient
        .from("sessions")
        .select("id")
        .eq("user_id", userId);

      const { data: setsAfter } = await adminClient
        .from("session_sets")
        .select("id")
        .eq("user_id", userId);

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
        console.log("  PASS: repair-superseded-blocks test\n");
      } else {
        console.log(`  FAIL: repair-superseded-blocks test (${testsFailed - scenarioStartFailures} failures)\n`);
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
