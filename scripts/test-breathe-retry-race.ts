export {};
/**
 * Test: Concurrency race guard for record_breathing_practice
 *
 * Runs only when SUPABASE_TEST_URL or DATABASE_URL points to localhost.
 * Tests that two concurrent calls with the same log_id create exactly one
 * session and don't double-count in weekly totals.
 *
 * Tests both paths:
 * 1. With a planned meditation session (routine step)
 * 2. Without (new session)
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const TEST_URL = process.env.SUPABASE_TEST_URL || process.env.DATABASE_URL || "";

// Only run against localhost
if (!TEST_URL) {
  console.log("⏭️  Skipped: SUPABASE_TEST_URL or DATABASE_URL not set\n");
  process.exit(0);
}

const url = new URL(TEST_URL.replace(/^postgres:/, "http:"));
if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
  console.error(`❌ Refusing to run against non-localhost: ${url.hostname}\n`);
  process.exit(1);
}

console.log(`\n▶ Running concurrency test against ${url.hostname}\n`);

const supabase = createClient<Database>(
  TEST_URL.includes("supabase") ? TEST_URL : `http://${url.hostname}:54321`,
  process.env.SUPABASE_ANON_KEY || "test-anon-key"
);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

type BreathingLog = Database["public"]["Tables"]["breathing_logs"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];

async function testConcurrentCalls() {
  // Get a test user (assumes you have auth set up; skip if not)
  const testUserId = process.env.TEST_USER_ID;
  if (!testUserId) {
    console.log("⏭️  Skipped: TEST_USER_ID not set (needed for RLS)\n");
    process.exit(0);
  }

  const today = new Date().toISOString().split("T")[0];
  const logId = crypto.randomUUID();
  const patternId = crypto.randomUUID(); // Assumes patterns exist or RLS is off

  console.log("1. Concurrent calls without planned session (new session path)");

  // Fire two parallel calls with same log_id
  const results = await Promise.allSettled([
    supabase.rpc("record_breathing_practice", {
      p_log_id: logId,
      p_local_date: today,
      p_pattern_id: patternId,
      p_user_pattern_id: null,
      p_cycles: 5,
      p_planned_cycles: 5,
      p_breaths: 20,
      p_seconds: 240,
      p_ended_early: false,
      p_mood_before: null,
      p_guidance: "audio",
    }),
    supabase.rpc("record_breathing_practice", {
      p_log_id: logId,
      p_local_date: today,
      p_pattern_id: patternId,
      p_user_pattern_id: null,
      p_cycles: 5,
      p_planned_cycles: 5,
      p_breaths: 20,
      p_seconds: 240,
      p_ended_early: false,
      p_mood_before: null,
      p_guidance: "audio",
    }),
  ]);

  const sessionIds = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ data: string }>).value.data);

  check("both calls succeeded", sessionIds.length === 2);
  check("both returned same session_id", sessionIds[0] === sessionIds[1]);

  // Count actual sessions
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, duration_seconds")
    .eq("user_id", testUserId)
    .eq("local_date", today)
    .eq("actual_type", "meditation");

  const sessionCount = sessions?.length || 0;
  check("exactly 1 session created", sessionCount === 1, `found ${sessionCount}`);

  if (sessions && sessions.length > 0) {
    check(
      "session duration is 240s (not doubled)",
      sessions[0].duration_seconds === 240,
      `got ${sessions[0].duration_seconds}s`
    );
  }

  // Check logs
  const { data: logs } = await supabase
    .from("breathing_logs")
    .select("id")
    .eq("id", logId);

  check("exactly 1 log created", logs?.length === 1, `found ${logs?.length || 0}`);

  // Check week total
  const { data: weekLogs } = await supabase
    .from("breathing_logs")
    .select("seconds")
    .eq("user_id", testUserId)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const weekTotal = weekLogs?.reduce((sum, log) => sum + (log.seconds || 0), 0) || 0;
  check(
    "week total counts session once",
    weekTotal === 240,
    `total ${weekTotal}s`
  );

  console.log("\n2. Concurrent calls with planned session (routine step path)");

  // Create a planned meditation session first
  const { data: plannedSession } = await supabase
    .from("sessions")
    .insert({
      user_id: testUserId,
      local_date: today,
      planned_type: "meditation",
      status: "pending",
    })
    .select("id")
    .single();

  if (!plannedSession) {
    check("planned session created", false, "insert failed");
    return;
  }

  const logId2 = crypto.randomUUID();

  const results2 = await Promise.allSettled([
    supabase.rpc("record_breathing_practice", {
      p_log_id: logId2,
      p_local_date: today,
      p_pattern_id: patternId,
      p_user_pattern_id: null,
      p_cycles: 3,
      p_planned_cycles: 3,
      p_breaths: 12,
      p_seconds: 180,
      p_ended_early: false,
      p_mood_before: null,
      p_guidance: "silent",
      p_session_id: plannedSession.id,
    }),
    supabase.rpc("record_breathing_practice", {
      p_log_id: logId2,
      p_local_date: today,
      p_pattern_id: patternId,
      p_user_pattern_id: null,
      p_cycles: 3,
      p_planned_cycles: 3,
      p_breaths: 12,
      p_seconds: 180,
      p_ended_early: false,
      p_mood_before: null,
      p_guidance: "silent",
      p_session_id: plannedSession.id,
    }),
  ]);

  const sessionIds2 = results2
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ data: string }>).value.data);

  check("both calls succeeded (planned path)", sessionIds2.length === 2);
  check("both returned planned session_id", sessionIds2[0] === plannedSession.id);

  // Check planned session wasn't duplicated
  const { data: updatedSession } = await supabase
    .from("sessions")
    .select("duration_seconds")
    .eq("id", plannedSession.id)
    .single();

  check(
    "planned session duration is 180s (not doubled)",
    updatedSession?.duration_seconds === 180,
    `got ${updatedSession?.duration_seconds}s`
  );

  const { data: logs2 } = await supabase
    .from("breathing_logs")
    .select("id")
    .eq("id", logId2);

  check("exactly 1 log for planned path", logs2?.length === 1);
}

testConcurrentCalls()
  .then(() => {
    if (failures > 0) {
      console.error(`\n❌ ${failures} check(s) failed\n`);
      process.exit(1);
    }
    console.log("\n✅ All concurrency tests passed\n");
  })
  .catch((err) => {
    console.error("\n❌ Test error:", err);
    process.exit(1);
  });
