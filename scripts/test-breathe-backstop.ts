export {};
/**
 * Test: Backstop duplicate detection in record_breathing_practice
 *
 * Runs only when DATABASE_URL points to localhost postgres.
 * Tests that the backstop (duplicate detection without advisory lock) prevents orphan sessions.
 *
 * This test creates a temporary copy of the function with the advisory lock line removed,
 * simulates a duplicate insertion by pre-creating a log+session, then calls the function
 * and verifies it returns the existing session_id and deletes any orphan.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:breathe-backstop
 */

import { Client } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL || "";

// Only run against localhost
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL required for backstop test\n");
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

console.log("\n▶ Running backstop test against localhost Postgres\n");

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"; // seed user
const FAR_OFF_DATE = "2099-12-31"; // far in future to avoid interfering with real data

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

async function testBackstop() {
  const client = new Client({ connectionString: DATABASE_URL });
  const client1 = new Client({ connectionString: DATABASE_URL });
  const client2 = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client1.connect();
  await client2.connect();

  try {
    // Set statement and lock timeouts to prevent hanging
    await client.query("SET statement_timeout = '15s'");
    await client.query("SET lock_timeout = '10s'");

    console.log("1. Read migration and create test function without advisory lock");
    
    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase/migrations/20261025000014_breathe_idempotent_retry.sql');
    const migrationContent = readFileSync(migrationPath, 'utf-8');
    
    // Extract the function body (from create or replace function to the final $$)
    const functionMatch = migrationContent.match(
      /create or replace function public\.record_breathing_practice\([^)]+\)\s+returns uuid\s+language plpgsql\s+security invoker\s+set search_path = public\s+as \$fn\$([\s\S]+?)\$fn\$;/i
    );
    
    if (!functionMatch) {
      throw new Error("Could not find function definition in migration file");
    }
    
    let functionBody = functionMatch[1];
    
    // Strip the advisory lock line
    const lockLine = "perform pg_advisory_xact_lock(hashtextextended(p_log_id::text, 0));";
    const originalBody = functionBody;
    functionBody = functionBody.replace(new RegExp(`\\s*${lockLine.replace(/[()]/g, '\\$&')}\\s*`, 'g'), '\n  -- ADVISORY LOCK REMOVED FOR TEST\n  ');
    
    check("advisory lock line found and removed", functionBody !== originalBody && !functionBody.includes(lockLine));
    
    // Create the test function in public schema with unique name
    await client.query(`
      CREATE OR REPLACE FUNCTION public.record_breathing_practice_no_lock(
        p_log_id          uuid,
        p_local_date      date,
        p_pattern_id      uuid,
        p_user_pattern_id uuid,
        p_cycles          int,
        p_planned_cycles  int,
        p_breaths         int,
        p_seconds         int,
        p_ended_early     boolean,
        p_mood_before     smallint,
        p_guidance        text,
        p_session_id      uuid   default null,
        p_routine_id      uuid   default null,
        p_routine_step    smallint default null
      ) RETURNS uuid
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = public
      AS $fn$${functionBody}$fn$;
    `);
    
    console.log("\n2. Test backstop: pre-insert session+log, call function with same log_id");
    {
      await client.query("BEGIN");
      
      try {
        // Set RLS context
        await client.query("SET LOCAL role authenticated");
        await client.query(
          "SELECT set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ sub: TEST_USER_ID })]
        );
        
        // Get box-breathing pattern id
        const patternResult = await client.query(
          "SELECT id FROM breathing_patterns WHERE slug = 'box-breathing'"
        );
        if (patternResult.rows.length === 0) {
          throw new Error("box-breathing pattern not found");
        }
        const PATTERN_ID = patternResult.rows[0].id;
        
        const logId = crypto.randomUUID();
        
        // Pre-insert a session and log (simulating the "first" caller that won the race)
        const preSession = await client.query(
          `INSERT INTO sessions (user_id, local_date, planned_type, actual_type, status, started_at, completed_at, duration_seconds, breathing_pattern_id)
           VALUES ($1, $2, 'meditation', 'meditation', 'completed', now() - interval '40 seconds', now(), 40, $3)
           RETURNING id`,
          [TEST_USER_ID, FAR_OFF_DATE, PATTERN_ID]
        );
        const existingSessionId = preSession.rows[0].id;
        
        await client.query(
          `INSERT INTO breathing_logs (id, user_id, session_id, pattern_id, user_pattern_id, pattern_name, routine_id, routine_name, routine_step, cycles_completed, planned_cycles, breaths, seconds, ended_early, mood_before, guidance)
           VALUES ($1, $2, $3, $4, NULL, 'Box Breathing', NULL, NULL, NULL, 5, 5, 20, 40, false, 3, 'off')`,
          [logId, TEST_USER_ID, existingSessionId, PATTERN_ID]
        );
        
        check("pre-inserted existing session+log", true, existingSessionId);
        
        // Now call the test function without advisory lock
        // This simulates the "second" caller that arrives after the first already inserted
        const result = await client.query(
          `SELECT public.record_breathing_practice_no_lock($1::uuid, $2::date, $3::uuid, NULL::uuid, 5, 5, 20, 40, false, 3::smallint, 'off', NULL::uuid, NULL::uuid, NULL::smallint) as session_id`,
          [logId, FAR_OFF_DATE, PATTERN_ID]
        );
        
        const returnedSessionId = result.rows[0].session_id;
        
        check("function returned existing session_id", returnedSessionId === existingSessionId, `returned ${returnedSessionId}`);
        
        // Verify exactly one session exists (no orphan created)
        const sessionCount = await client.query(
          "SELECT COUNT(*) as ct FROM sessions WHERE user_id = $1 AND local_date = $2",
          [TEST_USER_ID, FAR_OFF_DATE]
        );
        check("exactly ONE session (no orphan)", sessionCount.rows[0].ct === "1");
        
        // Verify exactly one log exists
        const logCount = await client.query(
          "SELECT COUNT(*) as ct FROM breathing_logs WHERE id = $1",
          [logId]
        );
        check("exactly ONE log", logCount.rows[0].ct === "1");
        
      } finally {
        // Roll back to clean up
        await client.query("ROLLBACK");
      }
    }
    
    console.log("\n3. Test backstop with real concurrent calls (no-lock variant)");
    {
      await client1.query("BEGIN");
      await client2.query("BEGIN");
      
      try {
        // Set RLS context for both
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
        
        const patternResult = await client1.query(
          "SELECT id FROM breathing_patterns WHERE slug = 'box-breathing'"
        );
        const PATTERN_ID = patternResult.rows[0].id;
        
        const logId = crypto.randomUUID();
        
        // Client1 calls the no-lock variant and keeps transaction open
        const promise1 = client1.query(
          `SELECT public.record_breathing_practice_no_lock($1::uuid, $2::date, $3::uuid, NULL::uuid, 5, 5, 20, 40, false, 3::smallint, 'off', NULL::uuid, NULL::uuid, NULL::smallint) as session_id`,
          [logId, FAR_OFF_DATE, PATTERN_ID]
        );
        
        // Wait a bit for client1 to insert
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Client2 calls the no-lock variant - will hit ON CONFLICT and trigger backstop
        const promise2 = client2.query(
          `SELECT public.record_breathing_practice_no_lock($1::uuid, $2::date, $3::uuid, NULL::uuid, 5, 5, 20, 40, false, 3::smallint, 'off', NULL::uuid, NULL::uuid, NULL::smallint) as session_id`,
          [logId, FAR_OFF_DATE, PATTERN_ID]
        );
        
        // Get results
        const result1 = await promise1;
        await client1.query("COMMIT");
        
        const result2 = await promise2;
        await client2.query("COMMIT");
        
        const session1 = result1.rows[0].session_id;
        const session2 = result2.rows[0].session_id;
        
        check("backstop: both returned session ids", !!(session1 && session2));
        check("backstop: both returned SAME session id", session1 === session2, `${session1} vs ${session2}`);
        
        // Verify exactly one session exists (backstop deleted the orphan)
        const sessionCount = await client.query(
          "SELECT COUNT(*) as ct FROM sessions WHERE user_id = $1 AND local_date = $2",
          [TEST_USER_ID, FAR_OFF_DATE]
        );
        check("backstop: exactly ONE session remains", sessionCount.rows[0].ct === "1");
        
        // Verify exactly one log exists
        const logCount = await client.query(
          "SELECT COUNT(*) as ct FROM breathing_logs WHERE id = $1",
          [logId]
        );
        check("backstop: exactly ONE log", logCount.rows[0].ct === "1");
        
        // Clean up
        await client.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
        await client.query("DELETE FROM sessions WHERE user_id = $1 AND local_date = $2", [TEST_USER_ID, FAR_OFF_DATE]);
        
      } catch (error) {
        try { await client1.query("ROLLBACK"); } catch {}
        try { await client2.query("ROLLBACK"); } catch {}
        throw error;
      }
    }
    
    console.log("\n4. Test planned session survives backstop");
    {
      await client1.query("BEGIN");
      await client2.query("BEGIN");
      
      try {
        // Set RLS context for both
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
        
        const patternResult = await client1.query(
          "SELECT id FROM breathing_patterns WHERE slug = 'box-breathing'"
        );
        const PATTERN_ID = patternResult.rows[0].id;
        
        // Create a planned session
        const plannedResult = await client.query(
          `INSERT INTO sessions (user_id, local_date, planned_type, status)
           VALUES ($1, $2, 'meditation', 'planned')
           RETURNING id`,
          [TEST_USER_ID, FAR_OFF_DATE]
        );
        const plannedSessionId = plannedResult.rows[0].id;
        
        const logId = crypto.randomUUID();
        
        // Client1 calls no-lock variant - finds and reuses planned session
        const promise1 = client1.query(
          `SELECT public.record_breathing_practice_no_lock($1::uuid, $2::date, $3::uuid, NULL::uuid, 5, 5, 20, 40, false, 3::smallint, 'off', NULL::uuid, NULL::uuid, NULL::smallint) as session_id`,
          [logId, FAR_OFF_DATE, PATTERN_ID]
        );
        
        // Wait for client1 to insert log
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Client2 calls no-lock variant - hits ON CONFLICT, triggers backstop
        const promise2 = client2.query(
          `SELECT public.record_breathing_practice_no_lock($1::uuid, $2::date, $3::uuid, NULL::uuid, 5, 5, 20, 40, false, 3::smallint, 'off', NULL::uuid, NULL::uuid, NULL::smallint) as session_id`,
          [logId, FAR_OFF_DATE, PATTERN_ID]
        );
        
        const result1 = await promise1;
        await client1.query("COMMIT");
        
        const result2 = await promise2;
        await client2.query("COMMIT");
        
        const session1 = result1.rows[0].session_id;
        const session2 = result2.rows[0].session_id;
        
        check("planned: both returned session ids", !!(session1 && session2));
        check("planned: both returned SAME session id", session1 === session2);
        check("planned: returned the planned session", session1 === plannedSessionId);
        
        // Verify the planned session still exists (NOT deleted by backstop)
        const sessionCheck = await client.query(
          "SELECT id FROM sessions WHERE id = $1",
          [plannedSessionId]
        );
        check("planned: original planned session survives", sessionCheck.rows.length === 1);
        
        // Clean up
        await client.query("DELETE FROM breathing_logs WHERE id = $1", [logId]);
        await client.query("DELETE FROM sessions WHERE id = $1", [plannedSessionId]);
        
      } catch (error) {
        try { await client1.query("ROLLBACK"); } catch {}
        try { await client2.query("ROLLBACK"); } catch {}
        throw error;
      }
    }
    
  } finally {
    // Clean up the test function
    try {
      await client.query("DROP FUNCTION IF EXISTS public.record_breathing_practice_no_lock CASCADE");
    } catch {}
    await client.end();
    await client1.end();
    await client2.end();
  }
}

testBackstop()
  .then(() => {
    if (failures === 0) {
      console.log("\n✅ All backstop tests passed");
      console.log("   Backstop prevents orphan sessions when advisory lock is bypassed\n");
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
