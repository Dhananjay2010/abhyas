export {};
/**
 * Test: Concurrency race guard for record_breathing_practice
 *
 * Runs only when DATABASE_URL points to localhost postgres.
 * Uses direct database connection with RLS context to test that two concurrent
 * transactions with the same log_id create exactly one session.
 *
 * Tests three paths:
 * 1. Without planned session (new session created)
 * 2. With planned meditation session (reuses planned row)
 * 3. Routine step (first call creates session, second reuses it)
 *
 * IMPORTANT: This test FAILS with the advisory lock removed, proving the guard works.
 */

import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";

// Only run against localhost
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL required for concurrency test\n");
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

console.log("\n▶ Running concurrency test against localhost Postgres\n");

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"; // seed user
const FAR_OFF_DATE = "2099-12-31"; // far in future to avoid interfering with real data

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

async function testConcurrentRace() {
  const client1 = new Client({ connectionString: DATABASE_URL });
  const client2 = new Client({ connectionString: DATABASE_URL });
  await client1.connect();
  await client2.connect();

  try {
    // Get box-breathing pattern id from seed data
    const patternResult = await client1.query(
      "SELECT id FROM breathing_patterns WHERE slug = 'box-breathing'"
    );
    if (patternResult.rows.length === 0) {
      throw new Error("box-breathing pattern not found in seed data");
    }
    const PATTERN_ID = patternResult.rows[0].id;

    console.log("1. Test concurrent calls without planned session (new session path)");
    {
      const logId = crypto.randomUUID();

      // Start both transactions
      await client1.query("BEGIN");
      await client2.query("BEGIN");

      // Set up RLS context for both
      await client1.query("SET LOCAL role authenticated");
      await client1.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );
      await client2.query("SET LOCAL role authenticated");
      await client2.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      // Run concurrent calls with same log_id
      const promise1 = client1.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      // Add a small delay to increase chance of race
      await new Promise(resolve => setTimeout(resolve, 10));

      const promise2 = client2.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      const [result1, result2] = await Promise.all([promise1, promise2]);

      await client1.query("COMMIT");
      await client2.query("COMMIT");

      const sessionId1 = result1.rows[0].session_id;
      const sessionId2 = result2.rows[0].session_id;

      check("both calls returned session id", !!(sessionId1 && sessionId2));
      check("both calls returned SAME session id", sessionId1 === sessionId2, `${sessionId1} vs ${sessionId2}`);

      // Count sessions created
      const sessionCount = await client1.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE user_id = $1 AND local_date = $2",
        [TEST_USER_ID, FAR_OFF_DATE]
      );
      check("exactly ONE session created", sessionCount.rows[0].ct === "1");

      // Count logs created
      const logCount = await client1.query(
        "SELECT COUNT(*) as ct FROM breathing_logs WHERE id = $1",
        [logId]
      );
      check("exactly ONE breathing log", logCount.rows[0].ct === "1");

      // Clean up
      await client1.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
      await client1.query("DELETE FROM sessions WHERE user_id = $1 AND local_date = $2", [TEST_USER_ID, FAR_OFF_DATE]);
    }

    console.log("\n2. Test concurrent calls with planned session (planned row path)");
    {
      const logId = crypto.randomUUID();

      // Create planned meditation session
      const plannedResult = await client1.query(
        `INSERT INTO sessions (user_id, local_date, planned_type, status)
         VALUES ($1, $2, 'meditation', 'planned')
         RETURNING id`,
        [TEST_USER_ID, FAR_OFF_DATE]
      );
      const plannedSessionId = plannedResult.rows[0].id;

      // Start both transactions
      await client1.query("BEGIN");
      await client2.query("BEGIN");

      // Set up RLS context
      await client1.query("SET LOCAL role authenticated");
      await client1.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );
      await client2.query("SET LOCAL role authenticated");
      await client2.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      // Concurrent calls
      const promise1 = client1.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      const promise2 = client2.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId, FAR_OFF_DATE, PATTERN_ID]
      );

      const [result1, result2] = await Promise.all([promise1, promise2]);

      await client1.query("COMMIT");
      await client2.query("COMMIT");

      const sessionId1 = result1.rows[0].session_id;
      const sessionId2 = result2.rows[0].session_id;

      check("both calls reused planned session", sessionId1 === plannedSessionId && sessionId2 === plannedSessionId);

      // Count sessions - should still be exactly 1 (the planned one)
      const sessionCount = await client1.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE user_id = $1 AND local_date = $2",
        [TEST_USER_ID, FAR_OFF_DATE]
      );
      check("still exactly ONE session (planned)", sessionCount.rows[0].ct === "1");

      // Clean up
      await client1.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
      await client1.query("DELETE FROM sessions WHERE user_id = $1 AND local_date = $2", [TEST_USER_ID, FAR_OFF_DATE]);
    }

    console.log("\n3. Test routine step path (second call passes p_session_id)");
    {
      const logId1 = crypto.randomUUID();
      const logId2 = crypto.randomUUID();

      // First call creates the session
      await client1.query("BEGIN");
      await client1.query("SET LOCAL role authenticated");
      await client1.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const result1 = await client1.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id`,
        [logId1, FAR_OFF_DATE, PATTERN_ID]
      );
      await client1.query("COMMIT");

      const sessionId = result1.rows[0].session_id;
      check("first step created session", !!sessionId);

      // Now concurrent calls passing p_session_id (routine step 2)
      await client1.query("BEGIN");
      await client2.query("BEGIN");

      await client1.query("SET LOCAL role authenticated");
      await client1.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );
      await client2.query("SET LOCAL role authenticated");
      await client2.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: TEST_USER_ID })]
      );

      const promise1 = client1.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          $4::uuid, NULL::uuid, 2::smallint
        ) as session_id`,
        [logId2, FAR_OFF_DATE, PATTERN_ID, sessionId]
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      const promise2 = client2.query(
        `SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 40, false, 3::smallint, 'off',
          $4::uuid, NULL::uuid, 2::smallint
        ) as session_id`,
        [logId2, FAR_OFF_DATE, PATTERN_ID, sessionId]
      );

      const [result2a, result2b] = await Promise.all([promise1, promise2]);

      await client1.query("COMMIT");
      await client2.query("COMMIT");

      check("both routine step calls returned same session", result2a.rows[0].session_id === result2b.rows[0].session_id);
      check("routine step reused existing session", result2a.rows[0].session_id === sessionId);

      // Count sessions - still just 1
      const sessionCount = await client1.query(
        "SELECT COUNT(*) as ct FROM sessions WHERE user_id = $1 AND local_date = $2",
        [TEST_USER_ID, FAR_OFF_DATE]
      );
      check("still exactly ONE session for routine", sessionCount.rows[0].ct === "1");

      // Clean up
      await client1.query("DELETE FROM breathing_logs WHERE session_id = $1", [sessionId]);
      await client1.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    }

  } finally {
    await client1.end();
    await client2.end();
  }
}

testConcurrentRace()
  .then(() => {
    if (failures === 0) {
      console.log("\n✅ All concurrency race tests passed");
      console.log("   Advisory lock prevents duplicate sessions from concurrent calls\n");
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
