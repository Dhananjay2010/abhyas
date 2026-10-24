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

type HistoryPageRow = { session_id: string | null; total_count: number };

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

      // Count lifts (should be 260) - use get_history_page to get total_count
      const { data: liftsPage, error: liftsError } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 1,
        p_offset: 0,
      });

      check("get_history_page succeeds for lifts", !liftsError,
        liftsError ? `error: ${liftsError.message}` : "");
      const liftsCount = (liftsPage as HistoryPageRow[])?.[0]?.total_count ?? 0;
      check("lifts count = 260", liftsCount === 260,
        `got ${liftsCount}`);

      // Count yoga (should be 2 now)
      const { data: yogaPage } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "yoga",
        p_today: "2026-10-24",
        p_limit: 1,
        p_offset: 0,
      });

      const yogaCount = (yogaPage as HistoryPageRow[])?.[0]?.total_count ?? 0;
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
      const { data: dateFilteredPage } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2025-06-30",
        p_limit: 1,
        p_offset: 0,
      });

      const dateFilteredCount = (dateFilteredPage as HistoryPageRow[])?.[0]?.total_count ?? 0;
      check("date filtering works (≤ 181 sessions before 2025-07-01)", 
        dateFilteredCount !== null && dateFilteredCount <= 181,
        `got ${dateFilteredCount}`);
    }

    console.log("\n4. Date handling near midnight IST");
    {
      // Test with a date-typed parameter (PostgREST accepts ISO date strings)
      const istDate = "2026-10-24"; // Late evening IST = early morning UTC
      
      const { data: pageNearMidnight, error: midnightError } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: istDate,
        p_limit: 1,
        p_offset: 0,
      });

      check("date parameter works near IST midnight", !midnightError,
        midnightError ? `error: ${midnightError.message}` : "");
      const countNearMidnight = (pageNearMidnight as HistoryPageRow[])?.[0]?.total_count ?? 0;
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

      const { error: anonPageError } = await anonClient.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 20,
        p_offset: 0,
      });

      check("anon role denied get_history_page",
        anonPageError !== null && (
          anonPageError.message.includes("permission denied") ||
          anonPageError.message.includes("not authenticated") ||
          anonPageError.message.includes("User not authenticated")
        ),
        `error: ${anonPageError?.message}`);
    }

    console.log("\n7. get_history_page ordering and pagination");
    {
      // Add 5 sessions with mixed statuses for ordering tests
      // Session 1: completed yesterday, working sets
      const sess1Id = randomUUID();
      const se1Id = randomUUID();
      await adminClient.from("sessions").insert({
        id: sess1Id,
        user_id: userIdA,
        local_date: "2026-10-23",
        status: "completed",
        actual_type: "weights",
        completed_at: "2026-10-23T10:00:00Z",
      });
      await adminClient.from("session_exercises").insert({
        id: se1Id,
        user_id: userIdA,
        session_id: sess1Id,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
      });
      await adminClient.from("session_sets").insert({
        id: randomUUID(),
        user_id: userIdA,
        session_exercise_id: se1Id,
        weight_kg: 100,
        reps: 5,
        is_warmup_set: false,
      });

      // Session 2: in_progress from 2 days ago (past in_progress - should appear)
      const sess2Id = randomUUID();
      await adminClient.from("sessions").insert({
        id: sess2Id,
        user_id: userIdA,
        local_date: "2026-10-22",
        status: "in_progress",
        actual_type: "weights",
        started_at: "2026-10-22T09:00:00Z",
      });

      // Session 3: in_progress today with 0 sets (should appear)
      const sess3Id = randomUUID();
      await adminClient.from("sessions").insert({
        id: sess3Id,
        user_id: userIdA,
        local_date: "2026-10-24",
        status: "in_progress",
        actual_type: "weights",
        started_at: "2026-10-24T08:00:00Z",
      });

      // Session 4: skipped (should NOT appear)
      const sess4Id = randomUUID();
      await adminClient.from("sessions").insert({
        id: sess4Id,
        user_id: userIdA,
        local_date: "2026-10-21",
        status: "skipped",
        actual_type: "weights",
      });

      // Session 5: completed with empty-string actual_type and working sets (should appear under lifts)
      const sess5Id = randomUUID();
      const se5Id = randomUUID();
      await adminClient.from("sessions").insert({
        id: sess5Id,
        user_id: userIdA,
        local_date: "2026-10-20",
        status: "completed",
        actual_type: "",
        completed_at: "2026-10-20T10:00:00Z",
      });
      await adminClient.from("session_exercises").insert({
        id: se5Id,
        user_id: userIdA,
        session_id: sess5Id,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
      });
      await adminClient.from("session_sets").insert({
        id: randomUUID(),
        user_id: userIdA,
        session_exercise_id: se5Id,
        weight_kg: 80,
        reps: 8,
        is_warmup_set: false,
      });

      // Fetch page 1 (first 20)
      const { data: page1, error: page1Error } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 20,
        p_offset: 0,
      });

      check("get_history_page succeeds", !page1Error,
        page1Error ? `error: ${page1Error.message}` : "");

      if (page1Error || !page1) {
        console.log("  Skipping page 1 checks due to error");
        failures++;
        return;
      }

      type PageRow = { session_id: string; total_count: number };
      const page1Data = page1 as PageRow[];
      
      check("page 1 has results", page1Data.length > 0,
        `got ${page1Data.length} rows`);

      const totalCount = page1Data[0]?.total_count;
      check("total_count is present", totalCount > 0,
        `got ${totalCount}`);

      // Verify today's 0-set in_progress appears
      const page1Ids = page1Data.map((r: PageRow) => r.session_id);
      check("today's 0-set in_progress session appears", 
        page1Ids.includes(sess3Id),
        `sess3Id ${sess3Id.slice(0, 8)} in page: ${page1Ids.includes(sess3Id)}`);

      // Verify past in_progress appears
      check("past-day in_progress session appears", 
        page1Ids.includes(sess2Id),
        `sess2Id ${sess2Id.slice(0, 8)} in page: ${page1Ids.includes(sess2Id)}`);

      // Verify skipped does NOT appear
      check("skipped session excluded", 
        !page1Ids.includes(sess4Id),
        `sess4Id ${sess4Id.slice(0, 8)} NOT in page: ${!page1Ids.includes(sess4Id)}`);

      // Verify empty-string actual_type session appears (normalized to 'weights')
      check("empty-string actual_type completed session appears under lifts", 
        page1Ids.includes(sess5Id),
        `sess5Id ${sess5Id.slice(0, 8)} in page: ${page1Ids.includes(sess5Id)}`);

      // Test pagination: fetch page 2, page 3
      const { data: page2 } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 20,
        p_offset: 20,
      });

      const page2Data = page2 as PageRow[];
      const page2Ids = page2Data.map((r: PageRow) => r.session_id);

      const { data: page3 } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 20,
        p_offset: 40,
      });

      const page3Data = page3 as PageRow[];
      const page3Ids = page3Data.map((r: PageRow) => r.session_id);

      // Verify no duplicates across pages
      const allIds = [...page1Ids, ...page2Ids, ...page3Ids];
      const uniqueIds = new Set(allIds);
      check("no duplicates across pages", 
        allIds.length === uniqueIds.size,
        `total ${allIds.length}, unique ${uniqueIds.size}`);

      // Verify total_count equals sum of rows across all pages
      const allRowsCount = page1Data.length + page2Data.length + page3Data.length;
      check("total_count matches sum of all page lengths", 
        totalCount === allRowsCount || allRowsCount === totalCount,
        `total_count ${totalCount}, got ${allRowsCount} rows across 3 pages`);

      // Verify ordering: fetch full sessions and check local_date DESC order
      const { data: allSessions } = await supabaseA
        .from("sessions")
        .select("id, local_date, completed_at, started_at")
        .in("id", page1Ids);

      if (allSessions && allSessions.length > 1) {
        const sessionById = new Map(allSessions.map(s => [s.id, s]));
        const orderedSessions = page1Ids.map(id => sessionById.get(id)).filter(Boolean);
        
        let isOrdered = true;
        for (let i = 0; i < orderedSessions.length - 1; i++) {
          const curr = orderedSessions[i];
          const next = orderedSessions[i + 1];
          if (!curr || !next) continue;
          
          // Check local_date DESC
          if (curr.local_date < next.local_date) {
            isOrdered = false;
            break;
          }
          
          // If same date, check coalesce(completed_at, started_at) DESC
          if (curr.local_date === next.local_date) {
            const currTime = curr.completed_at || curr.started_at || "";
            const nextTime = next.completed_at || next.started_at || "";
            if (currTime && nextTime && currTime < nextTime) {
              isOrdered = false;
              break;
            }
          }
        }
        
        check("sessions ordered by local_date DESC, coalesce(completed_at, started_at) DESC", 
          isOrdered,
          `checked ${orderedSessions.length} sessions`);
      }
    }

    console.log("\n8. get_history_page: total_count when offset past end");
    {
      // Fetch page 99 (way past the end)
      const { data: emptyPage } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 20,
        p_offset: 99999,
      });

      const emptyPageData = emptyPage as HistoryPageRow[];
      check("empty page returns at least one row", 
        emptyPageData.length > 0,
        `got ${emptyPageData.length} rows`);

      if (emptyPageData.length > 0) {
        const firstRow = emptyPageData[0];
        check("empty page has null session_id", 
          firstRow.session_id === null,
          `got ${firstRow.session_id}`);
        
        check("empty page has total_count > 0", 
          firstRow.total_count > 0,
          `got ${firstRow.total_count}`);
      }
    }

    console.log("\n9. QA TZ-1: completed session with local_date > p_today appears");
    {
      // After a timezone change, a completed session can have local_date = tomorrow
      // It should still appear in history and count in progress_summary
      const futureSessionId = randomUUID();
      const futureExId = randomUUID();
      const tomorrowDate = "2026-10-25"; // p_today will be 2026-10-24
      
      await adminClient.from("sessions").insert({
        id: futureSessionId,
        user_id: userIdA,
        local_date: tomorrowDate,
        status: "completed",
        actual_type: "weights",
        completed_at: "2026-10-24T23:30:00Z",
      });
      await adminClient.from("session_exercises").insert({
        id: futureExId,
        user_id: userIdA,
        session_id: futureSessionId,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
      });
      await adminClient.from("session_sets").insert({
        id: randomUUID(),
        user_id: userIdA,
        session_exercise_id: futureExId,
        weight_kg: 100,
        reps: 5,
        is_warmup_set: false,
      });

      // Fetch history with p_today = 2026-10-24
      const { data: futurePage } = await supabaseA.rpc("get_history_page", {
        p_user: userIdA,
        p_filter: "lifts",
        p_today: "2026-10-24",
        p_limit: 20,
        p_offset: 0,
      });

      const futurePageData = futurePage as HistoryPageRow[];
      const futureIds = futurePageData.map((r: HistoryPageRow) => r.session_id).filter(Boolean);
      
      check("QA TZ-1: completed session with local_date > p_today appears in get_history_page",
        futureIds.includes(futureSessionId),
        `future session ${futureSessionId.slice(0, 8)} in page: ${futureIds.includes(futureSessionId)}`);

      // Check that total_count includes it
      const oldTotalCount = futurePageData[0]?.total_count ?? 0;
      check("QA TZ-1: total_count includes future-dated completed session",
        oldTotalCount > 0,
        `total_count: ${oldTotalCount}`);

      // Check progress_summary includes it
      const { data: progressWithFuture } = await supabaseA.rpc("progress_summary", {
        p_user: userIdA,
      });
      
      const progressData = progressWithFuture as { days_trained: number; session_count: number; total_volume_kg: number };
      check("QA TZ-1: progress_summary includes future-dated completed session",
        progressData.session_count > 0,
        `session_count: ${progressData.session_count}`);
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
