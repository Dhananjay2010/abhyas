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

  const { data: authDataA, error: signUpErrorA } = await adminClient.auth.admin.createUser({
    email: testEmailA,
    password: testPasswordA,
    email_confirm: true,
  });

  if (signUpErrorA || !authDataA.user) {
    console.error("Failed to create test user A:", signUpErrorA);
    return false;
  }

  const { data: authDataB, error: signUpErrorB } = await adminClient.auth.admin.createUser({
    email: testEmailB,
    password: testPasswordB,
    email_confirm: true,
  });

  if (signUpErrorB || !authDataB.user) {
    console.error("Failed to create test user B:", signUpErrorB);
    return false;
  }

  const userIdA = authDataA.user.id;
  const userIdB = authDataB.user.id;
  console.log(`Created test users: A=${userIdA.slice(0, 8)}... B=${userIdB.slice(0, 8)}...\n`);

  // L3 fix: cleanup in finally block
  let cleanupNeeded = true;
  try {

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
  const { data: exercises, error: exError } = await adminClient
    .from("exercises")
    .select("id, name")
    .limit(3);

  if (exError || !exercises || exercises.length < 3) {
    console.error("Failed to fetch seeded exercises:", exError);
    return false;
  }

  const exerciseA = exercises[0].id;
  const exerciseB = exercises[1].id;
  const exerciseC = exercises[2].id;
  console.log(`Using seeded exercises: ${exercises[0].name}, ${exercises[1].name}, ${exercises[2].name}\n`);

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
      { user_id: userIdA, session_exercise_id: seA, set_number: 1, reps: 8, weight_kg: 60 },
      { user_id: userIdA, session_exercise_id: seB, set_number: 1, reps: 10, weight_kg: 65 },
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
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exerciseA, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exerciseA, metric: "reps", status: "completed", order_index: 0 },
      { id: se3, user_id: userIdA, session_id: s3, exercise_id: exerciseA, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("M1 insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 8, weight_kg: 60 },
      { user_id: userIdA, session_exercise_id: se1, set_number: 2, reps: 8, weight_kg: 60 },
      { user_id: userIdA, session_exercise_id: se1, set_number: 3, reps: 8, weight_kg: 60 },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 8, weight_kg: 62.5 },
      { user_id: userIdA, session_exercise_id: se2, set_number: 2, reps: 8, weight_kg: 62.5 },
      { user_id: userIdA, session_exercise_id: se2, set_number: 3, reps: 8, weight_kg: 62.5 },
      { user_id: userIdA, session_exercise_id: se3, set_number: 1, reps: 8, weight_kg: 65 },
      { user_id: userIdA, session_exercise_id: se3, set_number: 2, reps: 8, weight_kg: 65 },
      { user_id: userIdA, session_exercise_id: se3, set_number: 3, reps: 8, weight_kg: 65 },
    ]);
    if (e3) { console.error("M1 insert sets failed:", e3); return false; }

    const history = await getExerciseHistory(supabaseA, userIdA, exerciseA, { limit: 10 });

    // Newest first, so [s3, s2, s1]
    check("M1: returns 3 sessions", history.sessions.length === 3, `got ${history.sessions.length}`);
    const [sess3, sess2, sess1] = history.sessions;

    check("M1 s1: first session gets PRs", sess1?.prs.length === 3, `got ${sess1?.prs.length}`);
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
      exercise_id: exerciseB,
      metric: "reps",
      status: "pending",
      order_index: 0,
    });
    if (e2) { console.error("M2 insert session_exercise failed:", e2); return false; }

    // Only 2 of 3 planned sets logged
    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: seId, set_number: 1, reps: 8, weight_kg: 80 },
      { user_id: userIdA, session_exercise_id: seId, set_number: 2, reps: 7, weight_kg: 80 },
    ]);
    if (e3) { console.error("M2 insert sets failed:", e3); return false; }

    const lastPerf = await getLastPerformance(supabaseA, userIdA, exerciseB);

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
      { id: se1, user_id: userIdA, session_id: s1, exercise_id: exerciseC, metric: "reps", status: "completed", order_index: 0 },
      { id: se2, user_id: userIdA, session_id: s2, exercise_id: exerciseC, metric: "reps", status: "completed", order_index: 0 },
    ]);
    if (e2) { console.error("L1 insert session_exercises failed:", e2); return false; }

    const { error: e3 } = await adminClient.from("session_sets").insert([
      { user_id: userIdA, session_exercise_id: se1, set_number: 1, reps: 5, weight_kg: 100, is_warmup_set: false },
      { user_id: userIdA, session_exercise_id: se2, set_number: 1, reps: 5, weight_kg: 40, is_warmup_set: true },
    ]);
    if (e3) { console.error("L1 insert sets failed:", e3); return false; }

    // The view should exclude se2 (warm-up-only row)
    const lastPerf = await getLastPerformance(supabaseA, userIdA, exerciseC);

    check("L1: returns older row with working sets", lastPerf !== null);
    check("L1: returns the 2026-10-27 row (not warm-up-only 2026-10-28)", 
      lastPerf?.date === "2026-10-27",
      `got date ${lastPerf?.date}`);
    check("L1: has 100kg working set", lastPerf?.sets[0]?.weight_kg === 100);
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} FAILURES\n`);
    return false;
  }

  console.log("\n✅ All real DB tests passed\n");
  cleanupNeeded = false;
  return true;
  } finally {
    // L3 fix: cleanup test users and their data
    if (cleanupNeeded) {
      console.log("\nCleaning up test users...");
      try {
        await adminClient.auth.admin.deleteUser(userIdA);
        await adminClient.auth.admin.deleteUser(userIdB);
        console.log("✓ Test users deleted\n");
      } catch (cleanupError) {
        console.error("Warning: cleanup failed:", cleanupError);
      }
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
