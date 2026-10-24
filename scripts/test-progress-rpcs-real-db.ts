/**
 * Real database tests for progress aggregates RPCs.
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify:
 * - progress_summary returns correct aggregates for 250+ session user
 * - get_session_set_counts returns working set counts
 * - get_history_count returns correct filtered counts
 * - RLS: users cannot see other users' data
 * - Security: anon role cannot execute functions
 * - Date handling: p_today works correctly near midnight in IST
 * 
 * Run: supabase start && REAL_DB=1 npm run test:progress-rpcs-real-db
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

  // Verify service role key
  try {
    const payload = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64').toString());
    if (payload.role !== 'service_role') {
      console.error(`❌ Expected service_role key, got role: ${payload.role}`);
      return false;
    }
    console.log(`✓ Using service_role key\n`);
  } catch (e) {
    console.error("❌ Failed to decode service role key");
    return false;
  }

  // Create test users using admin API
  const testEmailA = `test-progress-a-${Date.now()}@example.com`;
  const testPasswordA = "test-password-123";
  const testEmailB = `test-progress-b-${Date.now()}@example.com`;
  const testPasswordB = "test-password-456";

  let userIdA: string | null = null;
  let userIdB: string | null = null;

  try {
    const { data: authDataA, error: signUpErrorA } = await adminClient.auth.admin.createUser({
      email: testEmailA,
      password: testPasswordA,
      email_confirm: true,
    });

    if (signUpErrorA || !authDataA.user) {
      console.error("Failed to create test user A:", signUpErrorA);
      return false;
    }

    userIdA = authDataA.user.id;

    const { data: authDataB, error: signUpErrorB } = await adminClient.auth.admin.createUser({
      email: testEmailB,
      password: testPasswordB,
      email_confirm: true,
    });

    if (signUpErrorB || !authDataB.user) {
      console.error("Failed to create test user B:", signUpErrorB);
      return false;
    }

    userIdB = authDataB.user.id;
    console.log(`Created test users: A=${userIdA.slice(0, 8)}... B=${userIdB.slice(0, 8)}...\n`);

    // Create authenticated clients
    const anonClientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInErrorA } = await anonClientA.auth.signInWithPassword({
      email: testEmailA,
      password: testPasswordA,
    });

    if (signInErrorA) {
      console.error("Failed to sign in user A:", signInErrorA);
      return false;
    }

    const anonClientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInErrorB } = await anonClientB.auth.signInWithPassword({
      email: testEmailB,
      password: testPasswordB,
    });

    if (signInErrorB) {
      console.error("Failed to sign in user B:", signInErrorB);
      return false;
    }

    const supabaseA = anonClientA;
    const supabaseB = anonClientB;

    // Fetch seeded exercises
    const { data: exercises, error: exError } = await adminClient
      .from("exercises")
      .select("id, name")
      .order("id")
      .limit(5);

    if (exError || !exercises || exercises.length < 5) {
      console.error("Failed to fetch seeded exercises:", exError);
      return false;
    }

    const exerciseA = exercises[0].id;

    console.log("1. progress_summary with 250+ sessions");
    {
      // Create 260 sessions with known volume
      const sessions = [];
      const sessionExercises = [];
      const sets = [];
      const startDate = new Date("2025-01-01T12:00:00Z");
      let totalVolume = 0;

      for (let i = 0; i < 260; i++) {
        const sessionId = randomUUID();
        const seId = randomUUID();
        
        const sessionDate = new Date(startDate);
        sessionDate.setDate(startDate.getDate() + i);
        const isoDate = sessionDate.toISOString();
        const localDate = isoDate.split("T")[0];
        
        sessions.push({
          id: sessionId,
          user_id: userIdA,
          local_date: localDate,
          status: "completed",
          actual_type: "weights",
          completed_at: isoDate,
        });

        sessionExercises.push({
          id: seId,
          user_id: userIdA,
          session_id: sessionId,
          exercise_id: exerciseA,
          metric: "reps",
          status: "completed",
          order_index: 0,
        });

        // Each session: 3 sets of 5 reps at 100kg = 1500kg volume
        for (let setNum = 1; setNum <= 3; setNum++) {
          sets.push({
            user_id: userIdA,
            session_exercise_id: seId,
            set_number: setNum,
            reps: 5,
            weight_kg: 100,
            is_warmup_set: false,
          });
          totalVolume += 500; // 5 * 100
        }
      }

      // Insert in batches
      for (let i = 0; i < sessions.length; i += 100) {
        await adminClient.from("sessions").insert(sessions.slice(i, i + 100));
        await adminClient.from("session_exercises").insert(sessionExercises.slice(i, i + 100));
        // Each batch of 100 sessions has 300 sets (3 per session)
        await adminClient.from("session_sets").insert(sets.slice(i * 3, (i + 100) * 3));
      }

      // Call progress_summary RPC
      const { data: progressData, error: progressError } = await supabaseA.rpc("progress_summary", {
        p_user: userIdA,
      });

      check("progress_summary succeeds for 260-session user", !progressError, 
        progressError ? `error: ${progressError.message}` : "");
      check("days_trained = 260", progressData?.days_trained === 260,
        `got ${progressData?.days_trained}`);
      check("local_dates array has 260 entries", progressData?.local_dates?.length === 260,
        `got ${progressData?.local_dates?.length}`);
      check("total_volume_kg = 390000 (260 sessions × 1500kg)", 
        Number(progressData?.total_volume_kg) === totalVolume,
        `got ${Number(progressData?.total_volume_kg)}, expected ${totalVolume}`);
      check("session_count = 260", progressData?.session_count === 260,
        `got ${progressData?.session_count}`);
    }

    console.log("\n2. get_session_set_counts with multiple sessions");
    {
      // Get first 5 session IDs from user A
      const { data: userSessions } = await adminClient
        .from("sessions")
        .select("id")
        .eq("user_id", userIdA)
        .limit(5);

      const sessionIds = (userSessions ?? []).map(s => s.id);

      const { data: setCountsData, error: setCountsError } = await supabaseA.rpc("get_session_set_counts", {
        p_user: userIdA,
        p_session_ids: sessionIds,
      });

      check("get_session_set_counts succeeds", !setCountsError,
        setCountsError ? `error: ${setCountsError.message}` : "");
      check("returns 5 rows", setCountsData?.length === 5,
        `got ${setCountsData?.length}`);
      check("each session has 3 sets", setCountsData?.every((r: { session_id: string; set_count: number }) => Number(r.set_count) === 3),
        `got ${setCountsData?.map((r: { session_id: string; set_count: number }) => r.set_count).join(", ")}`);
    }

    console.log("\n3. get_history_count with date filtering and yoga sessions");
    {
      // Add two yoga sessions for user A:
      // 1. Normal yoga session with completed_at
      const yogaSessionId1 = randomUUID();
      await adminClient.from("sessions").insert({
        id: yogaSessionId1,
        user_id: userIdA,
        local_date: "2026-10-24",
        status: "completed",
        actual_type: "yoga",
        completed_at: "2026-10-24T12:00:00Z",
        duration_seconds: 600,
      });

      // 2. Completed yoga session with 0 sets, NULL started_at, and duration
      // This tests the QA issue: completed yoga should NOT show as "Skipped"
      const yogaSessionId2 = randomUUID();
      await adminClient.from("sessions").insert({
        id: yogaSessionId2,
        user_id: userIdA,
        local_date: "2026-10-23",
        status: "completed",
        actual_type: "yoga",
        duration_seconds: 360,
        started_at: null,
        completed_at: "2026-10-23T14:30:00Z",
      });

      // Count lifts (should be 260)
      const { data: liftsCount, error: liftsError } = await supabaseA.rpc("get_history_count", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24", // ISO date string
      });

      check("get_history_count succeeds for lifts", !liftsError,
        liftsError ? `error: ${liftsError.message}` : "");
      check("lifts count = 260", liftsCount === 260,
        `got ${liftsCount}`);

      // Count yoga (should be 2 now)
      const { data: yogaCount } = await supabaseA.rpc("get_history_count", {
        p_user: userIdA,
        p_filter: "yoga",
        p_today: "2026-10-24",
      });

      check("yoga count = 2 (includes 0-set completed yoga)", yogaCount === 2,
        `got ${yogaCount}`);

      // Verify the 0-set yoga session can be fetched in history query
      const { data: yogaSessions, error: yogaFetchError } = await supabaseA
        .from("sessions")
        .select("id, local_date, status, actual_type, duration_seconds")
        .eq("user_id", userIdA)
        .eq("actual_type", "yoga")
        .lte("local_date", "2026-10-24")
        .or(`status.eq.completed,and(status.eq.in_progress,local_date.eq.2026-10-24)`)
        .order("local_date", { ascending: false });

      check("yoga history query succeeds", !yogaFetchError,
        yogaFetchError ? `error: ${yogaFetchError.message}` : "");
      check("fetched 2 yoga sessions", yogaSessions?.length === 2,
        `got ${yogaSessions?.length}`);
      
      type SessionRecord = { id: string; status: string; local_date: string; actual_type: string | null; duration_seconds: number | null };
      const zeroSetYoga = yogaSessions?.find((s: SessionRecord) => s.id === yogaSessionId2);
      check("0-set completed yoga session is in results", 
        zeroSetYoga?.status === "completed",
        `found session with status=${zeroSetYoga?.status}`);

      // Test date filtering: count only up to 2025-06-30 (first ~180 days)
      const { data: dateFilteredCount } = await supabaseA.rpc("get_history_count", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2025-06-30",
      });

      check("date filtering works (≤ 181 sessions before 2025-07-01)", 
        dateFilteredCount !== null && dateFilteredCount <= 181,
        `got ${dateFilteredCount}`);
    }

    console.log("\n4. Date handling near midnight IST");
    {
      // Test with a date-typed parameter (PostgREST accepts ISO date strings)
      const istDate = "2026-10-24"; // Late evening IST = early morning UTC
      
      const { data: countNearMidnight, error: midnightError } = await supabaseA.rpc("get_history_count", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: istDate,
      });

      check("date parameter works near IST midnight", !midnightError,
        midnightError ? `error: ${midnightError.message}` : "");
      check("returns a count", countNearMidnight !== null && countNearMidnight >= 0,
        `got ${countNearMidnight}`);
    }

    console.log("\n5. RLS: user B cannot see user A's data");
    {
      // User B calling progress_summary for user A should return empty/zero data
      const { data: crossUserData, error: crossUserError } = await supabaseB.rpc("progress_summary", {
        p_user: userIdA, // User B trying to access user A's data
      });

      // RLS should filter it: either error or zero results
      const hasNoData = !crossUserError && (
        crossUserData?.session_count === 0 ||
        crossUserData?.days_trained === 0
      );

      check("user B cannot see user A's progress data via RPC", hasNoData,
        `got session_count=${crossUserData?.session_count}, days_trained=${crossUserData?.days_trained}`);

      // User B calling get_session_set_counts with user A's sessions
      const { data: userASessions } = await adminClient
        .from("sessions")
        .select("id")
        .eq("user_id", userIdA)
        .limit(5);

      const sessionIds = (userASessions ?? []).map(s => s.id);
      const { data: crossSetCounts } = await supabaseB.rpc("get_session_set_counts", {
        p_user: userIdA,
        p_session_ids: sessionIds,
      });

      check("user B cannot see user A's set counts", 
        !crossSetCounts || crossSetCounts.length === 0,
        `got ${crossSetCounts?.length} rows`);
    }

    console.log("\n6. Security: anon role cannot execute functions");
    {
      // Create anon-only client (no authentication)
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      const { error: anonProgressError } = await anonClient.rpc("progress_summary", {
        p_user: userIdA,
      });

      check("anon role denied progress_summary", 
        anonProgressError !== null && (
          anonProgressError.message.includes("permission denied") ||
          anonProgressError.message.includes("not authenticated") ||
          anonProgressError.message.includes("User not authenticated")
        ),
        `error: ${anonProgressError?.message}`);

      const { error: anonCountError } = await anonClient.rpc("get_history_count", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
      });

      check("anon role denied get_history_count",
        anonCountError !== null && (
          anonCountError.message.includes("permission denied") ||
          anonCountError.message.includes("not authenticated") ||
          anonCountError.message.includes("User not authenticated")
        ),
        `error: ${anonCountError?.message}`);
    }

    if (failures > 0) {
      console.log(`\n❌ ${failures} FAILURES\n`);
      return false;
    }

    console.log("\n✅ All progress RPC tests passed\n");
    return true;

  } finally {
    // Cleanup test users
    console.log("\nCleaning up test users...");
    try {
      if (userIdA) await adminClient.auth.admin.deleteUser(userIdA);
      if (userIdB) await adminClient.auth.admin.deleteUser(userIdB);
      console.log("✓ Test users deleted\n");
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
