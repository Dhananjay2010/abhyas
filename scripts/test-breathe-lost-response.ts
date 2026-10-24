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
 * Tests three paths:
 * 1. Without planned session (new session created)
 * 2. With planned meditation session (reuses planned row)
 * 3. Routine step (first call creates session, second step reuses it)
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
const FAR_OFF_DATE = "2099-12-31"; // far in future

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
    // Get box-breathing pattern id
    const patternResult = await client.query(
      "SELECT id FROM breathing_patterns WHERE slug = 'box-breathing'"
    );
    if (patternResult.rows.length === 0) {
      throw new Error("box-breathing pattern not found in seed data");
    }
    const PATTERN_ID = patternResult.rows[0].id;

    console.log("1. Test without planned session (new session)");
    {
      const logId = crypto.randomUUID();

      // First call: complete and commit
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result1 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );
      
      await client.query("COMMIT");

      const sessionId1 = result1.rows[0].session_id;
      check("first call returned session id", !!sessionId1, sessionId1);

      // Count sessions created by first call
      const count1 = await client.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE id = $1",
        [sessionId1]
      );
      check("first call created exactly one session", count1.rows[0].ct === "1");

      // Second call: SEQUENTIAL retry with same log_id (lost response scenario)
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result2 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      await client.query("COMMIT");

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
      await client.query("DELETE FROM sessions WHERE user_id = $1 AND local_date = $2", [TEST_USER_ID, FAR_OFF_DATE]);
    }

    console.log("\n2. Test with planned session (routine step)");
    {
      const logId = crypto.randomUUID();

      // Create a planned meditation session first
      const plannedResult = await client.query(
        `INSERT INTO sessions (user_id, local_date, planned_type, status)
         VALUES ($1, $2, 'meditation', 'planned')
         RETURNING id`,
        [TEST_USER_ID, FAR_OFF_DATE]
      );
      const plannedSessionId = plannedResult.rows[0].id;

      // First call: write practice to planned session
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result1 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      await client.query("COMMIT");

      const sessionId1 = result1.rows[0].session_id;
      check("first call used planned session", sessionId1 === plannedSessionId, `${sessionId1} vs ${plannedSessionId}`);

      // Second call: SEQUENTIAL retry (lost response)
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result2 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      await client.query("COMMIT");

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
      await client.query("DELETE FROM sessions WHERE user_id = $1 AND local_date = $2", [TEST_USER_ID, FAR_OFF_DATE]);
    }

    console.log("\n3. Test routine step path (first creates, second step reuses)");
    {
      const logId1 = crypto.randomUUID();
      const logId2 = crypto.randomUUID();

      // First step creates session
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result1 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId1, FAR_OFF_DATE, PATTERN_ID]
      );
      await client.query("COMMIT");

      const sessionId = result1.rows[0].session_id;
      check("first routine step created session", !!sessionId);

      // Second step uses p_session_id
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result2 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          $4::uuid, NULL::uuid, 2::smallint
        ) as session_id`,
        [logId2, FAR_OFF_DATE, PATTERN_ID, sessionId]
      );
      await client.query("COMMIT");

      check("second routine step reused session", result2.rows[0].session_id === sessionId);

      // Retry second step (lost response)
      await client.query("BEGIN");
      await client.query("SET LOCAL role authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result3 = await client.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          $4::uuid, NULL::uuid, 2::smallint
        ) as session_id`,
        [logId2, FAR_OFF_DATE, PATTERN_ID, sessionId]
      );
      await client.query("COMMIT");

      check("retry of second step returned same session", result3.rows[0].session_id === sessionId);

      // Count logs - should be 2 (one per step)
      const logCount = await client.query(
        "SELECT COUNT(*) as ct FROM breathing_logs WHERE session_id = $1",
        [sessionId]
      );
      check("exactly two logs (one per step)", logCount.rows[0].ct === "2");

      // Clean up
      await client.query("DELETE FROM breathing_logs WHERE session_id = $1", [sessionId]);
      await client.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    }

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
