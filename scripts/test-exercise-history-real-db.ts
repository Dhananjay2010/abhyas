/**
 * Real database tests for exercise history queries.
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify correctness with:
 * - Out-of-order sessions (insertion ≠ completion order)
 * - Exercise last done >100 sessions ago
 * - Heavy user with >1000 sets
 * - Batch queries with uneven history
 * - RLS: user B cannot see user A's history
 * - M1: PR detection (60 → 62.5 → 65 kg progression, QA scenarios A-E)
 * - M2: Unfinished exercises (2 of 3 sets logged, then ended early)
 * - L1: getLastPerformance skips warm-up-only rows
 * 
 * Run: supabase start && REAL_DB=1 npm run test:exercise-history-real-db
 * 
 * In CI: REAL_DB=1 is set to require a running database (fails if unavailable).
 * Locally: skips gracefully if REAL_DB=1 is not set.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  getLastPerformance,
  getBatchLastPerformance,
  getExerciseHistory,
} from "../src/lib/exercise-history/queries";

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
  // L3 fix: skip unless REAL_DB=1
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
  // NEVER call auth.signIn on this client - it will replace the service key with user JWT
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Verify we have the service role key (decode JWT and check role claim)
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

  // Create test users using admin API (not signIn!)
  const testEmailA = `test-a-${Date.now()}@example.com`;
  const testPasswordA = "test-password-123";
  const testEmailB = `test-b-${Date.now()}@example.com`;
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

  // Create separate authenticated clients for user queries (sign in to get JWTs)
  // Use a fresh anon client for each user to avoid session conflicts
  const anonClientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionDataA, error: signInErrorA } = await anonClientA.auth.signInWithPassword({
    email: testEmailA,
    password: testPasswordA,
  });

  if (signInErrorA || !sessionDataA.session) {
    console.error("Failed to sign in user A:", signInErrorA);
    return false;
  }

  const anonClientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionDataB, error: signInErrorB } = await anonClientB.auth.signInWithPassword({
    email: testEmailB,
    password: testPasswordB,
  });

  if (signInErrorB || !sessionDataB.session) {
    console.error("Failed to sign in user B:", signInErrorB);
    return false;
  }

  // Use the authenticated clients for queries under test
  const supabaseA = anonClientA;
  const supabaseB = anonClientB;

  // Use seeded exercises (from seed.sql) instead of inserting
  // Fetch enough for all scenarios, with deterministic ordering
  const { data: exercises, error: exError } = await adminClient
    .from("exercises")
    .select("id, name")
    .order("id")
    .limit(20);

  if (exError || !exercises || exercises.length < 20) {
    console.error("Failed to fetch seeded exercises:", exError);
    return false;
  }

  // Dedicate one exercise per scenario to avoid collisions
  const exerciseA = exercises[0].id;   // Test 1: out-of-order
  const exerciseB = exercises[1].id;   // Test 2: >100 sessions ago
  const exerciseC = exercises[2].id;   // Test 3: >1000 sets
  const exerciseD = exercises[3].id;   // Test 8: M1 PR detection
  const exerciseE = exercises[4].id;   // Test 9: M2 unfinished
  const exerciseF = exercises[5].id;   // Test 10: L1 warmup-only
  const exerciseG = exercises[6].id;   // Test 11: >1000 rows paging
  console.log(`Using ${exercises.length} seeded exercises (dedicated per scenario)\n`);

  console.log("1. Out-of-order sessions (insertion order ≠ completion order)");
  {
    const sessionB = randomUUID();
    const sessionA = randomUUID();
    const seA = randomUUID();
    const seB = randomUUID();

    // Insert session B first (completed later)
    const { error: e1 } = await adminClient.from("sessions").insert({
      id: sessionB,
      user_id: userIdA,
      local_date: "2026-10-24",
      status: "completed",
      completed_at: "2026-10-24T12:00:00Z",
    });
    if (e1) { console.error("Insert session B failed:", e1); return false; }

    // Insert session A second (completed earlier)
    const { error: e2 } = await adminClient.from("sessions").insert({
      id: sessionA,
      user_id: userIdA,
      local_date: "2026-10-23",
      status: "completed",
      completed_at: "2026-10-23T12:00:00Z",
    });
    if (e2) { console.error("Insert session A failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_exercises").insert([
      {
        id: seA,
        user_id: userIdA,
        session_id: sessionA,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
        order_index: 0,
      },
      {
        id: seB,
        user_id: userIdA,
        session_id: sessionB,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
        order_index: 0,
      },
    ]);
    if (e3) { console.error("Insert session_exercises failed:", e3); return false; }

    const { error: e4 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: seA, set_number: 1, reps: 8, weight_kg: 60, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: seB, set_number: 1, reps: 10, weight_kg: 65, is_warmup_set: false },
    ]);
    if (e4) { console.error("Insert sets failed:", e4); return false; }

    const result = await getLastPerformance(supabaseA, userIdA, exerciseA);

    check("returns a result", result !== null);
    check("returns the LATEST by completed_at (session B)", result?.sessionId === sessionB,
      `got ${result?.sessionId}`);
    check("has correct data", result?.sets[0]?.reps === 10);
  }

  console.log("\n2. Exercise last done >100 sessions ago");
  {
    const sessions = [];
    const sessionExercises = [];
    const sets = [];
    const startDate = new Date("2026-01-01T12:00:00Z");

    for (let i = 0; i < 150; i++) {
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
        completed_at: isoDate,
      });

      sessionExercises.push({
        id: seId,
        user_id: userIdA,
        session_id: sessionId,
        exercise_id: exerciseB,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });

      sets.push({
        user_id: userIdA,
        session_exercise_id: seId,
        set_number: 1,
        reps: 5 + (i % 5),
        weight_kg: 80 + i,
        is_warmup_set: false,
      });
    }

    const { error: e1 } = await adminClient.from("sessions").insert(sessions);
    if (e1) { console.error("Insert 150 sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert(sessionExercises);
    if (e2) { console.error("Insert 150 session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert(sets);
    if (e3) { console.error("Insert 150 sets failed:", e3); return false; }

    const result = await getLastPerformance(supabaseA, userIdA, exerciseB);

    check("finds exercise done >100 sessions ago", result !== null);
    check("returns the actual latest session", result?.sets[0]?.weight_kg === 229,
      `got weight ${result?.sets[0]?.weight_kg}`);
  }

  console.log("\n3. Heavy user with >1000 sets");
  {
    // Create 300 sessions with 4 sets each = 1200 sets
    const sessions = [];
    const sessionExercises = [];
    const sets = [];
    const startDate = new Date("2025-01-01T12:00:00Z");

    for (let i = 0; i < 300; i++) {
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
        completed_at: isoDate,
      });

      sessionExercises.push({
        id: seId,
        user_id: userIdA,
        session_id: sessionId,
        exercise_id: exerciseC,
        metric: "seconds",
        status: "completed",
        order_index: 0,
      });

      // 4 sets per session
      for (let setNum = 1; setNum <= 4; setNum++) {
        sets.push({
          user_id: userIdA,
          session_exercise_id: seId,
          set_number: setNum,
          duration_seconds: 30 + i + setNum,
          is_warmup_set: false,
        });
      }
    }

    const { error: e1 } = await adminClient.from("sessions").insert(sessions);
    if (e1) { console.error("Insert 300 sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert(sessionExercises);
    if (e2) { console.error("Insert 300 session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert(sets);
    if (e3) { console.error("Insert 1200 sets failed:", e3); return false; }

    const result = await getLastPerformance(supabaseA, userIdA, exerciseC);

    check("finds exercise in user with >1000 sets", result !== null);
    check("returns correct metric", result?.metric === "seconds");
    check("returns latest session", result?.sets.length === 4);
  }

  console.log("\n4. Batch query with uneven history");
  {
    const results = await getBatchLastPerformance(supabaseA, userIdA, [exerciseA, exerciseB, exerciseC]);

    check("returns all 3 exercises", results.size === 3, `got ${results.size}`);
    check("exercise A has correct data", results.get(exerciseA)?.sets[0]?.reps === 10);
    check("exercise B not pushed out by exercise A", results.has(exerciseB));
    check("exercise B has latest data", results.get(exerciseB)?.sets[0]?.weight_kg === 229);
    check("exercise C has correct metric", results.get(exerciseC)?.metric === "seconds");
  }

  console.log("\n5. getExerciseHistory pagination and totalCount");
  {
    const history = await getExerciseHistory(supabaseA, userIdA, exerciseB, { limit: 10, offset: 0 });

    check("returns correct totalCount", history.totalCount === 150, `got ${history.totalCount}`);
    check("returns paginated results", history.sessions.length === 10);
    check("sessions are newest first", 
      history.sessions[0].date > history.sessions[1].date);
  }

  console.log("\n6. PR detection with chronological ordering");
  {
    const history = await getExerciseHistory(supabaseA, userIdA, exerciseA, { limit: 10 });

    check("detects current PRs", history.currentPRs.length > 0);
    check("sessions have PR data", history.sessions[0].prs !== undefined);
  }

  console.log("\n7. RLS: user B cannot see user A's history");
  {
    // Add one session for user B
    const sessionBUser = randomUUID();
    const seBUser = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert({
      id: sessionBUser,
      user_id: userIdB,
      local_date: "2026-10-25",
      status: "completed",
      completed_at: "2026-10-25T12:00:00Z",
    });
    if (e1) { console.error("Insert user B session failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert({
      id: seBUser,
      user_id: userIdB,
      session_id: sessionBUser,
      exercise_id: exerciseA,
      metric: "reps",
      status: "completed",
      order_index: 0,
    });
    if (e2) { console.error("Insert user B session_exercise failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert({
      user_id: userIdB,
      session_exercise_id: seBUser,
      set_number: 1,
      reps: 5,
      weight_kg: 50,
      is_warmup_set: false,
    });
    if (e3) { console.error("Insert user B set failed:", e3); return false; }

    // User B querying their own history should work
    const resultB = await getLastPerformance(supabaseB, userIdB, exerciseA);
    check("user B can see their own history", resultB !== null);
    check("user B sees their own data", resultB?.sets[0]?.reps === 5);

    // User B querying user A's history should return null (RLS blocks it)
    const resultA = await getLastPerformance(supabaseB, userIdA, exerciseA);
    check("user B cannot see user A's history", resultA === null,
      `user B should not see user A's data`);

    // Verify view RLS by direct query
    const { data: viewData } = await supabaseB
      .from("exercise_history")
      .select("user_id")
      .eq("user_id", userIdA);

    check("exercise_history view respects RLS", viewData?.length === 0 || !viewData,
      `user B queried exercise_history for user A and got ${viewData?.length || 0} rows`);
  }

  console.log("\n7a. H-7: Swapped exercise appears under new exercise_id");
  {
    // Create a session with an exercise, then simulate a swap by updating exercise_id
    const sessionSwap = randomUUID();
    const seSwap = randomUUID();
    const oldExercise = exercises[0].id;
    const newExercise = exercises[1].id;

    const { error: e1 } = await adminClient.from("sessions").insert({
      id: sessionSwap,
      user_id: userIdA,
      local_date: "2026-10-30",
      status: "completed",
      completed_at: "2026-10-30T12:00:00Z",
    });
    if (e1) { console.error("H-7: Insert session failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert({
      id: seSwap,
      user_id: userIdA,
      session_id: sessionSwap,
      exercise_id: oldExercise,
      metric: "reps",
      status: "completed",
      order_index: 0,
    });
    if (e2) { console.error("H-7: Insert session_exercise failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert({
      user_id: userIdA,
      session_exercise_id: seSwap,
      set_number: 1,
      reps: 8,
      weight_kg: 75,
      is_warmup_set: false,
    });
    if (e3) { console.error("H-7: Insert set failed:", e3); return false; }

    // Simulate swap: update exercise_id and set swapped_from_exercise_id
    const { error: e4 } = await adminClient
      .from("session_exercises")
      .update({
        exercise_id: newExercise,
        swapped_from_exercise_id: oldExercise,
      })
      .eq("id", seSwap);
    if (e4) { console.error("H-7: Swap update failed:", e4); return false; }

    // Check that the exercise appears under the new exercise_id
    const newHistory = await getExerciseHistory(supabaseA, userIdA, newExercise, { limit: 10 });
    const oldHistory = await getExerciseHistory(supabaseA, userIdA, oldExercise, { limit: 10 });

    check("H-7: swapped exercise appears under new exercise_id", 
      newHistory.sessions.some(s => s.sessionId === sessionSwap),
      `new exercise history count: ${newHistory.totalCount}`);
    check("H-7: swapped exercise does NOT appear under old exercise_id",
      !oldHistory.sessions.some(s => s.sessionId === sessionSwap),
      `old exercise history count: ${oldHistory.totalCount}`);
  }

  console.log("\n8. M1: PR detection - QA scenario B (60 → 62.5 → 65 kg, 3 sets each)");
  {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const s3 = randomUUID();
    const se1 = randomUUID();
    const se2 = randomUUID();
    const se3 = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-10-01", status: "completed", completed_at: "2026-10-01T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-10-03", status: "completed", completed_at: "2026-10-03T10:00:00Z" },
      { id: s3, user_id: userIdA, local_date: "2026-10-05", status: "completed", completed_at: "2026-10-05T10:00:00Z" },
    ]);
    if (e1) { console.error("M1 insert sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exerciseD, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exerciseD, metric: "reps", status: "completed", order_index: 0 },
      { id: se3, user_id: userIdA, session_id: s3, exercise_id: exerciseD, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("M1 insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 8, weight_kg: 60, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se1, set_number: 2, reps: 8, weight_kg: 60, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se1, set_number: 3, reps: 8, weight_kg: 60, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 8, weight_kg: 62.5, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 2, reps: 8, weight_kg: 62.5, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 3, reps: 8, weight_kg: 62.5, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se3, set_number: 1, reps: 8, weight_kg: 65, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se3, set_number: 2, reps: 8, weight_kg: 65, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se3, set_number: 3, reps: 8, weight_kg: 65, is_warmup_set: false },
    ]);
    if (e3) { console.error("M1 insert sets failed:", e3); return false; }

    const history = await getExerciseHistory(supabaseA, userIdA, exerciseD, { limit: 10 });

    // Newest first, so [s3, s2, s1]
    check("M1: returns 3 sessions", history.sessions.length === 3, `got ${history.sessions.length}`);
    const [sess3, sess2, sess1] = history.sessions;

    check("M1 s1: first session gets NO PRs (baseline rule)", sess1?.prs.length === 0, `got ${sess1?.prs.length} PRs`);
    check("M1 s2: beats s1 (62.5 > 60)", 
      sess2?.prs.some(pr => pr.type === "heaviest_weight") && sess2?.prs.some(pr => pr.type === "best_e1rm"),
      `s2 prs: ${sess2?.prs.map(p => p.type).join(", ")}`);
    check("M1 s3: beats s2 (65 > 62.5)", 
      sess3?.prs.some(pr => pr.type === "heaviest_weight") && sess3?.prs.some(pr => pr.type === "best_e1rm"),
      `s3 prs: ${sess3?.prs.map(p => p.type).join(", ")}`);
  }

  console.log("\n9. M2: Unfinished exercise (2 of 3 sets logged, then ended early)");
  {
    const sessionId = randomUUID();
    const seId = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert({
      id: sessionId,
      user_id: userIdA,
      local_date: "2026-10-26",
      status: "completed",
      completed_at: "2026-10-26T10:00:00Z",
    });
    if (e1) { console.error("M2 insert session failed:", e1); return false; }

    // Exercise is pending (not completed), but session is completed
    const { error: e2 } = await adminClient.from("session_exercises").insert({
      id: seId,
      user_id: userIdA,
      session_id: sessionId,
      exercise_id: exerciseE,
      metric: "reps",
      status: "pending",
      order_index: 0,
    });
    if (e2) { console.error("M2 insert session_exercise failed:", e2); return false; }

    // Only 2 of 3 planned sets logged
    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: seId, set_number: 1, reps: 8, weight_kg: 80, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: seId, set_number: 2, reps: 7, weight_kg: 80, is_warmup_set: false },
    ]);
    if (e3) { console.error("M2 insert sets failed:", e3); return false; }

    const lastPerf = await getLastPerformance(supabaseA, userIdA, exerciseE);

    check("M2: unfinished exercise appears in history", lastPerf !== null);
    check("M2: has correct date", lastPerf?.date === "2026-10-26");
    check("M2: has 2 sets logged", lastPerf?.sets.length === 2, `got ${lastPerf?.sets.length}`);
  }

  console.log("\n10. L1: getLastPerformance skips warm-up-only rows");
  {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const se1 = randomUUID();
    const se2 = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-10-27", status: "completed", completed_at: "2026-10-27T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-10-28", status: "completed", completed_at: "2026-10-28T10:00:00Z" },
    ]);
    if (e1) { console.error("L1 insert sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exerciseF, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exerciseF, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("L1 insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 5, weight_kg: 40, is_warmup_set: true },
    ]);
    if (e3) { console.error("L1 insert sets failed:", e3); return false; }

    // The view should exclude se2 (warm-up-only row)
    const lastPerf = await getLastPerformance(supabaseA, userIdA, exerciseF);

    check("L1: returns older row with working sets", lastPerf !== null);
    check("L1: returns the 2026-10-27 row (not warm-up-only 2026-10-28)", 
      lastPerf?.date === "2026-10-27",
      `got date ${lastPerf?.date}`);
    check("L1: has 100kg working set", lastPerf?.sets[0]?.weight_kg === 100);
  }

  console.log("\n11. Paging: PR detection with >1000 rows (batched fetch)");
  {
    // Create 1100 sessions; session 500 has the heaviest weight (150 kg)
    // Session 1100 has 145 kg, which should NOT be a PR since 150 kg is in row 500
    const sessions = [];
    const sessionExercises = [];
    const sets = [];
    const startDate = new Date("2020-01-01T12:00:00Z");

    for (let i = 1; i <= 1100; i++) {
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
        completed_at: isoDate,
      });

      sessionExercises.push({
        id: seId,
        user_id: userIdA,
        session_id: sessionId,
        exercise_id: exerciseG,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });

      // Session 500 has the heaviest weight (150 kg), session 1100 has 145 kg
      const weight = (i === 500) ? 150 : (i === 1100) ? 145 : 100 + (i % 30);
      sets.push({
        user_id: userIdA,
        session_exercise_id: seId,
        set_number: 1,
        reps: 5,
        weight_kg: weight,
        is_warmup_set: false,
      });
    }

    // Insert in batches to avoid payload limits
    for (let i = 0; i < sessions.length; i += 100) {
      const { error: e1 } = await adminClient.from("sessions").insert(sessions.slice(i, i + 100));
      if (e1) { console.error(`Insert sessions batch ${i} failed:`, e1); return false; }

      const { error: e2 } = await adminClient.from("session_exercises").insert(sessionExercises.slice(i, i + 100));
      if (e2) { console.error(`Insert session_exercises batch ${i} failed:`, e2); return false; }

      const { error: e3 } = await adminClient.from("session_sets").insert(sets.slice(i, i + 100));
      if (e3) { console.error(`Insert sets batch ${i} failed:`, e3); return false; }
    }

    const history = await getExerciseHistory(supabaseA, userIdA, exerciseG, { limit: 10, offset: 0 });

    check("Paging: returns correct totalCount", history.totalCount === 1100, `got ${history.totalCount}`);
    check("Paging: returns paginated results", history.sessions.length === 10);
    
    // Check session 1100 (newest, should be first in results)
    const session1100 = history.sessions[0];
    check("Paging: session 1100 has 145 kg", session1100?.sets[0]?.weight_kg === 145);
    check("Paging: session 1100 has NO heaviest_weight PR (150 kg is at row 500)",
      !session1100?.prs.some(pr => pr.type === "heaviest_weight"),
      `session 1100 prs: ${session1100?.prs.map(p => p.type).join(", ")}`);
    
    // Current PRs should include the 150 kg from session 500
    const heaviestPR = history.currentPRs.find(pr => pr.type === "heaviest_weight");
    check("Paging: currentPRs includes 150 kg", heaviestPR?.value === 150, `got ${heaviestPR?.value}`);
  }

  console.log("\n12. Ordering: equal completed_at across page boundary");
  {
    // Create 12 sessions all with the same completed_at, but different session_exercise_ids
    const sharedTime = "2026-11-01T12:00:00Z";
    const sessions = [];
    const sessionExercises = [];
    const sets = [];
    const seIds: string[] = [];

    for (let i = 1; i <= 12; i++) {
      const sessionId = randomUUID();
      const seId = randomUUID();
      seIds.push(seId);
      
      sessions.push({
        id: sessionId,
        user_id: userIdA,
        local_date: "2026-11-01",
        status: "completed",
        completed_at: sharedTime,
      });

      sessionExercises.push({
        id: seId,
        user_id: userIdA,
        session_id: sessionId,
        exercise_id: exercises[7].id,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });

      sets.push({
        user_id: userIdA,
        session_exercise_id: seId,
        set_number: 1,
        reps: 5,
        weight_kg: 100,
        is_warmup_set: false,
      });
    }

    const { error: e1 } = await adminClient.from("sessions").insert(sessions);
    if (e1) { console.error("Ordering insert sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert(sessionExercises);
    if (e2) { console.error("Ordering insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert(sets);
    if (e3) { console.error("Ordering insert sets failed:", e3); return false; }

    // Fetch first page (limit 10, offset 0)
    const page1 = await getExerciseHistory(supabaseA, userIdA, exercises[7].id, { limit: 10, offset: 0 });
    check("Ordering: page1 has 10 sessions", page1.sessions.length === 10);
    const page1SeIds = page1.sessions.map(s => s.sessionId);

    // Fetch second page (limit 10, offset 10)
    const page2 = await getExerciseHistory(supabaseA, userIdA, exercises[7].id, { limit: 10, offset: 10 });
    check("Ordering: page2 has 2 sessions", page2.sessions.length === 2);
    const page2SeIds = page2.sessions.map(s => s.sessionId);

    // No session should appear in both pages
    const intersection = page1SeIds.filter(id => page2SeIds.includes(id));
    check("Ordering: no duplicate sessions across pages", intersection.length === 0,
      `found ${intersection.length} duplicates`);
    
    // All 12 sessions should be present
    const allFetched = [...page1SeIds, ...page2SeIds];
    check("Ordering: all 12 sessions fetched", allFetched.length === 12, `got ${allFetched.length}`);
  }

  console.log("\n13. PR rule: deload most-reps (100×5 then 70×8 is NOT a PR)");
  {
    // QA scenario: squat s1 100kg x5, s2 70kg x8
    // Expected: s2 should NOT get most_reps PR (lighter weight)
    const s1 = randomUUID();
    const s2 = randomUUID();
    const se1 = randomUUID();
    const se2 = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-10-01", status: "completed", completed_at: "2026-10-01T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-10-08", status: "completed", completed_at: "2026-10-08T10:00:00Z" },
    ]);
    if (e1) { console.error("Deload insert sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exercises[8].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exercises[8].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("Deload insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 8, weight_kg: 70, is_warmup_set: false },
    ]);
    if (e3) { console.error("Deload insert sets failed:", e3); return false; }

    const history = await getExerciseHistory(supabaseA, userIdA, exercises[8].id, { limit: 10 });

    check("Deload: returns 2 sessions", history.sessions.length === 2);
    const [sess2, sess1] = history.sessions; // Newest first

    check("Deload s1: first session gets NO PRs", sess1?.prs.length === 0);
    check("Deload s2: 70×8 does NOT get most_reps PR (lighter than 100×5)",
      !sess2?.prs.some(pr => pr.type === "most_reps"),
      `s2 prs: ${sess2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
    check("Deload s2: no PRs at all (lighter weight, fewer reps)",
      sess2?.prs.length === 0,
      `expected 0 PRs, got ${sess2?.prs.length}`);
  }

  console.log("\n14. PR rule: weighted most-reps at heavier weight (100×5 then 100×8 IS a PR)");
  {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const se1 = randomUUID();
    const se2 = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-10-02", status: "completed", completed_at: "2026-10-02T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-10-09", status: "completed", completed_at: "2026-10-09T10:00:00Z" },
    ]);
    if (e1) { console.error("Same-weight insert sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exercises[9].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exercises[9].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("Same-weight insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 8, weight_kg: 100, is_warmup_set: false },
    ]);
    if (e3) { console.error("Same-weight insert sets failed:", e3); return false; }

    const history = await getExerciseHistory(supabaseA, userIdA, exercises[9].id, { limit: 10 });

    check("Same-weight: returns 2 sessions", history.sessions.length === 2);
    const [sess2, sess1] = history.sessions;

    check("Same-weight s1: first session gets NO PRs", sess1?.prs.length === 0);
    check("Same-weight s2: 100×8 DOES get most_reps PR (same weight, more reps)",
      sess2?.prs.some(pr => pr.type === "most_reps" && pr.value === 8),
      `s2 prs: ${sess2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
  }

  console.log("\n15. PR rule: weighted most-reps at heavier weight (100×5 then 105×6 IS a PR)");
  {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const se1 = randomUUID();
    const se2 = randomUUID();

    const { error: e1 } = await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-10-03", status: "completed", completed_at: "2026-10-03T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-10-10", status: "completed", completed_at: "2026-10-10T10:00:00Z" },
    ]);
    if (e1) { console.error("Heavier insert sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exercises[10].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exercises[10].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("Heavier insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 6, weight_kg: 105, is_warmup_set: false },
    ]);
    if (e3) { console.error("Heavier insert sets failed:", e3); return false; }

    const history = await getExerciseHistory(supabaseA, userIdA, exercises[10].id, { limit: 10 });

    check("Heavier: returns 2 sessions", history.sessions.length === 2);
    const [sess2, sess1] = history.sessions;

    check("Heavier s1: first session gets NO PRs", sess1?.prs.length === 0);
    check("Heavier s2: 105×6 DOES get most_reps PR (heavier weight, more reps)",
      sess2?.prs.some(pr => pr.type === "most_reps" && pr.value === 6),
      `s2 prs: ${sess2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
  }

  console.log("\n16. Item 1: Sets query paging (>1000 sets in one batch)");
  {
    // Create 100 sessions with 12 working sets each = 1200 rows
    // This tests that the sets query doesn't silently truncate at 1000
    const sessions = [];
    const sessionExercises = [];
    const sets = [];
    const startDate = new Date("2024-01-01T12:00:00Z");

    for (let i = 0; i < 100; i++) {
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
        completed_at: isoDate,
      });

      sessionExercises.push({
        id: seId,
        user_id: userIdA,
        session_id: sessionId,
        exercise_id: exercises[11].id,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });

      // 12 sets per session, with set 12 of session 99 being 140 kg
      for (let setNum = 1; setNum <= 12; setNum++) {
        sets.push({
          user_id: userIdA,
          session_exercise_id: seId,
          set_number: setNum,
          reps: 5,
          weight_kg: (i === 99 && setNum === 12) ? 140 : 100,
          is_warmup_set: false,
        });
      }
    }

    const { error: e1 } = await adminClient.from("sessions").insert(sessions);
    if (e1) { console.error("Item 1: Insert 100 sessions failed:", e1); return false; }

    const { error: e2 } = await adminClient.from("session_exercises").insert(sessionExercises);
    if (e2) { console.error("Item 1: Insert 100 session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert(sets);
    if (e3) { console.error("Item 1: Insert 1200 sets failed:", e3); return false; }

    const history = await getExerciseHistory(supabaseA, userIdA, exercises[11].id, { limit: 5 });

    check("Item 1: newest session shows all 12 sets", history.sessions[0].sets.length === 12,
      `got ${history.sessions[0].sets.length}`);
    check("Item 1: newest session's 140 kg set is seen",
      history.sessions[0].sets.some(s => s.weight_kg === 140),
      `max weight: ${Math.max(...history.sessions[0].sets.map(s => s.weight_kg ?? 0))}`);
    check("Item 1: newest session gets heaviest_weight PR",
      history.sessions[0].prs.some(pr => pr.type === "heaviest_weight"));
  }

  console.log("\n17. Item 2: currentPRs independent of page");
  {
    // Use exercise from test 1, which already has many sessions
    const page1 = await getExerciseHistory(supabaseA, userIdA, exerciseB, { limit: 10, offset: 0 });
    const page2 = await getExerciseHistory(supabaseA, userIdA, exerciseB, { limit: 10, offset: 10 });

    check("Item 2: page 1 has currentPRs", page1.currentPRs.length > 0);
    check("Item 2: page 2 has same currentPRs",
      JSON.stringify(page1.currentPRs) === JSON.stringify(page2.currentPRs),
      `page1: ${page1.currentPRs.length}, page2: ${page2.currentPRs.length}`);
  }

  console.log("\n18. Items 3-5: QA Bot 1 rep PR scenarios");
  {
    // R9: 60×12, then 100×5, then 100×8 -> third is a PR
    const s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID();
    const se1 = randomUUID(), se2 = randomUUID(), se3 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-10-01", status: "completed", completed_at: "2026-10-01T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-10-02", status: "completed", completed_at: "2026-10-02T10:00:00Z" },
      { id: s3, user_id: userIdA, local_date: "2026-10-03", status: "completed", completed_at: "2026-10-03T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exercises[12].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exercises[12].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se3, user_id: userIdA, session_id: s3, exercise_id: exercises[12].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 12, weight_kg: 60, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se3, set_number: 1, reps: 8, weight_kg: 100, is_warmup_set: false },
    ]);

    const histR9 = await getExerciseHistory(supabaseA, userIdA, exercises[12].id, { limit: 10 });
    const [sessR9_3, sessR9_2, sessR9_1] = histR9.sessions;

    check("R9: 60×12, 100×5, 100×8 -> third session is rep PR",
      sessR9_3?.prs.some(pr => pr.type === "most_reps" && pr.value === 8),
      `s3 prs: ${sessR9_3?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
    check("R9: second session gets heaviest but not most_reps",
      sessR9_2?.prs.some(pr => pr.type === "heaviest_weight") &&
      !sessR9_2?.prs.some(pr => pr.type === "most_reps"));

    // R10: 100×5, then [50×10, 100×10] -> no PR for second session
    const s4 = randomUUID(), s5 = randomUUID();
    const se4 = randomUUID(), se5 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s4, user_id: userIdA, local_date: "2026-10-04", status: "completed", completed_at: "2026-10-04T10:00:00Z" },
      { id: s5, user_id: userIdA, local_date: "2026-10-05", status: "completed", completed_at: "2026-10-05T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se4, user_id: userIdA, session_id: s4, exercise_id: exercises[13].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se5, user_id: userIdA, session_id: s5, exercise_id: exercises[13].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se4, set_number: 1, reps: 10, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se5, set_number: 1, reps: 10, weight_kg: 50, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se5, set_number: 2, reps: 10, weight_kg: 100, is_warmup_set: false },
    ]);

    const histR10 = await getExerciseHistory(supabaseA, userIdA, exercises[13].id, { limit: 10 });
    const [sessR10_2, sessR10_1] = histR10.sessions;

    check("R10: [50×10, 100×10] after 100×10 is NOT a rep PR",
      !sessR10_2?.prs.some(pr => pr.type === "most_reps"),
      `s2 prs: ${sessR10_2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);

    // R11: [50×10, 100×10], then 60×11 -> NOT a PR
    const s6 = randomUUID(), s7 = randomUUID();
    const se6 = randomUUID(), se7 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s6, user_id: userIdA, local_date: "2026-10-06", status: "completed", completed_at: "2026-10-06T10:00:00Z" },
      { id: s7, user_id: userIdA, local_date: "2026-10-07", status: "completed", completed_at: "2026-10-07T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se6, user_id: userIdA, session_id: s6, exercise_id: exercises[14].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se7, user_id: userIdA, session_id: s7, exercise_id: exercises[14].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se6, set_number: 1, reps: 10, weight_kg: 50, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se6, set_number: 2, reps: 10, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se7, set_number: 1, reps: 11, weight_kg: 60, is_warmup_set: false },
    ]);

    const histR11 = await getExerciseHistory(supabaseA, userIdA, exercises[14].id, { limit: 10 });
    const [sessR11_2, sessR11_1] = histR11.sessions;

    check("R11: 60×11 after [50×10, 100×10] is NOT a PR",
      !sessR11_2?.prs.some(pr => pr.type === "most_reps"),
      `s2 prs: ${sessR11_2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);

    // R12: currentPRs.most_reps agrees with badges (100×5, 70×8)
    const s8 = randomUUID(), s9 = randomUUID();
    const se8 = randomUUID(), se9 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s8, user_id: userIdA, local_date: "2026-10-08", status: "completed", completed_at: "2026-10-08T10:00:00Z" },
      { id: s9, user_id: userIdA, local_date: "2026-10-09", status: "completed", completed_at: "2026-10-09T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se8, user_id: userIdA, session_id: s8, exercise_id: exercises[15].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se9, user_id: userIdA, session_id: s9, exercise_id: exercises[15].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se8, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se9, set_number: 1, reps: 8, weight_kg: 70, is_warmup_set: false },
    ]);

    const histR12 = await getExerciseHistory(supabaseA, userIdA, exercises[15].id, { limit: 10 });
    const [sessR12_2, sessR12_1] = histR12.sessions;

    check("R12: no session gets most_reps badge after deload",
      !sessR12_2?.prs.some(pr => pr.type === "most_reps") &&
      !sessR12_1?.prs.some(pr => pr.type === "most_reps"));
    const mostRepsPR = histR12.currentPRs.find(pr => pr.type === "most_reps");
    check("R12: currentPRs.most_reps is 100×5 (agrees with badge rule)",
      mostRepsPR?.set.weight_kg === 100 && mostRepsPR?.value === 5,
      `got ${mostRepsPR?.set.weight_kg}×${mostRepsPR?.value}`);
  }

  console.log("\n19. Item 7: Test at exact batch boundary");
  {
    // Test with exactly 1000 rows, and 1001 rows
    const sessions1000 = [];
    const sessionExercises1000 = [];
    const sets1000 = [];
    const startDate = new Date("2023-01-01T12:00:00Z");

    for (let i = 0; i < 1000; i++) {
      const sessionId = randomUUID();
      const seId = randomUUID();
      
      const sessionDate = new Date(startDate);
      sessionDate.setDate(startDate.getDate() + i);
      const isoDate = sessionDate.toISOString();
      const localDate = isoDate.split("T")[0];
      
      sessions1000.push({
        id: sessionId,
        user_id: userIdA,
        local_date: localDate,
        status: "completed",
        completed_at: isoDate,
      });

      sessionExercises1000.push({
        id: seId,
        user_id: userIdA,
        session_id: sessionId,
        exercise_id: exercises[16].id,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });

      sets1000.push({
        user_id: userIdA,
        session_exercise_id: seId,
        set_number: 1,
        reps: 5,
        weight_kg: i === 999 ? 150 : 100,
        is_warmup_set: false,
      });
    }

    // Insert in batches to avoid payload limits
    for (let i = 0; i < sessions1000.length; i += 100) {
      await adminClient.from("sessions").insert(sessions1000.slice(i, i + 100));
      await adminClient.from("session_exercises").insert(sessionExercises1000.slice(i, i + 100));
      await adminClient.from("session_sets").insert(sets1000.slice(i, i + 100));
    }

    const hist1000 = await getExerciseHistory(supabaseA, userIdA, exercises[16].id, { limit: 10 });

    check("Item 7: exactly 1000 rows processed correctly", hist1000.totalCount === 1000);
    check("Item 7: newest session (150 kg) gets heaviest PR",
      hist1000.sessions[0].prs.some(pr => pr.type === "heaviest_weight"));
    check("Item 7: currentPRs shows 150 kg",
      hist1000.currentPRs.find(pr => pr.type === "heaviest_weight")?.value === 150);

    // Add one more session for 1001 total
    const s1001 = randomUUID();
    const se1001 = randomUUID();
    const date1001 = new Date(startDate);
    date1001.setDate(startDate.getDate() + 1000);

    await adminClient.from("sessions").insert({
      id: s1001,
      user_id: userIdA,
      local_date: date1001.toISOString().split("T")[0],
      status: "completed",
      completed_at: date1001.toISOString(),
    });
    await adminClient.from("session_exercises").insert({
      id: se1001,
      user_id: userIdA,
      session_id: s1001,
      exercise_id: exercises[16].id,
      metric: "reps",
      status: "completed",
      order_index: 0,
    });
    await adminClient.from("session_sets").insert({
      user_id: userIdA,
      session_exercise_id: se1001,
      set_number: 1,
      reps: 5,
      weight_kg: 145,
      is_warmup_set: false,
    });

    const hist1001 = await getExerciseHistory(supabaseA, userIdA, exercises[16].id, { limit: 10 });

    check("Item 7: 1001 rows processed correctly", hist1001.totalCount === 1001);
    check("Item 7: 145 kg session has no heaviest PR (150 kg earlier)",
      !hist1001.sessions[0].prs.some(pr => pr.type === "heaviest_weight"));
  }

  console.log("\n19. Item A: Refined rep PRs (QA Bot 2 H-1 and H-2)");
  {
    // H-1: 100×5, 70×12, 100×6 -> third session is a rep PR
    const s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID();
    const se1 = randomUUID(), se2 = randomUUID(), se3 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-09-01", status: "completed", completed_at: "2026-09-01T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-09-02", status: "completed", completed_at: "2026-09-02T10:00:00Z" },
      { id: s3, user_id: userIdA, local_date: "2026-09-03", status: "completed", completed_at: "2026-09-03T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exercises[17].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exercises[17].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se3, user_id: userIdA, session_id: s3, exercise_id: exercises[17].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 12, weight_kg: 70, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se3, set_number: 1, reps: 6, weight_kg: 100, is_warmup_set: false },
    ]);

    const histH1 = await getExerciseHistory(supabaseA, userIdA, exercises[17].id, { limit: 10 });
    const [sessH1_3, sessH1_2, sessH1_1] = histH1.sessions;

    check("H-1: 100×6 after 70×12 is a rep PR (beats earlier 100×5)",
      sessH1_3?.prs.some(pr => pr.type === "most_reps" && pr.value === 6),
      `s3 prs: ${sessH1_3?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
    check("H-1: 70×12 correctly gets no PR (lighter weight)",
      !sessH1_2?.prs.some(pr => pr.type === "most_reps"));

    // H-2: 100×5, [60×10, 100×6] -> second session is a rep PR
    const s4 = randomUUID(), s5 = randomUUID();
    const se4 = randomUUID(), se5 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s4, user_id: userIdA, local_date: "2026-09-04", status: "completed", completed_at: "2026-09-04T10:00:00Z" },
      { id: s5, user_id: userIdA, local_date: "2026-09-05", status: "completed", completed_at: "2026-09-05T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se4, user_id: userIdA, session_id: s4, exercise_id: exercises[18].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se5, user_id: userIdA, session_id: s5, exercise_id: exercises[18].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se4, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se5, set_number: 1, reps: 10, weight_kg: 60, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se5, set_number: 2, reps: 6, weight_kg: 100, is_warmup_set: false },
    ]);

    const histH2 = await getExerciseHistory(supabaseA, userIdA, exercises[18].id, { limit: 10 });
    const [sessH2_2, sessH2_1] = histH2.sessions;

    check("H-2: [60×10, 100×6] gets rep PR for 100×6 (beats 100×5 at same weight)",
      sessH2_2?.prs.some(pr => pr.type === "most_reps" && pr.value === 6),
      `s2 prs: ${sessH2_2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
  }

  console.log("\n20. Item B: e1RM rounding prevents false PRs on mathematical ties");
  {
    // 121×1 and 110×3 both equal 121.0 when rounded
    const s1 = randomUUID(), s2 = randomUUID();
    const se1 = randomUUID(), se2 = randomUUID();

    await adminClient.from("sessions").insert([
      { id: s1, user_id: userIdA, local_date: "2026-09-10", status: "completed", completed_at: "2026-09-10T10:00:00Z" },
      { id: s2, user_id: userIdA, local_date: "2026-09-11", status: "completed", completed_at: "2026-09-11T10:00:00Z" },
    ]);
    await adminClient.from("session_exercises").insert([
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exercises[19].id, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exercises[19].id, metric: "reps", status: "completed", order_index: 0 },
    ]);
    await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 1, weight_kg: 121, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 3, weight_kg: 110, is_warmup_set: false },
    ]);

    const histB = await getExerciseHistory(supabaseA, userIdA, exercises[19].id, { limit: 10 });
    const [sessB_2, sessB_1] = histB.sessions;

    check("Item B: 110×3 does NOT get e1RM PR (rounds to same as 121×1)",
      !sessB_2?.prs.some(pr => pr.type === "best_e1rm"),
      `s2 prs: ${sessB_2?.prs.map(p => `${p.type}=${p.value}`).join(", ")}`);
    check("Item B: first session gets no PRs (baseline rule)",
      sessB_1?.prs.length === 0);
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} FAILURES\n`);
    return false;
  }

  console.log("\n✅ All real DB tests passed\n");
  return true;
  } finally {
    // Cleanup test users and their data on every path
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
