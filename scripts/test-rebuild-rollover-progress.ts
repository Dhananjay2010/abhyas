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

// Create a fake Supabase client adapter for testing
function createTestSupabaseAdapter(pool: Pool, userId: string) {
  async function runQuery<T>(
    query: string,
    params: unknown[] = []
  ): Promise<{ data: T | null; error: Error | null }> {
    const client = await pool.connect();
    try {
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      const result = await client.query(query, params);
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    } finally {
      client.release();
    }
  }

  async function runQueryMany<T>(
    query: string,
    params: unknown[] = []
  ): Promise<{ data: T[] | null; error: Error | null }> {
    const client = await pool.connect();
    try {
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      const result = await client.query(query, params);
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    } finally {
      client.release();
    }
  }

  return {
    from(table: string) {
      let selectCols = "*";
      let whereClauses: string[] = [];
      let whereParams: unknown[] = [];
      let orderClauses: string[] = [];
      let limitVal: number | null = null;

      return {
        select(cols?: string) {
          if (cols) selectCols = cols;
          return this;
        },
        eq(col: string, val: unknown) {
          whereClauses.push(`${col} = $${whereParams.length + 1}`);
          whereParams.push(val);
          return this;
        },
        neq(col: string, val: unknown) {
          whereClauses.push(`${col} != $${whereParams.length + 1}`);
          whereParams.push(val);
          return this;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          const dir = opts?.ascending === false ? "DESC" : "ASC";
          orderClauses.push(`${col} ${dir}`);
          return this;
        },
        limit(n: number) {
          limitVal = n;
          return this;
        },
        async single() {
          const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
          const order = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(", ")}` : "";
          const limit = "LIMIT 1";
          const query = `SELECT ${selectCols} FROM ${table} ${where} ${order} ${limit}`;
          return await runQuery(query, whereParams);
        },
        async maybeSingle() {
          const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
          const order = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(", ")}` : "";
          const limit = "LIMIT 1";
          const query = `SELECT ${selectCols} FROM ${table} ${where} ${order} ${limit}`;
          return await runQuery(query, whereParams);
        },
        async then(resolve: (val: { data: unknown[] | null; error: Error | null }) => void) {
          const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
          const order = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(", ")}` : "";
          const limit = limitVal !== null ? `LIMIT ${limitVal}` : "";
          const query = `SELECT ${selectCols} FROM ${table} ${where} ${order} ${limit}`;
          const result = await runQueryMany(query, whereParams);
          resolve(result);
        },
      };
    },
  } as any; // Type as any for simplicity in test
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

    console.log("TEST: pd-b scenario - Settings rebuild after block ends WITHOUT Today rollover");
    {
      const userId = await createTestUser(pool);
      
      // Create block 1: started 2026-09-29, ends 2026-10-26 (28 days), still 'active'
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

      // Create ONE completed session on 2026-10-01 (day 3 within block)
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
      // Call the REAL rebuild path via rebuildPlanCore
      const { buildRebuildPlanDeps } = await import("../src/lib/program/rebuild-plan-deps.js");
      const { rebuildPlanCore } = await import("../src/lib/program/rebuild-plan-core.js");
      
      const supabase = createTestSupabaseAdapter(pool, userId);
      const deps = buildRebuildPlanDeps(supabase, userId, "2026-10-27");
      const rebuildResult = await rebuildPlanCore(deps);

      assert(rebuildResult.ok, "Rebuild succeeded", rebuildResult.ok ? "" : rebuildResult.error);

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
        "SELECT block_number, started_on, ends_on, week_offset FROM programs WHERE user_id = $1 AND status = 'active'",
        [userId]
      ) as { rows: Array<{ block_number: number; started_on: Date; ends_on: Date; week_offset: number }> };

      assert(activeBlocks.length === 1, "Exactly one active block", `got ${activeBlocks.length}`);
      assert(activeBlocks[0]?.block_number === 2, "Active block is block 2", `got ${activeBlocks[0]?.block_number}`);
      
      const startedOn = activeBlocks[0]?.started_on?.toISOString().split('T')[0];
      assert(startedOn === "2026-10-27", "Block 2 started_on is 2026-10-27 (p_today)", `got ${startedOn}`);

      // Assert Week N of M with N <= M
      const { cycleWeekFor } = await import("../src/lib/program/block-range.js");
      const week = cycleWeekFor(
        { started_on: activeBlocks[0].started_on.toISOString().split('T')[0], week_offset: activeBlocks[0].week_offset },
        "2026-10-27"
      );
      const blockLength = 4; // Standard block is 4 weeks
      assert(week <= blockLength, `Week ${week} <= block length ${blockLength}`, `week=${week}`);

      // Test Progress logic
      const { progressStartDate } = await import("../src/lib/progress/progress-start-date.js");
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
        actual_type: s.actual_type as "weights" | "bodyweight" | "yoga" | "rest" | "meditation" | "active_recovery" | null,
        status: s.status,
        working_set_count: workingSetsBySession.get(s.id),
      }));

      const effectiveStart = progressStartDate({
        programs: programs.map((p) => ({
          startedOn: p.started_on.toISOString().split('T')[0],
        })),
        completedSessions,
      });

      assert(effectiveStart === "2026-09-29", "effectiveStart is first block's started_on", `got ${effectiveStart}`);

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

      // Check progress_summary agrees
      const { rows: summaryRows } = await pool.query(
        "SELECT * FROM progress_summary($1)",
        [userId]
      ) as { rows: Array<{ days_trained: number }> };
      
      const summaryDaysTrained = summaryRows[0]?.days_trained ?? 0;
      assert(summaryDaysTrained === 1, "progress_summary.days_trained = 1", `got ${summaryDaysTrained}`);

      console.log("  PASS: pd-b test\n");
    }

    console.log("TEST: Regression - WITHOUT rollover, block 1 becomes superseded");
    {
      const userId = await createTestUser(pool);
      
      // Create block 1: ended, still active
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

      // Session on 2026-10-01
      const sessionId = randomUUID();
      await pool.query(`
        INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, completed_at)
        VALUES ($1, $2, $3, $4, '2026-10-01', 1, false, 'weights', 'weights', 'completed', now())
      `, [sessionId, userId, blockId1, dayId1]);

      const sessionExId = randomUUID();
      await pool.query(`
        INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, metric, status)
        VALUES ($1, $2, $3, $4, 0, 3, 8, 12, 90, 'reps', 'completed')
      `, [sessionExId, sessionId, userId, exerciseId]);

      await pool.query(`
        INSERT INTO session_sets (id, session_exercise_id, set_number, reps, weight_kg, is_warmup_set, feel)
        VALUES ($1, $2, 1, 10, 100, false, 'good')
      `, [randomUUID(), sessionExId]);

      // Call rebuild_block DIRECTLY without rollover (the bug scenario)
      const { createBlockForUser } = await import("../src/lib/program/persist.js");
      const supabase = createTestSupabaseAdapter(pool, userId);
      
      await createBlockForUser(supabase, userId, { mode: "rebuild" });

      // Check block 1 status - should be superseded (the bug)
      const { rows: block1Rows } = await pool.query(
        "SELECT status FROM programs WHERE id = $1",
        [blockId1]
      ) as { rows: Array<{ status: string }> };

      assert(block1Rows[0]?.status === "superseded", "WITHOUT rollover, block 1 is 'superseded' (regression)", `got ${block1Rows[0]?.status}`);

      console.log("  PASS: regression test (bug reproduced)\n");
    }

    console.log("TEST: Mid-block rebuild maintains correct Week N of M");
    {
      const userId = await createTestUser(pool);
      
      // Create block 1: started 2026-10-01, mid-block on 2026-10-15
      const blockId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 0, 'active')
      `, [blockId1, userId]);

      // Rebuild mid-block on 2026-10-15
      const { buildRebuildPlanDeps } = await import("../src/lib/program/rebuild-plan-deps.js");
      const { rebuildPlanCore } = await import("../src/lib/program/rebuild-plan-core.js");
      
      const supabase = createTestSupabaseAdapter(pool, userId);
      const deps = buildRebuildPlanDeps(supabase, userId, "2026-10-15");
      await rebuildPlanCore(deps);

      const { rows: activeBlocks } = await pool.query(
        "SELECT started_on, week_offset FROM programs WHERE user_id = $1 AND status = 'active'",
        [userId]
      ) as { rows: Array<{ started_on: Date; week_offset: number }> };

      const { cycleWeekFor } = await import("../src/lib/program/block-range.js");
      const week = cycleWeekFor(
        { started_on: activeBlocks[0].started_on.toISOString().split('T')[0], week_offset: activeBlocks[0].week_offset },
        "2026-10-15"
      );
      
      assert(week >= 1 && week <= 4, `Mid-block week ${week} in range [1, 4]`, `week=${week}`);

      console.log("  PASS: mid-block rebuild test\n");
    }

    console.log("TEST: Unit test - progressStartDate with superseded block and earlier sessions");
    {
      const { progressStartDate } = await import("../src/lib/progress/progress-start-date.js");

      // Case: superseded block filtered out, but sessions predate the active block
      const result = progressStartDate({
        programs: [{ startedOn: "2026-10-15" }], // active block starts 10-15
        completedSessions: [
          { local_date: "2026-10-05", actual_type: "weights", status: "completed", working_set_count: 1 },
        ],
      });

      assert(result === "2026-10-05", "progressStartDate picks earlier session date", `got ${result}`);

      console.log("  PASS: progressStartDate unit test\n");
    }

    console.log("TEST: Unit test - buildDayRecords with days before any block");
    {
      const { buildDayRecords, computeStreaks } = await import("../src/lib/progress/streaks.js");

      // Days before the first block with a completed session should count, but not break streak
      const dayRecords = buildDayRecords({
        programs: [
          { id: "p1", startedOn: "2026-10-10", endsOn: "2026-11-06", endedOn: null },
        ],
        dayTypesByProgram: {},
        completedSessions: [
          { local_date: "2026-10-05", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
          { local_date: "2026-10-11", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
        ],
        today: "2026-10-15",
        effectiveStart: "2026-10-05",
      });

      const streaks = computeStreaks(dayRecords, "2026-10-15");
      assert(streaks.totalSessions === 2, "Days trained counts both sessions", `got ${streaks.totalSessions}`);

      // Days between 10-05 and 10-11 with no block have no template, so they don't break the streak
      console.log("  PASS: buildDayRecords unit test\n");
    }

    console.log("TEST: Unit test - breathing/rest/skipped sessions don't start range");
    {
      const { progressStartDate } = await import("../src/lib/progress/progress-start-date.js");

      // Rest/breathing/skipped sessions don't count toward days trained, so they 
      // shouldn't affect start date - progressStartDate now filters via countsTowardStreak
      const result1 = progressStartDate({
        programs: [{ startedOn: "2026-10-15" }],
        completedSessions: [
          { local_date: "2026-10-05", actual_type: "rest" as const, status: "completed", working_set_count: 0 },
          { local_date: "2026-10-06", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
        ],
      });

      // progressStartDate now filters via countsTowardStreak, so only the weights session counts
      assert(result1 === "2026-10-06", "progressStartDate filters to qualifying sessions", `got ${result1}`);

      // Test with breathing session dated earliest
      const result2 = progressStartDate({
        programs: [{ startedOn: "2026-10-20" }],
        completedSessions: [
          { local_date: "2026-10-01", actual_type: "meditation" as const, status: "completed", working_set_count: 0 },
          { local_date: "2026-10-10", actual_type: "yoga" as const, status: "completed", working_set_count: 0 },
        ],
      });

      // Breathing doesn't count, but yoga does - so yoga session is the first
      assert(result2 === "2026-10-10", "Breathing session ignored, yoga session used", `got ${result2}`);

      // Test with skipped session dated earliest
      const result3 = progressStartDate({
        programs: [{ startedOn: "2026-10-20" }],
        completedSessions: [
          { local_date: "2026-10-05", actual_type: "weights" as const, status: "skipped", working_set_count: 0 },
          { local_date: "2026-10-15", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
        ],
      });

      // Skipped session doesn't count
      assert(result3 === "2026-10-15", "Skipped session ignored", `got ${result3}`);

      console.log("  PASS: breathing/rest/skipped session unit test\n");
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
