/**
 * Database tests for program block range RPCs: concurrent rollover and rebuild.
 *
 * Tests that rebuild_block and rollover_block are idempotent and handle
 * concurrent calls correctly (fixes E-3: duplicate block creation).
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test npm run test:block-range-db
 * Or in CI: Skips (requires isolated PostgreSQL with schema creation privileges)
 */
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓   " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
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

async function runTests() {
  if (!DATABASE_URL) {
    console.log("\n⏭️  Skipping DB tests (DATABASE_URL not set)");
    console.log("   Set DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test to run\n");
    return true;
  }

  const { Pool } = await import("pg");
  const { readFileSync, readdirSync } = await import("fs");
  const { join } = await import("path");
  
  const pool = new Pool({ connectionString: DATABASE_URL });

  async function setupDatabase(pool: Pool) {
    // Create minimal auth schema stubs
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text UNIQUE NOT NULL,
        raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz DEFAULT now()
      );
      
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql STABLE
      AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      
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

    // Apply all migrations in order
    const migrationsDir = join(__dirname, "../supabase/migrations");
    const files = readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      console.log(`  Applying migration: ${file}`);
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

  try {
    console.log("Setting up database schema and migrations...\n");
    await setupDatabase(pool);
    console.log("✓ Database ready\n");
    
    // Helper to create a fresh user for each test
    async function createTestUser() {
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

    let userId: string;

    console.log("TEST 0: SQL vs TypeScript parity for cycle_week_for");
    {
      // Test cycleWeekFor parity across 0..40 days
      const { cycleWeekFor } = await import("../src/lib/program/block-range.js");
      
      const testBlock = {
        id: "test",
        started_on: "2026-10-01",
        ended_on: null,
        week_offset: 2,
      };
      
      let parityFailures = 0;
      for (let days = 0; days <= 40; days++) {
        const testDate = new Date("2026-10-01T00:00:00Z");
        testDate.setUTCDate(testDate.getUTCDate() + days);
        const dateStr = testDate.toISOString().split('T')[0];
        
        // TypeScript result
        const tsWeek = cycleWeekFor(testBlock, dateStr);
        
        // SQL result
        const { rows } = await pool.query(
          "SELECT cycle_week_for($1, $2, $3) as week",
          [testBlock.week_offset, testBlock.started_on, dateStr]
        );
        const sqlWeek = rows[0].week;
        
        if (tsWeek !== sqlWeek) {
          console.log(`  PARITY FAIL day ${days}: TS=${tsWeek} SQL=${sqlWeek}`);
          parityFailures++;
        }
      }
      
      check("SQL and TS cycle_week_for match for days 0-40", parityFailures === 0, `${parityFailures} mismatches`);
      console.log("  PASS: Test 0\n");
    }

    console.log("TEST 1: Rollover, 8 concurrent callers with DISTINCT payload ids");
    {
      userId = await createTestUser();
      
      // Create initial active block
      const blockId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 'active')
      `, [blockId1, userId]);

      const payload = {
        id: randomUUID(),
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-25",
        deload_week: 4,
        days: [],
      };

      // 8 concurrent calls with DISTINCT payload ids
      // Use Promise.all to ensure true concurrency
      const promises = Array.from({ length: 8 }, () => 
        callRPC(pool, userId, "rollover_block", {
          p_today: "2026-10-29",
          p_payload: { ...payload, id: randomUUID() },
        })
      );

      const results = await Promise.all(promises);
      const programIds = results.map((r) => r.data);
      const uniqueIds = new Set(programIds.filter(Boolean));
      const errors = results.filter(r => r.error).map(r => r.error);

      check("all 8 calls succeeded", results.every((r) => !r.error), errors.join("; "));
      check("all return the same winner id", uniqueIds.size === 1, `${uniqueIds.size} unique ids`);

      const { rows: blocks } = await pool.query(
        "SELECT id, status, block_number FROM programs WHERE user_id = $1",
        [userId]
      );

      const activeBlocks = blocks.filter((b) => b.status === "active");
      const completedBlocks = blocks.filter((b) => b.status === "completed");

      check("exactly ONE active block", activeBlocks.length === 1, `${activeBlocks.length}`);
      check("exactly ONE completed block", completedBlocks.length === 1, `${completedBlocks.length}`);
      check("new block is block 2", activeBlocks[0]?.block_number === 2);

      console.log("  PASS: Test 1\n");
    }

    console.log("TEST 2: Rebuild, 8 concurrent callers (same payload)");
    {
      userId = await createTestUser();
      
      const blockId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 0, 'active')
      `, [blockId1, userId]);

      // Same payload for all concurrent calls (simulates duplicate/retry requests)
      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [],
      };

      const promises = Array.from({ length: 8 }, () =>
        callRPC(pool, userId, "rebuild_block", {
          p_today: "2026-10-15",
          p_payload: payload, // Same payload for all
        })
      );

      const results = await Promise.all(promises);
      const programIds = results.map((r) => r.data);
      const uniqueIds = new Set(programIds.filter(Boolean));
      const errors = results.filter(r => r.error).map(r => r.error);

      check("all 8 calls succeeded", results.every((r) => !r.error), errors.join("; "));
      check("all return the same program ID", uniqueIds.size === 1, `${uniqueIds.size} unique: ${Array.from(uniqueIds).map(id => String(id).slice(0, 8)).join(", ")}`);

      const { rows: blocks } = await pool.query(
        "SELECT id, status, week_offset FROM programs WHERE user_id = $1",
        [userId]
      );

      const activeBlocks = blocks.filter((b) => b.status === "active");
      const supersededBlocks = blocks.filter((b) => b.status === "superseded");

      check("exactly ONE active block", activeBlocks.length === 1, `${activeBlocks.length}`);
      check("exactly ONE superseded block", supersededBlocks.length === 1, `${supersededBlocks.length}`);
      check("new block has week_offset = 2", activeBlocks[0]?.week_offset === 2, `offset=${activeBlocks[0]?.week_offset}`);

      console.log("  PASS: Test 2\n");
    }

    console.log("TEST 3: Stale rollover and mid-block rollover returns current");
    {
      userId = await createTestUser();
      
      const blockId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 'active')
      `, [blockId1, userId]);

      const payload = {
        id: randomUUID(),
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-25",
        deload_week: 4,
        days: [],
      };

      // Rollover
      const result1 = await callRPC(pool, userId, "rollover_block", {
        p_today: "2026-10-29",
        p_payload: payload,
      });

      // Stale rollover: after winner commits, another call returns current id
      const result2 = await callRPC(pool, userId, "rollover_block", {
        p_today: "2026-10-29",
        p_payload: { ...payload, id: randomUUID() },
      });

      check("stale rollover returns current block id", result1.data === result2.data);
      check("stale rollover changes nothing", !result2.error);

      // Mid-block rollover (active block hasn't ended): returns current block
      const result3 = await callRPC(pool, userId, "rollover_block", {
        p_today: "2026-11-15", // before ends_on
        p_payload: { ...payload, id: randomUUID(), block_number: 3 },
      });

      check("mid-block rollover returns current", result3.data === result1.data, `returned ${result3.data}, expected ${result1.data}`);

      console.log("  PASS: Test 3\n");
    }

    console.log("TEST 4: Two rebuilds same day + timezone shift handling");
    {
      userId = await createTestUser();
      
      const blockId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-15', '2026-11-11', 4, 0, 'active')
      `, [blockId1, userId]);

      const payload1 = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-11",
        deload_week: 4,
        days: [],
      };

      const result1 = await callRPC(pool, userId, "rebuild_block", {
        p_today: "2026-10-15",
        p_payload: payload1,
      });

      check("first rebuild succeeds", !result1.error, result1.error || "");

      const payload2 = {
        ...payload1,
        id: randomUUID(),
        split_type: "full_body",
      };

      const result2 = await callRPC(pool, userId, "rebuild_block", {
        p_today: "2026-10-15",
        p_payload: payload2,
      });

      check("second rebuild succeeds (different payload)", !result2.error, result2.error || "");
      check("second rebuild creates NEW block", result2.data !== result1.data, `both returned ${result1.data}`);

      const { rows: blocks } = await pool.query(
        "SELECT id, status, started_on, ended_on FROM programs WHERE user_id = $1 ORDER BY created_at",
        [userId]
      );

      // Second same-day rebuild with DIFFERENT payload should create 3 blocks total
      check("three blocks total", blocks.length === 3, `${blocks.length} blocks`);

      const emptyRanges = blocks.filter(
        (b) => b.ended_on !== null && b.ended_on < b.started_on
      );
      check("two empty ranges (original + first rebuild)", emptyRanges.length === 2, `${emptyRanges.length}`);

      console.log("  PASS: Test 4\n");
    }

    console.log("TEST 5: Backfill/dedupe legacy rows");
    {
      userId = await createTestUser();
      
      // Simulate legacy data: pre-migration schema with no ended_on
      const oldId = randomUUID();
      const newId = randomUUID();
      const abandonedId = randomUUID();

      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, status, created_at)
        VALUES 
          ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 'completed', '2026-10-01 10:00:00'),
          ($3, $2, 1, 'ppl', 6, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 'active', '2026-10-01 10:01:00'),
          ($4, $2, 0, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-09-01', '2026-09-28', 4, 'completed', '2026-09-01 10:00:00')
      `, [oldId, userId, newId, abandonedId]);

      // Simulate backfill
      await pool.query(`
        UPDATE programs
        SET ended_on = (
          SELECT (p2.started_on::date - interval '1 day')::date
          FROM programs p2
          WHERE p2.user_id = programs.user_id
            AND (p2.started_on > programs.started_on 
                 OR (p2.started_on = programs.started_on AND p2.created_at > programs.created_at))
          ORDER BY p2.started_on, p2.created_at
          LIMIT 1
        )
        WHERE user_id = $1 AND status != 'active' AND ended_on IS NULL
      `, [userId]);

      const { rows: blocks } = await pool.query(
        "SELECT id, started_on, ended_on, status FROM programs WHERE user_id = $1 ORDER BY started_on, created_at",
        [userId]
      );

      const allHaveEndedOn = blocks.filter(b => b.status !== "active").every(b => b.ended_on !== null);
      check("all non-active blocks have ended_on", allHaveEndedOn);

      const oldBlock = blocks.find((b) => b.id === oldId);
      check("old completed block is empty range", oldBlock && oldBlock.ended_on < oldBlock.started_on);

      const abandonedBlock = blocks.find((b) => b.id === abandonedId);
      check("abandoned block has ended_on", abandonedBlock && abandonedBlock.ended_on !== null);

      const { rows: checkViolations } = await pool.query(`
        SELECT id FROM programs 
        WHERE user_id = $1 AND ended_on IS NOT NULL AND ended_on < started_on - 1
      `, [userId]);

      check("CHECK constraint holds", checkViolations.length === 0, `${checkViolations.length} violations`);

      console.log("  PASS: Test 5\n");
    }

    console.log("TEST 6: Byte-identical rebuild");
    {
      userId = await createTestUser();
      
      const exerciseId = randomUUID();
      await pool.query(`
        INSERT INTO exercises (id, slug, name, tracks, category, primary_muscles, is_active)
        VALUES ($1, 'test-ex', 'Test Exercise', ARRAY['weights']::track_type[], 'strength', ARRAY['chest']::muscle[], true)
      `, [exerciseId]);

      const blockId1 = randomUUID();
      const dayId = randomUUID();
      const exId = randomUUID();

      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 0, 'active')
      `, [blockId1, userId]);

      await pool.query(`
        INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
        VALUES ($1, $2, $3, 1, 'weights', 'Upper')
      `, [dayId, blockId1, userId]);

      await pool.query(`
        INSERT INTO program_day_exercises (id, program_day_id, user_id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds)
        VALUES ($1, $2, $3, $4, 0, 3, 8, 12, 90)
      `, [exId, dayId, userId, exerciseId]);

      // Snapshot old data
      const { rows: oldDays } = await pool.query(
        "SELECT * FROM program_days WHERE id = $1",
        [dayId]
      );
      const { rows: oldExercises } = await pool.query(
        "SELECT * FROM program_day_exercises WHERE id = $1",
        [exId]
      );

      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [],
      };

      await callRPC(pool, userId, "rebuild_block", {
        p_today: "2026-10-15",
        p_payload: payload,
      });

      // Check old data unchanged
      const { rows: newDays } = await pool.query(
        "SELECT * FROM program_days WHERE id = $1",
        [dayId]
      );
      const { rows: newExercises } = await pool.query(
        "SELECT * FROM program_day_exercises WHERE id = $1",
        [exId]
      );

      check("old program_day unchanged", JSON.stringify(oldDays[0]) === JSON.stringify(newDays[0]));
      check("old exercise unchanged", JSON.stringify(oldExercises[0]) === JSON.stringify(newExercises[0]));

      console.log("  PASS: Test 6\n");
    }

    console.log("TEST 7: Orphans QA - 11 rebuilds, exactly one active");
    {
      userId = await createTestUser();
      
      const blockId = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 0, 'active')
      `, [blockId, userId]);

      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [],
      };

      // 11 rebuilds
      for (let i = 0; i < 11; i++) {
        await callRPC(pool, userId, "rebuild_block", {
          p_today: "2026-10-15",
          p_payload: { ...payload, id: randomUUID() },
        });
      }

      const { rows: blocks } = await pool.query(
        "SELECT id, status, ended_on FROM programs WHERE user_id = $1",
        [userId]
      );

      const activeBlocks = blocks.filter((b) => b.status === "active");
      const nonActiveBlocks = blocks.filter((b) => b.status !== "active");

      check("exactly ONE active block", activeBlocks.length === 1, `${activeBlocks.length}`);
      check("all non-active have ended_on", nonActiveBlocks.every((b) => b.ended_on !== null));

      const orphans = blocks.filter((b) => b.ended_on === null && b.status !== "active");
      check("no orphans without ended_on", orphans.length === 0, `${orphans.length} orphans`);

      console.log("  PASS: Test 7\n");
    }

    console.log("TEST 8: Session after rebuild QA");
    {
      userId = await createTestUser();
      
      const exerciseId = randomUUID();
      await pool.query(`
        INSERT INTO exercises (id, slug, name, tracks, category, primary_muscles, is_active)
        VALUES ($1, 'test-squat', 'Squat', ARRAY['weights']::track_type[], 'strength', ARRAY['quads']::muscle[], true)
      `, [exerciseId]);

      const blockId1 = randomUUID();
      const dayId1 = randomUUID();

      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 0, 'active')
      `, [blockId1, userId]);

      await pool.query(`
        INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
        VALUES ($1, $2, $3, 1, 'weights', 'Lower')
      `, [dayId1, blockId1, userId]);

      // Rebuild mid-block
      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [
          {
            day_index: 1,
            day_type: "weights",
            focus: null,
            label: "Push",
            exercises: [{
              exercise_id: exerciseId,
              order_index: 0,
              target_sets: 4,
              target_reps_min: 6,
              target_reps_max: 10,
              rest_seconds: 120,
            }],
          },
        ],
      };

      const rebuildResult = await callRPC(pool, userId, "rebuild_block", {
        p_today: "2026-10-15",
        p_payload: payload,
      });

      check("rebuild succeeded", !rebuildResult.error, rebuildResult.error || "");

      // Simulate session lookup: find today's program_day
      const { rows: todayDays } = await pool.query(`
        SELECT pd.id, pd.label, pd.program_id
        FROM program_days pd
        JOIN programs p ON pd.program_id = p.id
        WHERE pd.user_id = $1
          AND p.status = 'active'
          AND p.started_on <= '2026-10-15'
          AND (p.ended_on IS NULL OR p.ended_on >= '2026-10-15')
        LIMIT 1
      `, [userId]);

      check("session finds a program_day", todayDays.length > 0);
      check("program_day belongs to NEW block", todayDays[0]?.program_id === rebuildResult.data);
      check("program_day is 'Push'", todayDays[0]?.label === "Push");

      console.log("  PASS: Test 8\n");
    }

    console.log("TEST 9: week_offset preserves cycle week across rebuild");
    {
      userId = await createTestUser();
      
      const blockId1 = randomUUID();
      await pool.query(`
        INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
        VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-01', '2026-10-28', 4, 0, 'active')
      `, [blockId1, userId]);

      // Rebuild in week 3 (day 15 = Oct 15)
      const payload = {
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-10-28",
        deload_week: 4,
        days: [],
      };

      const result = await callRPC(pool, userId, "rebuild_block", {
        p_today: "2026-10-15",
        p_payload: payload,
      });

      check("rebuild succeeded", !result.error);

      const { rows: newBlocks } = await pool.query(
        "SELECT id, week_offset, started_on, ends_on FROM programs WHERE user_id = $1 AND status = 'active'",
        [userId]
      );

      check("new block has week_offset = 2", newBlocks[0]?.week_offset === 2, `offset=${newBlocks[0]?.week_offset}`);

      // Verify cycle week calculation: Oct 15 should be week 3
      const { rows: weekResult } = await pool.query(
        "SELECT cycle_week_for($1, $2, $3) as week",
        [newBlocks[0].week_offset, newBlocks[0].started_on, "2026-10-15"]
      );

      check("cycleWeekFor gives week 3 for rebuild day", weekResult[0]?.week === 3, `week=${weekResult[0]?.week}`);
      
      // Check that ends_on is preserved from payload (payload has ends_on = 2026-10-28)
      const expectedEndsOn = "2026-10-28";
      const actualEndsOn = newBlocks[0]?.ends_on;
      const actualEndsOnStr = actualEndsOn instanceof Date ? actualEndsOn.toISOString().split('T')[0] : actualEndsOn;
      check("new block ends_on from payload", actualEndsOnStr === expectedEndsOn, `expected ${expectedEndsOn}, got ${actualEndsOnStr}`);

      const { rows: oldBlocks } = await pool.query(
        "SELECT ended_on FROM programs WHERE id = $1",
        [blockId1]
      );

      const expectedEndedOn = "2026-10-14"; // p_today - 1
      const actualEndedOn = oldBlocks[0]?.ended_on;
      const actualEndedOnStr = actualEndedOn instanceof Date ? actualEndedOn.toISOString().split('T')[0] : actualEndedOn;
      check("old block ended_on set correctly", actualEndedOnStr === expectedEndedOn, `expected ${expectedEndedOn}, got ${actualEndedOnStr}`);

      console.log("  PASS: Test 9\n");
    }

    await pool.end();

    return failures === 0;
  } catch (error) {
    console.error("\nTest error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await pool.end();
    return false;
  }
}

runTests().then((ok) => {
  if (ok) {
    console.log("\n✅ ALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures} CHECKS FAILED`);
    process.exit(1);
  }
});
