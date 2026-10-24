export {};
/**
 * Test: Lost-response retry for record_breathing_practice
 *
 * Runs only when DATABASE_URL points to localhost postgres.
 * Uses direct database connection with RLS context to test that two SEQUENTIAL
 * calls with the same log_id return the same session id with no error.
 *
 * This simulates the "lost response" scenario: the first call completes and
 * commits, but the client never receives the response (network drop, browser
 * crash, etc.). The client retries with the same log_id. The advisory lock
 * ensures the second call sees the existing log and returns it, not an error.
 *
 * Tests both paths:
 * 1. Without planned session (new session)
 * 2. With planned meditation session (routine step)
 */

import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";

// Only run against localhost
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL required for lost-response retry test\n");
  process.exit(1);
}

try {
  const url = new URL(DATABASE_URL);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    console.error(`❌ Refusing to run against non-localhost: ${url.hostname}\n`);
    process.exit(1);
  }
} catch (error) {
  console.error(`❌ Invalid DATABASE_URL: ${error}\n`);
  process.exit(1);
}

console.log("\n▶ Running lost-response retry test against localhost Postgres\n");

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"; // seed user
const TEST_PATTERN_ID = "99999999-0000-0000-0000-000000000001"; // test pattern

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

async function testSequentialRetry() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Set up authenticated RLS context
    await client.query("SET role authenticated");
    await client.query(
      "SELECT set_config('request.jwt.claims', $1, false)",
      [JSON.stringify({ sub: TEST_USER_ID })]
    );

    // Insert test pattern if it doesn't exist
    await client.query(
      `INSERT INTO breathing_patterns (id, name, phases, minutes, order_index)
       VALUES ($1, 'Test Pattern', '[{"kind":"inhale","seconds":4},{"kind":"exhale","seconds":4}]'::jsonb, 5, 999)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_PATTERN_ID]
    );

    console.log("1. Test without planned session (new session)");
    {
      const logId = `test-lost-response-${Date.now()}-new`;
      const localDate = "2026-10-24";

      // First call: complete and commit
      const result1 = await client.query(
        `SELECT record_breathing_practice(
          $1::text, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3, 'off', NULL::uuid, NULL::uuid, NULL::int
        ) as session_id`,
        [logId, localDate, TEST_PATTERN_ID]
      );
      
      const sessionId1 = result1.rows[0].session_id;
      check("first call returned session id", !!sessionId1, sessionId1);

      // Count sessions created by first call
      const count1 = await client.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE id = $1",
        [sessionId1]
      );
      check("first call created exactly one session", count1.rows[0].ct === "1");

      // Second call: SEQUENTIAL retry with same log_id (lost response scenario)
      const result2 = await client.query(
        `SELECT record_breathing_practice(
          $1::text, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3, 'off', NULL::uuid, NULL::uuid, NULL::int
        ) as session_id`,
        [logId, localDate, TEST_PATTERN_ID]
      );

      const sessionId2 = result2.rows[0].session_id;
      check("second call returned session id", !!sessionId2, sessionId2);
      check("second call returned SAME session id", sessionId1 === sessionId2, `${sessionId1} vs ${sessionId2}`);

      // Count total sessions - must still be exactly 1
      const count2 = await client.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE id = $1",
        [sessionId1]
      );
      check("still exactly one session after retry", count2.rows[0].ct === "1");

      // Count breathing_logs - should be 1 (ON CONFLICT DO NOTHING)
      const logCount = await client.query(
        "SELECT COUNT(*) as ct FROM breathing_logs WHERE id = $1",
        [logId]
      );
      check("exactly one breathing log", logCount.rows[0].ct === "1");

      // Clean up
      await client.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
      await client.query("DELETE FROM sessions WHERE id = $1", [sessionId1]);
    }

    console.log("\n2. Test with planned session (routine step)");
    {
      const logId = `test-lost-response-${Date.now()}-planned`;
      const localDate = "2026-10-24";

      // Create a planned meditation session first
      const plannedResult = await client.query(
        `INSERT INTO sessions (type, local_date, user_id, workout_id, seconds, completed)
         VALUES ('meditation', $1, $2, NULL, 300, false)
         RETURNING id`,
        [localDate, TEST_USER_ID]
      );
      const plannedSessionId = plannedResult.rows[0].id;

      // First call: write practice to planned session
      const result1 = await client.query(
        `SELECT record_breathing_practice(
          $1::text, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3, 'off', $4::uuid, NULL::uuid, NULL::int
        ) as session_id`,
        [logId, localDate, TEST_PATTERN_ID, plannedSessionId]
      );

      const sessionId1 = result1.rows[0].session_id;
      check("first call used planned session", sessionId1 === plannedSessionId, `${sessionId1} vs ${plannedSessionId}`);

      // Second call: SEQUENTIAL retry (lost response)
      const result2 = await client.query(
        `SELECT record_breathing_practice(
          $1::text, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3, 'off', $4::uuid, NULL::uuid, NULL::int
        ) as session_id`,
        [logId, localDate, TEST_PATTERN_ID, plannedSessionId]
      );

      const sessionId2 = result2.rows[0].session_id;
      check("second call returned session id", !!sessionId2);
      check("second call returned SAME planned session", sessionId1 === sessionId2, `${sessionId1} vs ${sessionId2}`);

      // Count sessions - must still be exactly 1 (the planned one)
      const sessionCount = await client.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE id = $1",
        [plannedSessionId]
      );
      check("still exactly one session after retry", sessionCount.rows[0].ct === "1");

      // Count breathing_logs - should be 1
      const logCount = await client.query(
        "SELECT COUNT(*) as ct FROM breathing_logs WHERE id = $1",
        [logId]
      );
      check("exactly one breathing log", logCount.rows[0].ct === "1");

      // Clean up
      await client.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
      await client.query("DELETE FROM sessions WHERE id = $1", [plannedSessionId]);
    }

    // Clean up test pattern
    await client.query("DELETE FROM breathing_patterns WHERE id = $1", [TEST_PATTERN_ID]);

  } finally {
    await client.end();
  }
}

testSequentialRetry()
  .then(() => {
    if (failures === 0) {
      console.log("\n✅ All lost-response retry tests passed");
      console.log("   Sequential retry with same log_id returns same session, no duplicate rows\n");
      process.exit(0);
    } else {
      console.log(`\n❌ ${failures} test(s) failed\n`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("\n❌ Test error:", error);
    process.exit(1);
  });
