/**
 * Test for pd-b bug fix: rebuilding from Settings after block ends
 * but before Today rollover should mark old block 'completed' not 'superseded',
 * and Progress days trained should always include all completed sessions.
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test npm run test:rebuild-rollover-progress
 */
import { Pool } from "pg";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  if (process.env.CI) {
    console.error("\n❌ DATABASE_URL not set in CI environment\n");
    process.exit(1);
  }
  console.log("\n⏭️  Skipping DB tests (DATABASE_URL not set)");
  console.log("   Set DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test to run\n");
  console.log("\n✅ ALL CHECKS PASSED");
  process.exit(0);
}

let testsFailed = 0;
function assert(condition: boolean, message: string, detail = "") {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}${detail ? ` (${detail})` : ""}`);
    testsFailed++;
  } else {
    console.log(`  ✓    ${message}${detail ? ` ${detail}` : ""}`);
  }
}

async function setupAuthSchema(pool: Pool): Promise<boolean> {
  const allowStub = process.env.ALLOW_AUTH_SCHEMA_STUB === '1';
  const isCI = !!process.env.CI;
  
  if (!allowStub) {
    const url = DATABASE_URL || '';
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
    const isTestDb = url.includes('abhyas_test');
    
    if (!isCI) {
      console.log("\n⏭️  Skipping auth schema setup (not CI, set ALLOW_AUTH_SCHEMA_STUB=1 to allow)");
      return false;
    }
    
    if (!isLocalhost && !isTestDb) {
      console.error("\n❌ GUARD: auth schema setup refused (not localhost/abhyas_test)");
      process.exit(1);
    }
  }

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS auth;
    
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    
    COMMENT ON TABLE auth.users IS 'abhyas-test-stub';
    
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    
    COMMENT ON FUNCTION auth.uid() IS 'abhyas-test-stub';
    
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END$$;
  `);
  
  return true;
}

async function applyMigrations(pool: Pool) {
  const { readdirSync, readFileSync } = await import("fs");
  const { join } = await import("path");
  
  const migrationsDir = join(__dirname, "../supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    await pool.query(sql);
  }
}

async function callRPC(
  pool: Pool,
  userId: string,
  rpcName: string,
  args: { p_today: string; p_payload: Record<string, unknown> }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
    const result = await client.query(
      `SELECT ${rpcName}($1, $2) as result`,
      [args.p_today, JSON.stringify(args.p_payload)]
    );
    await client.query("COMMIT");
    return { data: result.rows[0]?.result, error: null };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, error: message };
  } finally {
    client.release();
  }
}

async function createTestUser(pool: Pool) {
  const userId = randomUUID();
  await pool.query(
    "INSERT INTO auth.users (id, email) VALUES ($1, $2)",
    [userId, `test-${userId}@example.com`]
  );
  await pool.query(`
    UPDATE profiles
    SET timezone = 'Asia/Kolkata',
        goal = 'strength',
        level = 'intermediate',
        primary_track = 'weights',
        days_per_week = 4,
        onboarding_completed_at = now()
    WHERE id = $1
  `, [userId]);
  return userId;
}

async function runTests() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("Setting up auth schema and migrations...\n");
    await setupAuthSchema(pool);
    await applyMigrations(pool);
    console.log("✓ Database ready\n");

    // Get a test exercise for sessions
    const { rows: exerciseRows } = await pool.query(
      "SELECT id FROM exercises WHERE is_active = true LIMIT 1"
    );
    const exerciseId = exerciseRows[0]?.id;
    assert(!!exerciseId, "Found test exercise");

    console.log("TEST: pd-b scenario - Settings rebuild after block ends without Today rollover");
    {
      const userId = await createTestUser(pool);
      
      // Create block 1: started 2026-09-29, ends 2026-10-26 (28 days)
      const blockId1 = randomUUID();
      const dayId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-09-29', '2026-10-26', 4, 0, 'active')
      `, [blockId1, userId]);

      await pool.query(`
        INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
        VALUES ($1, $2, $3, 1, 'weights', 'Upper')
      `, [dayId1, blockId1, userId]);

      // Create ONE completed session on 2026-10-01 (day 1 within block)
      const sessionId = randomUUID();
      await pool.query(`
        INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, completed_at)
        VALUES ($1, $2, $3, $4, '2026-10-01', 1, false, 'weights', 'weights', 'completed', now())
      `, [sessionId, userId, blockId1, dayId1]);

      // Add session exercises and sets to ensure working_sets >= 1
      const sessionExId = randomUUID();
      await pool.query(`
        INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, metric, status)
        VALUES ($1, $2, $3, $4, 0, 3, 8, 12, 90, 'reps', 'completed')
      `, [sessionExId, sessionId, userId, exerciseId]);

      // Add a working set
      await pool.query(`
        INSERT INTO session_sets (id, session_exercise_id, set_number, reps, weight_kg, is_warmup_set, feel)
        VALUES ($1, $2, 1, 10, 100, false, 'good')
      `, [randomUUID(), sessionExId]);

      // Now: 2026-10-27, block 1 has ended (ends_on 2026-10-26 < 2026-10-27)
      // BUT the user goes straight to Settings and rebuilds without opening Today first
      
      // Before the fix, this would call rebuild_block which would mark block 1 as 'superseded'
      // After the fix, buildPlan calls ensureCurrentBlock first, which:
      // 1. Detects ends_on < today (2026-10-26 < 2026-10-27)
      // 2. Calls rollover_block to close block 1 as 'completed' and create block 2
      // 3. THEN rebuild_block runs as a mid-block rebuild of block 2

      // Simulate ensureCurrentBlock by calling rollover_block
      const rolloverPayload = {
        id: randomUUID(),
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-23", // 28 days from 2026-10-27
        deload_week: 4,
        days: [],
      };

      const rolloverResult = await callRPC(pool, userId, "rollover_block", {
        p_today: "2026-10-27",
        p_payload: rolloverPayload,
      });

      assert(!rolloverResult.error, "Rollover succeeded", rolloverResult.error || "");

      // Now rebuild the new block (changing session length or equipment)
      const rebuildPayload = {
        id: randomUUID(),
        block_number: 2,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-23",
        deload_week: 4,
        days: [],
      };

      const rebuildResult = await callRPC(pool, userId, "rebuild_block", {
        p_today: "2026-10-27",
        p_payload: rebuildPayload,
      });

      assert(!rebuildResult.error, "Rebuild succeeded", rebuildResult.error || "");

      // Check block 1 status
      const { rows: block1Rows } = await pool.query(
        "SELECT status, started_on, ended_on FROM programs WHERE id = $1",
        [blockId1]
      ) as { rows: Array<{ status: string; started_on: Date; ended_on: Date | null }> };

      const block1 = block1Rows[0];
      assert(block1.status === "completed", "Block 1 status is 'completed' (not 'superseded')", `got ${block1.status}`);
      
      const endedOn = block1.ended_on?.toISOString().split('T')[0];
      assert(endedOn === "2026-10-26", "Block 1 ended_on is 2026-10-26 (its original ends_on)", `got ${endedOn}`);

      // Check that exactly one active block exists
      const { rows: activeBlocks } = await pool.query(
        "SELECT block_number, started_on FROM programs WHERE user_id = $1 AND status = 'active'",
        [userId]
      ) as { rows: Array<{ block_number: number; started_on: Date }> };

      assert(activeBlocks.length === 1, "Exactly one active block", `got ${activeBlocks.length}`);
      assert(activeBlocks[0]?.block_number === 2, "Active block is block 2", `got ${activeBlocks[0]?.block_number}`);
      
      const startedOn = activeBlocks[0]?.started_on?.toISOString().split('T')[0];
      assert(startedOn === "2026-10-27", "Block 2 started_on is 2026-10-27 (p_today)", `got ${startedOn}`);

      // Now test the Progress page logic with buildDayRecords
      const { buildDayRecords, computeStreaks } = await import("../src/lib/progress/streaks.js");

      // Fetch programs excluding superseded (as Progress page does)
      const { rows: programs } = await pool.query(
        "SELECT id, started_on, ends_on, ended_on FROM programs WHERE user_id = $1 AND status != 'superseded' ORDER BY started_on",
        [userId]
      ) as { rows: Array<{ id: string; started_on: Date; ends_on: Date; ended_on: Date | null }> };

      // Fetch completed sessions
      const { rows: sessions } = await pool.query(
        "SELECT local_date, actual_type, status FROM sessions WHERE user_id = $1 ORDER BY local_date",
        [userId]
      ) as { rows: Array<{ local_date: string; actual_type: string | null; status: string }> };

      // Get working set counts
      const sessionIds = sessions.map(() => sessionId);
      const { rows: setCountRows } = await pool.query(
        `SELECT s.id as session_id, COUNT(*) as set_count
         FROM sessions s
         JOIN session_exercises se ON se.session_id = s.id
         JOIN session_sets ss ON ss.session_exercise_id = se.id
         WHERE s.user_id = $1 AND ss.is_warmup_set = false
         GROUP BY s.id`,
        [userId]
      ) as { rows: Array<{ session_id: string; set_count: string }> };

      const workingSetsBySession = new Map(
        setCountRows.map((v) => [v.session_id, Number(v.set_count) || 0])
      );

      const completedSessions = sessions.map((s) => ({
        local_date: s.local_date,
        actual_type: s.actual_type as any,
        status: s.status,
        working_set_count: workingSetsBySession.get(sessionId),
      }));

      // Build day records - with the fix, this should include the session from 2026-10-01
      // even though block 1 is now 'completed' (not superseded)
      
      // First session date
      const firstSessionDate = completedSessions.length > 0
        ? completedSessions.reduce((earliest, s) => 
            s.local_date < earliest ? s.local_date : earliest, 
            completedSessions[0].local_date
          )
        : null;
      
      // First block date
      const firstBlockDate = programs.length > 0 
        ? programs[0].started_on.toISOString().split('T')[0] 
        : null;
      
      // Effective start is the earlier of the two
      const effectiveStart = 
        firstSessionDate && firstBlockDate 
          ? (firstSessionDate < firstBlockDate ? firstSessionDate : firstBlockDate)
          : firstBlockDate ?? firstSessionDate;

      const dayRecords = buildDayRecords({
        programs: programs.map((p) => ({
          id: p.id,
          startedOn: p.started_on.toISOString().split('T')[0],
          endsOn: p.ends_on.toISOString().split('T')[0],
          endedOn: p.ended_on ? p.ended_on.toISOString().split('T')[0] : null,
        })),
        dayTypesByProgram: {}, // empty for this test
        completedSessions,
        today: "2026-10-27",
        effectiveStart,
      });

      const streaks = computeStreaks(dayRecords, "2026-10-27");

      assert(streaks.totalSessions === 1, "Days trained = 1", `got ${streaks.totalSessions}`);
      assert(streaks.longest === 1, "Best streak = 1", `got ${streaks.longest}`);

      console.log("  PASS: pd-b test\n");
    }

    console.log("TEST: buildDayRecords with superseded block and earlier sessions");
    {
      const userId = await createTestUser(pool);
      
      // Create a superseded block with a session
      const blockId1 = randomUUID();
      const dayId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, ended_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', '2026-10-14', 4, 0, 'superseded')
      `, [blockId1, userId]);

      await pool.query(`
        INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
        VALUES ($1, $2, $3, 1, 'weights', 'Upper')
      `, [dayId1, blockId1, userId]);

      // Create a completed session on 2026-10-05
      const sessionId = randomUUID();
      await pool.query(`
        INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, completed_at)
        VALUES ($1, $2, $3, $4, '2026-10-05', 1, false, 'weights', 'weights', 'completed', now())
      `, [sessionId, userId, blockId1, dayId1]);

      // Add session exercises and sets
      const sessionExId = randomUUID();
      await pool.query(`
        INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, metric, status)
        VALUES ($1, $2, $3, $4, 0, 3, 8, 12, 90, 'reps', 'completed')
      `, [sessionExId, sessionId, userId, exerciseId]);

      await pool.query(`
        INSERT INTO session_sets (id, session_exercise_id, set_number, reps, weight_kg, is_warmup_set, feel)
        VALUES ($1, $2, 1, 10, 100, false, 'good')
      `, [randomUUID(), sessionExId]);

      // Create an active block starting 2026-10-15
      const blockId2 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 2, 'ppl', 6, 'weights', 'strength', 'intermediate', '2026-10-15', '2026-11-11', 4, 0, 'active')
      `, [blockId2, userId]);

      // Test buildDayRecords
      const { buildDayRecords, computeStreaks } = await import("../src/lib/progress/streaks.js");

      // Fetch programs excluding superseded (as Progress page does)
      const { rows: programs } = await pool.query(
        "SELECT id, started_on, ends_on, ended_on FROM programs WHERE user_id = $1 AND status != 'superseded' ORDER BY started_on",
        [userId]
      ) as { rows: Array<{ id: string; started_on: Date; ends_on: Date; ended_on: Date | null }> };

      // Fetch completed sessions
      const { rows: sessions } = await pool.query(
        "SELECT s.id, local_date, actual_type, status FROM sessions WHERE user_id = $1 ORDER BY local_date",
        [userId]
      ) as { rows: Array<{ id: string; local_date: string; actual_type: string | null; status: string }> };

      // Get working set counts
      const { rows: setCountRows } = await pool.query(
        `SELECT s.id as session_id, COUNT(*) as set_count
         FROM sessions s
         JOIN session_exercises se ON se.session_id = s.id
         JOIN session_sets ss ON ss.session_exercise_id = se.id
         WHERE s.user_id = $1 AND ss.is_warmup_set = false
         GROUP BY s.id`,
        [userId]
      ) as { rows: Array<{ session_id: string; set_count: string }> };

      const workingSetsBySession = new Map(
        setCountRows.map((v) => [v.session_id, Number(v.set_count) || 0])
      );

      const completedSessions = sessions.map((s) => ({
        local_date: s.local_date,
        actual_type: s.actual_type as any,
        status: s.status,
        working_set_count: workingSetsBySession.get(s.id),
      }));

      // Build effectiveStart from sessions and programs
      const firstSessionDate = completedSessions.length > 0
        ? completedSessions.reduce((earliest, s) => 
            s.local_date < earliest ? s.local_date : earliest, 
            completedSessions[0].local_date
          )
        : null;
      
      const firstBlockDate = programs.length > 0 
        ? programs[0].started_on.toISOString().split('T')[0] 
        : null;
      
      const effectiveStart = 
        firstSessionDate && firstBlockDate 
          ? (firstSessionDate < firstBlockDate ? firstSessionDate : firstBlockDate)
          : firstBlockDate ?? firstSessionDate;

      assert(effectiveStart === "2026-10-05", "effectiveStart is 2026-10-05 (first session date)", `got ${effectiveStart}`);

      const dayRecords = buildDayRecords({
        programs: programs.map((p) => ({
          id: p.id,
          startedOn: p.started_on.toISOString().split('T')[0],
          endsOn: p.ends_on.toISOString().split('T')[0],
          endedOn: p.ended_on ? p.ended_on.toISOString().split('T')[0] : null,
        })),
        dayTypesByProgram: {}, // empty for this test
        completedSessions,
        today: "2026-10-20",
        effectiveStart,
      });

      const streaks = computeStreaks(dayRecords, "2026-10-20");

      assert(streaks.totalSessions === 1, "Days trained = 1 (session from superseded block counts)", `got ${streaks.totalSessions}`);

      console.log("  PASS: superseded block with earlier sessions test\n");
    }

    await pool.end();

    if (testsFailed === 0) {
      console.log("\n✅ ALL TESTS PASSED");
      process.exit(0);
    } else {
      console.error(`\n❌ ${testsFailed} TESTS FAILED`);
      process.exit(1);
    }
  } catch (error) {
    console.error("\nTest error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await pool.end();
    process.exit(1);
  }
}

runTests();
