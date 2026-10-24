export {};
/**
 * Test: Concurrency race guard for record_breathing_practice
 *
 * Runs only when DATABASE_URL points to localhost postgres.
 * Uses direct database connection with RLS context to test that two concurrent
 * transactions with the same log_id create exactly one session.
 *
 * Tests both paths:
 * 1. Without planned session (new session)
 * 2. With planned meditation session (routine step)
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
const TEST_PATTERN_ID = "99999999-0000-0000-0000-000000000001"; // test pattern

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

async function testConcurrentCalls() {
  const clientA = new Client({ connectionString: DATABASE_URL });
  const clientB = new Client({ connectionString: DATABASE_URL });
  
  try {
    await clientA.connect();
    await clientB.connect();
    
    // Set up test pattern
    await clientA.query("DELETE FROM breathing_patterns WHERE id = $1", [TEST_PATTERN_ID]);
    await clientA.query(`
      INSERT INTO breathing_patterns (id, slug, name, subtitle, description, phases, max_cycles)
      VALUES ($1, 'test-race', 'Test Race', NULL, 'Test pattern', 
              '[{"kind":"breathe_in","seconds":4},{"kind":"hold","seconds":4},{"kind":"breathe_out","seconds":4},{"kind":"hold","seconds":4}]'::jsonb,
              10)
    `, [TEST_PATTERN_ID]);
    
    const today = new Date().toISOString().split("T")[0]; // Use local date in practice
    const logId = "99999999-0000-0000-0000-000000000099";
    
    console.log("1. Concurrent calls without planned session (new session path)");
    
    // Clean up any existing test data
    await clientA.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
    await clientA.query(`
      DELETE FROM sessions 
      WHERE user_id = $1 AND local_date = $2 AND actual_type = 'meditation'
    `, [TEST_USER_ID, today]);
    
    // Set RLS context for both clients
    await clientA.query("SET LOCAL role = authenticated");
    await clientA.query(
      "SELECT set_config('request.jwt.claims', $1, true)",
      [`{"sub":"${TEST_USER_ID}","role":"authenticated"}`]
    );
    
    await clientB.query("SET LOCAL role = authenticated");
    await clientB.query(
      "SELECT set_config('request.jwt.claims', $1, true)",
      [`{"sub":"${TEST_USER_ID}","role":"authenticated"}`]
    );
    
    // Start transaction A, call function, sleep, then commit
    await clientA.query("BEGIN");
    const promiseA = (async () => {
      const resultA = await clientA.query(`
        SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid, 
          5, 5, 20, 240, false, NULL::smallint, 'audio', 
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id
      `, [logId, today, TEST_PATTERN_ID]);
      await clientA.query("SELECT pg_sleep(0.5)");
      await clientA.query("COMMIT");
      return resultA.rows[0].session_id;
    })();
    
    // Start transaction B immediately, try same log_id
    await new Promise(resolve => setTimeout(resolve, 100)); // Let A get ahead
    await clientB.query("BEGIN");
    const promiseB = (async () => {
      const resultB = await clientB.query(`
        SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          5, 5, 20, 240, false, NULL::smallint, 'audio',
          NULL::uuid, NULL::uuid, NULL::smallint
        ) as session_id
      `, [logId, today, TEST_PATTERN_ID]);
      await clientB.query("COMMIT");
      return resultB.rows[0].session_id;
    })();
    
    const [sessionIdA, sessionIdB] = await Promise.all([promiseA, promiseB]);
    
    check("both calls succeeded", sessionIdA && sessionIdB);
    check("both returned same session_id", sessionIdA === sessionIdB);
    
    // Check actual sessions created
    const sessionsResult = await clientA.query(`
      SELECT id, duration_seconds FROM sessions
      WHERE user_id = $1 AND local_date = $2 AND actual_type = 'meditation'
    `, [TEST_USER_ID, today]);
    
    check("exactly 1 session created", sessionsResult.rows.length === 1, 
      `found ${sessionsResult.rows.length}`);
    
    if (sessionsResult.rows.length > 0) {
      check("session duration is 240s (not doubled)", 
        sessionsResult.rows[0].duration_seconds === 240,
        `got ${sessionsResult.rows[0].duration_seconds}s`);
    }
    
    // Check logs
    const logsResult = await clientA.query(
      "SELECT id FROM breathing_logs WHERE id = $1",
      [logId]
    );
    check("exactly 1 log created", logsResult.rows.length === 1);
    
    console.log("\n2. Concurrent calls with planned session (routine step path)");
    
    const logId2 = "99999999-0000-0000-0000-000000000098";
    await clientA.query("DELETE FROM breathing_logs WHERE id = $1", [logId2]);
    
    // Create planned meditation session
    const plannedResult = await clientA.query(`
      INSERT INTO sessions (user_id, local_date, planned_type, status)
      VALUES ($1, $2, 'meditation', 'pending')
      RETURNING id
    `, [TEST_USER_ID, today]);
    const plannedSessionId = plannedResult.rows[0].id;
    
    // Reset RLS context
    await clientA.query("SET LOCAL role = authenticated");
    await clientA.query(
      "SELECT set_config('request.jwt.claims', $1, true)",
      [`{"sub":"${TEST_USER_ID}","role":"authenticated"}`]
    );
    await clientB.query("SET LOCAL role = authenticated");
    await clientB.query(
      "SELECT set_config('request.jwt.claims', $1, true)",
      [`{"sub":"${TEST_USER_ID}","role":"authenticated"}`]
    );
    
    // Transaction A with planned session
    await clientA.query("BEGIN");
    const promiseA2 = (async () => {
      const resultA = await clientA.query(`
        SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          3, 3, 12, 180, false, NULL::smallint, 'silent',
          $4::uuid, NULL::uuid, NULL::smallint
        ) as session_id
      `, [logId2, today, TEST_PATTERN_ID, plannedSessionId]);
      await clientA.query("SELECT pg_sleep(0.5)");
      await clientA.query("COMMIT");
      return resultA.rows[0].session_id;
    })();
    
    // Transaction B with same planned session
    await new Promise(resolve => setTimeout(resolve, 100));
    await clientB.query("BEGIN");
    const promiseB2 = (async () => {
      const resultB = await clientB.query(`
        SELECT record_breathing_practice(
          $1::uuid, $2::date, $3::uuid, NULL::uuid,
          3, 3, 12, 180, false, NULL::smallint, 'silent',
          $4::uuid, NULL::uuid, NULL::smallint
        ) as session_id
      `, [logId2, today, TEST_PATTERN_ID, plannedSessionId]);
      await clientB.query("COMMIT");
      return resultB.rows[0].session_id;
    })();
    
    const [sessionIdA2, sessionIdB2] = await Promise.all([promiseA2, promiseB2]);
    
    check("both calls succeeded (planned path)", sessionIdA2 && sessionIdB2);
    check("both returned planned session_id", 
      sessionIdA2 === plannedSessionId && sessionIdB2 === plannedSessionId);
    
    // Check planned session wasn't duplicated or double-counted
    const plannedSessionResult = await clientA.query(
      "SELECT duration_seconds FROM sessions WHERE id = $1",
      [plannedSessionId]
    );
    
    check("planned session duration is 180s (not doubled)",
      plannedSessionResult.rows[0].duration_seconds === 180,
      `got ${plannedSessionResult.rows[0].duration_seconds}s`);
    
    const logs2Result = await clientA.query(
      "SELECT id FROM breathing_logs WHERE id = $1",
      [logId2]
    );
    check("exactly 1 log for planned path", logs2Result.rows.length === 1);
    
  } finally {
    // Clean up
    try {
      await clientA.query("DELETE FROM breathing_logs WHERE id IN ($1, $2)", 
        ["99999999-0000-0000-0000-000000000099", "99999999-0000-0000-0000-000000000098"]);
      await clientA.query("DELETE FROM sessions WHERE user_id = $1 AND actual_type = 'meditation'", 
        [TEST_USER_ID]);
      await clientA.query("DELETE FROM breathing_patterns WHERE id = $1", [TEST_PATTERN_ID]);
    } catch {
      // Cleanup errors are non-fatal
    }
    await clientA.end();
    await clientB.end();
  }
}

testConcurrentCalls()
  .then(() => {
    if (failures > 0) {
      console.error(`\n❌ ${failures} check(s) failed\n`);
      console.error("NOTE: This test SHOULD pass with the advisory lock present.");
      console.error("      It will FAIL if you remove 'perform pg_advisory_xact_lock' from the migration.\n");
      process.exit(1);
    }
    console.log("\n✅ All concurrency tests passed\n");
    console.log("NOTE: Remove the advisory lock from the migration to verify this test catches the race.\n");
  })
  .catch((err) => {
    console.error("\n❌ Test error:", err);
    process.exit(1);
  });
