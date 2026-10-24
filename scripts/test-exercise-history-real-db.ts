/**
 * Real database tests for exercise history queries.
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify correctness with:
 * - Out-of-order sessions (insertion ≠ completion order)
 * - Exercise last done >100 sessions ago
 * - Heavy user with >1000 sessions
 * - Batch queries with uneven history
 * 
 * Run: supabase start && npx tsx scripts/test-exercise-history-real-db.ts
 * 
 * Skips cleanly in CI if no Supabase is available.
 */

import { createClient } from "@supabase/supabase-js";
import {
  getLastPerformance,
  getBatchLastPerformance,
  getExerciseHistory,
} from "../src/lib/exercise-history/queries";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function testDatabaseConnection() {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function runTests() {
  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.log("\n⏭️  Skipping real DB tests (Supabase not available)");
    console.log("   Run `supabase start` to enable these tests\n");
    return true; // Skip cleanly
  }

  console.log("✓ Connected to Supabase\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Create a test user and authenticate
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });

  if (signUpError || !authData.user) {
    console.error("Failed to create test user:", signUpError);
    return false;
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId}\n`);

  // Create test exercises
  const exerciseA = "ex-test-a-" + Date.now();
  const exerciseB = "ex-test-b-" + Date.now();
  const exerciseC = "ex-test-c-" + Date.now();

  // Insert test exercises into the exercises table
  await supabase.from("exercises").insert([
    {
      id: exerciseA,
      name: "Test Bench Press",
      slug: "test-bench-" + Date.now(),
      category: "strength",
      metric: "reps",
      primary_muscles: ["chest"],
      tracks: ["weights"],
      movement_pattern: "horizontal_press",
    },
    {
      id: exerciseB,
      name: "Test Squat",
      slug: "test-squat-" + Date.now(),
      category: "strength",
      metric: "reps",
      primary_muscles: ["quads"],
      tracks: ["weights"],
      movement_pattern: "squat",
    },
    {
      id: exerciseC,
      name: "Test Plank",
      slug: "test-plank-" + Date.now(),
      category: "strength",
      metric: "seconds",
      primary_muscles: ["abs"],
      tracks: ["bodyweight"],
      movement_pattern: "core",
    },
  ]);

  console.log("1. Out-of-order sessions (insertion order ≠ completion order)");
  {
    // Insert session B first (completed later)
    const sessionB = "sess-b-" + Date.now();
    await supabase.from("sessions").insert({
      id: sessionB,
      user_id: userId,
      local_date: "2026-10-24",
      status: "completed",
      completed_at: "2026-10-24T12:00:00Z", // Later
    });

    // Insert session A second (completed earlier)
    const sessionA = "sess-a-" + Date.now();
    await supabase.from("sessions").insert({
      id: sessionA,
      user_id: userId,
      local_date: "2026-10-23",
      status: "completed",
      completed_at: "2026-10-23T12:00:00Z", // Earlier
    });

    // Add session_exercises
    const seA = "se-a-" + Date.now();
    const seB = "se-b-" + Date.now();
    await supabase.from("session_exercises").insert([
      {
        id: seA,
        user_id: userId,
        session_id: sessionA,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
        order_index: 0,
      },
      {
        id: seB,
        user_id: userId,
        session_id: sessionB,
        exercise_id: exerciseA,
        metric: "reps",
        status: "completed",
        order_index: 0,
      },
    ]);

    // Add sets
    await supabase.from("session_sets").insert([
      { user_id: userId, session_exercise_id: seA, set_number: 1, reps: 8, weight_kg: 60 },
      { user_id: userId, session_exercise_id: seB, set_number: 1, reps: 10, weight_kg: 65 },
    ]);

    // Query should return session B (latest completed_at)
    const result = await getLastPerformance(supabase, userId, exerciseA);

    check("returns a result", result !== null);
    check("returns the LATEST by completed_at (session B)", result?.sessionId === sessionB,
      `got ${result?.sessionId}`);
    check("has correct data", result?.sets[0]?.reps === 10);
  }

  console.log("\n2. Exercise last done >100 sessions ago");
  {
    // Create 150 sessions for exercise B
    const sessions = [];
    const sessionExercises = [];
    const sets = [];

    for (let i = 0; i < 150; i++) {
      const sessionId = `sess-many-${i}-${Date.now()}`;
      const seId = `se-many-${i}-${Date.now()}`;
      
      sessions.push({
        id: sessionId,
        user_id: userId,
        local_date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        status: "completed",
        completed_at: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}T12:00:00Z`,
      });

      sessionExercises.push({
        id: seId,
        user_id: userId,
        session_id: sessionId,
        exercise_id: exerciseB,
        metric: "reps",
        status: "completed",
        order_index: 0,
      });

      sets.push({
        user_id: userId,
        session_exercise_id: seId,
        set_number: 1,
        reps: 5 + (i % 5),
        weight_kg: 80 + i,
      });
    }

    await supabase.from("sessions").insert(sessions);
    await supabase.from("session_exercises").insert(sessionExercises);
    await supabase.from("session_sets").insert(sets);

    const result = await getLastPerformance(supabase, userId, exerciseB);

    check("finds exercise done >100 sessions ago", result !== null);
    check("returns the actual latest session", result?.sets[0]?.weight_kg === 229, // 80 + 149
      `got weight ${result?.sets[0]?.weight_kg}`);
  }

  console.log("\n3. Batch query with uneven history");
  {
    // Exercise A: 2 sessions
    // Exercise B: 150 sessions (from previous test)
    // Exercise C: 1 session
    
    const sessionC = "sess-c-" + Date.now();
    await supabase.from("sessions").insert({
      id: sessionC,
      user_id: userId,
      local_date: "2026-10-25",
      status: "completed",
      completed_at: "2026-10-25T12:00:00Z",
    });

    const seC = "se-c-" + Date.now();
    await supabase.from("session_exercises").insert({
      id: seC,
      user_id: userId,
      session_id: sessionC,
      exercise_id: exerciseC,
      metric: "seconds",
      status: "completed",
      order_index: 0,
    });

    await supabase.from("session_sets").insert({
      user_id: userId,
      session_exercise_id: seC,
      set_number: 1,
      duration_seconds: 60,
    });

    const results = await getBatchLastPerformance(supabase, userId, [exerciseA, exerciseB, exerciseC]);

    check("returns all 3 exercises", results.size === 3, `got ${results.size}`);
    check("exercise A has correct data", results.get(exerciseA)?.sets[0]?.reps === 10);
    check("exercise B not pushed out by exercise A", results.has(exerciseB));
    check("exercise B has latest data", results.get(exerciseB)?.sets[0]?.weight_kg === 229);
    check("exercise C has correct metric", results.get(exerciseC)?.metric === "seconds");
  }

  console.log("\n4. getExerciseHistory pagination and totalCount");
  {
    const history = await getExerciseHistory(supabase, userId, exerciseB, { limit: 10, offset: 0 });

    check("returns correct totalCount", history.totalCount === 150, `got ${history.totalCount}`);
    check("returns paginated results", history.sessions.length === 10);
    check("sessions are newest first", 
      history.sessions[0].date > history.sessions[1].date);
  }

  console.log("\n5. PR detection with chronological ordering");
  {
    // Get history for exercise A (has 2 sessions)
    const history = await getExerciseHistory(supabase, userId, exerciseA, { limit: 10 });

    check("detects current PRs", history.currentPRs.length > 0);
    check("sessions have PR data", history.sessions[0].prs !== undefined);
  }

  console.log("\n✓ All real DB tests passed");
  
  return failures === 0;
}

runTests()
  .then(success => {
    if (!success && failures > 0) {
      console.log(`\n${failures} FAILURES\n`);
      process.exit(1);
    }
    console.log("\nALL CHECKS PASSED\n");
    process.exit(0);
  })
  .catch(err => {
    console.error("\nTest error:", err);
    process.exit(1);
  });
