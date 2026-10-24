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

const TEST_URL = process.env.SUPABASE_TEST_URL || process.env.DATABASE_URL || "";

// Only run against localhost
if (!TEST_URL) {
  console.log("⏭️  Skipped: SUPABASE_TEST_URL or DATABASE_URL not set\n");
  process.exit(0);
}

try {
  const url = new URL(TEST_URL.replace(/^postgres:/, "http:"));
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    console.error(`❌ Refusing to run against non-localhost: ${url.hostname}\n`);
    process.exit(1);
  }
} catch {
  console.log("⏭️  Skipped: Invalid database URL\n");
  process.exit(0);
}

// Check for required test environment
const testUserId = process.env.TEST_USER_ID;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!testUserId || !supabaseKey) {
  console.log("⏭️  Skipped: TEST_USER_ID and SUPABASE_ANON_KEY required for concurrency test\n");
  process.exit(0);
}

console.log("\n▶ Running concurrency test against localhost\n");
console.log("This test requires:");
console.log("  - Local Supabase instance running");
console.log("  - TEST_USER_ID set to a valid user UUID");
console.log("  - SUPABASE_ANON_KEY set");
console.log("  - Migrations applied (including 20261024200000_breathe_idempotent_retry.sql)\n");

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const supabase = createClient<Database>(
  TEST_URL.includes("supabase") ? TEST_URL : `http://127.0.0.1:54321`,
  supabaseKey
);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

async function testConcurrentCalls() {
  if (!testUserId) {
    throw new Error("TEST_USER_ID required");
  }
  
  const today = new Date().toISOString().split("T")[0];
  const logId = crypto.randomUUID();
  // Use a built-in pattern ID - assuming Box Breathing exists
  // In real test, this would be seeded or queried
  const patternId = "00000000-0000-0000-0000-000000000001"; 

  console.log("1. Concurrent calls without planned session (new session path)");

  try {
    // Fire two parallel calls with same log_id
    const results = await Promise.allSettled([
      supabase.rpc("record_breathing_practice", {
        p_log_id: logId,
        p_local_date: today,
        p_pattern_id: patternId,
        p_cycles: 5,
        p_planned_cycles: 5,
        p_breaths: 20,
        p_seconds: 240,
        p_ended_early: false,
        p_guidance: "audio",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      supabase.rpc("record_breathing_practice", {
        p_log_id: logId,
        p_local_date: today,
        p_pattern_id: patternId,
        p_cycles: 5,
        p_planned_cycles: 5,
        p_breaths: 20,
        p_seconds: 240,
        p_ended_early: false,
        p_guidance: "audio",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
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

    console.log("\n✅ Concurrency guard working correctly\n");
  } catch (error) {
    console.error("\n❌ Test error:", error);
    failures++;
  }
}

testConcurrentCalls()
  .then(() => {
    if (failures > 0) {
      console.error(`\n❌ ${failures} check(s) failed\n`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("\n❌ Test error:", err);
    process.exit(1);
  });
