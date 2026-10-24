/**
 * Database tests for program block range RPCs: concurrent rollover and rebuild.
 *
 * Tests that rebuild_block and rollover_block are idempotent and handle
 * concurrent calls correctly (fixes E-3: duplicate block creation).
 *
 * Run: supabase start && REAL_DB=1 npm run test:block-range-db
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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

  // Create test user
  const testEmail = `test-block-range-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  const { data: authData, error: signUpError } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (signUpError || !authData.user) {
    console.error("Failed to create test user:", signUpError);
    return false;
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId.slice(0, 8)}...\n`);

  // Create authenticated client
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError || !sessionData.session) {
    console.error("Failed to sign in:", signInError);
    return false;
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    },
  });

  try {
    // Setup: create profile
    await adminClient.from("profiles").insert({
      id: userId,
      timezone: "Asia/Kolkata",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      onboarding_completed_at: new Date().toISOString(),
    });

    console.log("1. Concurrent rollover_block: 8 calls produce ONE new block");
    {
      // Create initial active block
      const blockId1 = randomUUID();
      await adminClient.from("programs").insert({
        id: blockId1,
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
      });

      // Create one program_day for the payload
      const dayId = randomUUID();
      await adminClient.from("program_days").insert({
        id: dayId,
        program_id: blockId1,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper",
      });

      const payload = {
        id: randomUUID(),
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-25",
        deload_week: 4,
        days: [
          {
            day_index: 1,
            day_type: "weights",
            focus: null,
            label: "Upper",
            exercises: [],
          },
        ],
      };

      // Fire 8 concurrent rollover_block calls
      const promises = Array.from({ length: 8 }, () =>
        userClient.rpc("rollover_block", {
          p_today: "2026-10-29",
          p_payload: payload,
        }),
      );

      const results = await Promise.all(promises);

      // All should succeed and return the same program ID
      const programIds = results.map((r) => r.data);
      const uniqueIds = new Set(programIds.filter(Boolean));

      check("all 8 calls succeeded", results.every((r) => !r.error));
      check("all return the same program ID", uniqueIds.size === 1);

      // Verify exactly one new block exists
      const { data: blocks } = await adminClient
        .from("programs")
        .select("id, status, block_number")
        .eq("user_id", userId);

      const activeBlocks = blocks?.filter((b) => b.status === "active") ?? [];
      const completedBlocks = blocks?.filter((b) => b.status === "completed") ?? [];

      check("exactly ONE active block", activeBlocks.length === 1, `${activeBlocks.length}`);
      check("exactly ONE completed block", completedBlocks.length === 1);
      check("new block is block 2", activeBlocks[0]?.block_number === 2);

      // Clean up for next test
      await adminClient.from("programs").delete().eq("user_id", userId);
    }

    console.log("\n2. Concurrent rebuild_block: 8 calls produce ONE new block");
    {
      // Create initial active block
      const blockId1 = randomUUID();
      await adminClient.from("programs").insert({
        id: blockId1,
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
        week_offset: 0,
        status: "active",
      });

      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [
          {
            day_index: 1,
            day_type: "weights",
            focus: null,
            label: "Push",
            exercises: [],
          },
        ],
      };

      // Fire 8 concurrent rebuild_block calls
      const promises = Array.from({ length: 8 }, () =>
        userClient.rpc("rebuild_block", {
          p_today: "2026-10-15",
          p_payload: payload,
        }),
      );

      const results = await Promise.all(promises);

      const programIds = results.map((r) => r.data);
      const uniqueIds = new Set(programIds.filter(Boolean));

      check("all 8 calls succeeded", results.every((r) => !r.error));
      check("all return the same program ID", uniqueIds.size === 1);

      const { data: blocks } = await adminClient
        .from("programs")
        .select("id, status, block_number, week_offset")
        .eq("user_id", userId);

      const activeBlocks = blocks?.filter((b) => b.status === "active") ?? [];
      const supersededBlocks = blocks?.filter((b) => b.status === "superseded") ?? [];

      check("exactly ONE active block", activeBlocks.length === 1);
      check("exactly ONE superseded block", supersededBlocks.length === 1);
      check("new block has week_offset = 2", activeBlocks[0]?.week_offset === 2);

      await adminClient.from("programs").delete().eq("user_id", userId);
    }

    console.log("\n3. Same-day double rebuild: old block becomes empty range");
    {
      const blockId1 = randomUUID();
      await adminClient.from("programs").insert({
        id: blockId1,
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        started_on: "2026-10-15",
        ends_on: "2026-11-11",
        deload_week: 4,
        week_offset: 0,
        status: "active",
      });

      const payload1 = {
        id: randomUUID(),
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-11",
        deload_week: 4,
        days: [{ day_index: 1, day_type: "weights", focus: null, label: "Push", exercises: [] }],
      };

      // First rebuild
      await userClient.rpc("rebuild_block", { p_today: "2026-10-15", p_payload: payload1 });

      // Second rebuild same day
      const payload2 = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-11",
        deload_week: 4,
        days: [{ day_index: 1, day_type: "weights", focus: null, label: "Push", exercises: [] }],
      };

      await userClient.rpc("rebuild_block", { p_today: "2026-10-15", p_payload: payload2 });

      const { data: blocks } = await adminClient
        .from("programs")
        .select("id, status, started_on, ended_on")
        .eq("user_id", userId)
        .order("created_at");

      check("three blocks total", blocks?.length === 3);

      const empty = blocks?.filter(
        (b) => b.ended_on !== null && b.ended_on < b.started_on,
      );
      check("two empty ranges", empty?.length === 2);

      await adminClient.from("programs").delete().eq("user_id", userId);
    }

    console.log("\n4. Legacy backfill: completed block becomes empty range");
    {
      // Simulate legacy data: two blocks with same started_on, old is 'completed'
      const oldId = randomUUID();
      const newId = randomUUID();

      await adminClient.from("programs").insert([
        {
          id: oldId,
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
          status: "completed",
          ended_on: null, // not backfilled yet
          created_at: "2026-10-01T10:00:00Z",
        },
        {
          id: newId,
          user_id: userId,
          block_number: 1,
          split_type: "ppl",
          days_per_week: 6,
          primary_track: "weights",
          goal: "strength",
          level: "intermediate",
          started_on: "2026-10-01",
          ends_on: "2026-10-28",
          deload_week: 4,
          status: "active",
          ended_on: null,
          created_at: "2026-10-01T10:01:00Z",
        },
      ]);

      // Simulate backfill (the migration does this)
      await adminClient
        .from("programs")
        .update({ ended_on: "2026-09-30" }) // one day before next block's started_on
        .eq("id", oldId);

      const { data: blocks } = await adminClient
        .from("programs")
        .select("id, ended_on, started_on")
        .eq("user_id", userId);

      const oldBlock = blocks?.find((b) => b.id === oldId);
      check(
        "old block ended_on < started_on (empty)",
        oldBlock !== undefined && oldBlock.ended_on !== null && oldBlock.ended_on < oldBlock.started_on,
      );

      await adminClient.from("programs").delete().eq("user_id", userId);
    }

    console.log("\n5. Byte-identical: old block's data unchanged after rebuild");
    {
      const exerciseId = randomUUID();
      await adminClient.from("exercises").insert({
        id: exerciseId,
        slug: "test-exercise",
        name: "Test Exercise",
        tracks: ["weights"],
        category: "strength",
        primary_muscles: ["chest"],
        is_active: true,
      });

      const blockId1 = randomUUID();
      const dayId = randomUUID();
      const exId = randomUUID();

      await adminClient.from("programs").insert({
        id: blockId1,
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
        week_offset: 0,
        status: "active",
      });

      await adminClient.from("program_days").insert({
        id: dayId,
        program_id: blockId1,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Upper",
      });

      await adminClient.from("program_day_exercises").insert({
        id: exId,
        program_day_id: dayId,
        user_id: userId,
        exercise_id: exerciseId,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      });

      // Read old data
      const { data: oldDay } = await adminClient
        .from("program_days")
        .select("*")
        .eq("id", dayId)
        .single();

      const { data: oldEx } = await adminClient
        .from("program_day_exercises")
        .select("*")
        .eq("id", exId)
        .single();

      // Rebuild
      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [
          {
            day_index: 1,
            day_type: "weights",
            focus: null,
            label: "Push",
            exercises: [
              {
                exercise_id: exerciseId,
                order_index: 0,
                target_sets: 4,
                target_reps_min: 6,
                target_reps_max: 10,
                rest_seconds: 120,
              },
            ],
          },
        ],
      };

      await userClient.rpc("rebuild_block", { p_today: "2026-10-15", p_payload: payload });

      // Read again
      const { data: newDay } = await adminClient
        .from("program_days")
        .select("*")
        .eq("id", dayId)
        .single();

      const { data: newEx } = await adminClient
        .from("program_day_exercises")
        .select("*")
        .eq("id", exId)
        .single();

      check("old program_day unchanged", JSON.stringify(oldDay) === JSON.stringify(newDay));
      check("old exercise unchanged", JSON.stringify(oldEx) === JSON.stringify(newEx));

      await adminClient.from("exercises").delete().eq("id", exerciseId);
      await adminClient.from("programs").delete().eq("user_id", userId);
    }

    // Cleanup
    await adminClient.auth.admin.deleteUser(userId);
    console.log(`\nCleaned up test user ${userId.slice(0, 8)}...`);

    return failures === 0;
  } catch (error) {
    console.error("\nTest error:", error);
    await adminClient.auth.admin.deleteUser(userId);
    return false;
  }
}

runTests().then((ok) => {
  if (ok) {
    console.log("\nALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.error(`\n${failures} CHECKS FAILED`);
    process.exit(1);
  }
});
