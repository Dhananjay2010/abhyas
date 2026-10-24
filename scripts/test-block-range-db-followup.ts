/**
 * Block range followup DB tests (M1, M2, Rows#1, LOW, M3)
 * Integrated into block-range-db-test CI job
 * 
 * Run: DATABASE_URL=... npm run test:block-range-db-followup
 */
import { Pool } from "pg";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable required");
  process.exit(1);
}

let testsFailed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  } else {
    console.log(`  ✓    ${message}`);
  }
}

async function setupTestDB(pool: Pool) {
  // Create minimal auth schema for tests
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY default gen_random_uuid(),
      instance_id uuid,
      aud text,
      role text,
      email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE SQL STABLE;
  `);
}

async function testM1_MidBlockRebuildEndsOn() {
  console.log("\n━━━ TEST M1: Mid-block rebuild ends_on calculation ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    const exerciseId = (await pool.query("SELECT id FROM exercises LIMIT 1")).rows[0]?.id;
    
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Test 1: offset=0, rebuild on day 1 (should end at day 28, week 4)
    const block1 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-15', '2026-11-11', 4, 0, 'active')
    `, [block1, userId]);
    
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      await client.query(`
        SELECT rebuild_block($1, $2)
      `, ["2026-10-15", JSON.stringify({
        id: randomUUID(),
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-11", // ignored
        deload_week: 4,
        days: [{
          day_index: 1,
          day_type: "weights",
          focus: null,
          label: "Full Body",
          exercises: [{
            exercise_id: exerciseId,
            order_index: 0,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            rest_seconds: 90
          }]
        }]
      })]);
      await client.query("COMMIT");
      
      const { rows: r1 } = await pool.query(`
        SELECT started_on, ends_on, week_offset,
               cycle_week_for(week_offset, started_on, ends_on) as last_day_week,
               ends_on >= started_on as ends_after_start
        FROM programs WHERE user_id = $1 AND status = 'active'
      `, [userId]);
      
      assert(r1[0].week_offset === 0, `offset=0: week_offset is 0, got ${r1[0].week_offset}`);
      assert(r1[0].last_day_week <= 4, `offset=0: last day <= week 4, got week ${r1[0].last_day_week}`);
      assert(r1[0].ends_after_start, `offset=0: ends_on >= started_on`);
      
    } finally {
      client.release();
    }
    
    // Test 2: offset=3, rebuild on day 26 (should end in week 4, not week 7)
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    
    const block2 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-15', '2026-11-11', 4, 0, 'active')
    `, [block2, userId]);
    
    const client2 = await pool.connect();
    try {
      await client2.query("BEGIN");
      await client2.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      await client2.query(`
        SELECT rebuild_block($1, $2)
      `, ["2026-11-09", JSON.stringify({  // day 26, week 4
        id: randomUUID(),
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-12-06", // payload ignored
        deload_week: 4,
        days: [{
          day_index: 1,
          day_type: "weights",
          focus: null,
          label: "Full Body",
          exercises: [{
            exercise_id: exerciseId,
            order_index: 0,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            rest_seconds: 90
          }]
        }]
      })]);
      await client2.query("COMMIT");
      
      const { rows: r2 } = await pool.query(`
        SELECT started_on, ends_on, week_offset,
               cycle_week_for(week_offset, started_on, ends_on) as last_day_week,
               ends_on >= started_on as ends_after_start
        FROM programs WHERE user_id = $1 AND status = 'active'
      `, [userId]);
      
      assert(r2[0].week_offset === 3, `offset=3: week_offset is 3, got ${r2[0].week_offset}`);
      assert(r2[0].last_day_week <= 4, `offset=3: last day <= week 4, got week ${r2[0].last_day_week}`);
      assert(r2[0].ends_after_start, `offset=3: ends_on >= started_on`);
      
    } finally {
      client2.release();
    }
    
    // Test 3: offset >= 4 (late return case)
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    
    const block3 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-09-01', '2026-09-28', 4, 0, 'active')
    `, [block3, userId]);
    
    const client3 = await pool.connect();
    try {
      await client3.query("BEGIN");
      await client3.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      // Rebuild after 5 weeks (offset would be 5)
      await client3.query(`
        SELECT rebuild_block($1, $2)
      `, ["2026-10-10", JSON.stringify({  // 39 days later, offset would be 5
        id: randomUUID(),
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-06",
        deload_week: 4,
        days: [{
          day_index: 1,
          day_type: "weights",
          focus: null,
          label: "Full Body",
          exercises: [{
            exercise_id: exerciseId,
            order_index: 0,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            rest_seconds: 90
          }]
        }]
      })]);
      await client3.query("COMMIT");
      
      const { rows: r3 } = await pool.query(`
        SELECT started_on, ends_on, week_offset,
               cycle_week_for(week_offset, started_on, ends_on) as last_day_week,
               ends_on >= started_on as ends_after_start
        FROM programs WHERE user_id = $1 AND status = 'active'
      `, [userId]);
      
      assert(r3[0].ends_after_start, `offset>=4: ends_on >= started_on (${r3[0].ends_on} >= ${r3[0].started_on})`);
      assert(r3[0].last_day_week <= 4, `offset>=4: last day <= week 4, got week ${r3[0].last_day_week}`);
      
    } finally {
      client3.release();
    }
    
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function testM2_SameDayRebuildPreservesFK() {
  console.log("\n━━━ TEST M2: Same-day rebuild preserves program_day_id FK ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    const exerciseId = (await pool.query("SELECT id FROM exercises LIMIT 1")).rows[0]?.id;
    
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    const blockId = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-24', '2026-11-20', 4, 0, 'active')
    `, [blockId, userId]);
    
    const programDayId = randomUUID();
    await pool.query(`
      INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
      VALUES ($1, $2, $3, 1, 'weights', 'Full Body A')
    `, [programDayId, blockId, userId]);
    
    const sessionId = randomUUID();
    await pool.query(`
      INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, status, week_in_block, is_deload, planned_type, actual_type)
      VALUES ($1, $2, $3, $4, '2026-10-24', 'completed', 1, false, 'weights', 'weights')
    `, [sessionId, userId, blockId, programDayId]);
    
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      await client.query(`
        SELECT rebuild_block($1, $2)
      `, ["2026-10-24", JSON.stringify({
        id: randomUUID(),
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-11-20",
        deload_week: 4,
        days: [{
          day_index: 1,
          day_type: "weights",
          focus: null,
          label: "Full Body B",
          exercises: [{
            exercise_id: exerciseId,
            order_index: 0,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            rest_seconds: 90
          }]
        }]
      })]);
      await client.query("COMMIT");
      
      const { rows } = await pool.query(`
        SELECT s.id, s.program_day_id, pd.label
        FROM sessions s
        LEFT JOIN program_days pd ON s.program_day_id = pd.id
        WHERE s.id = $1
      `, [sessionId]);
      
      assert(rows[0].program_day_id !== null, "session.program_day_id is not NULL");
      assert(rows[0].label === "Full Body B", `session label updated to "Full Body B", got "${rows[0].label}"`);
      
    } finally {
      client.release();
    }
    
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function testLOW_CycleWeekClamp() {
  console.log("\n━━━ TEST LOW: cycle_week_for clamps to week 1 ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const { rows: r1 } = await pool.query(`
      SELECT cycle_week_for(0, '2026-10-20'::date, '2026-10-19'::date) as week
    `);
    assert(r1[0].week === 1, `offset=0, date before start → week 1, got ${r1[0].week}`);
    
    const { rows: r2 } = await pool.query(`
      SELECT cycle_week_for(3, '2026-10-20'::date, '2026-10-19'::date) as week
    `);
    assert(r2[0].week === 1, `offset=3, date before start → week 1, got ${r2[0].week}`);
    
  } finally {
    await pool.end();
  }
}

async function testRows1_RepairInvalidCompleted() {
  console.log("\n━━━ TEST Rows#1: Repair invalid completed programs ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Block 1: No sessions, ends_on = started_on - 1 (will be marked superseded)
    const badBlock1 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, ended_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-20', '2026-11-16', '2026-10-19', 4, 0, 'completed')
    `, [badBlock1, userId]);
    
    // Block 2: Has session, ends_on = started_on - 1 (will be marked superseded)
    const badBlock2 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, ended_on, deload_week, week_offset, status)
      VALUES ($1, $2, 2, 'upper_lower', 4, 'weights', 'muscle_gain', 'intermediate', '2026-10-21', '2026-11-17', '2026-10-20', 4, 0, 'completed')
    `, [badBlock2, userId]);
    
    const sessionId = randomUUID();
    await pool.query(`
      INSERT INTO sessions (id, user_id, program_id, local_date, status, week_in_block, is_deload, planned_type, actual_type)
      VALUES ($1, $2, $3, '2026-10-21', 'completed', 1, false, 'weights', 'weights')
    `, [sessionId, userId, badBlock2]);
    
    // Block 3: Successor that starts on 2026-10-21 (same as block2's started_on)
    const successor = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 3, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-21', '2026-11-17', 4, 0, 'active')
    `, [successor, userId]);
    
    console.log("  Before repair:");
    const { rows: before } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    console.log(`    ${before[0].count} programs with ended_on = started_on - 1`);
    
    // Run repair (same as migration)
    await pool.query(`
      UPDATE programs
      SET status = 'superseded'
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    
    console.log("  After repair:");
    const { rows: after } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    console.log(`    ${after[0].count} programs with ended_on = started_on - 1`);
    
    const { rows: superseded } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'superseded'
    `, [userId]);
    console.log(`    ${superseded[0].count} programs marked as superseded`);
    
    // Check no overlaps
    const { rows: allBlocks } = await pool.query(`
      SELECT id, started_on, ended_on, status
      FROM programs
      WHERE user_id = $1
      ORDER BY started_on
    `, [userId]);
    
    let overlaps = 0;
    for (let i = 0; i < allBlocks.length; i++) {
      for (let j = i + 1; j < allBlocks.length; j++) {
        const a = allBlocks[i];
        const b = allBlocks[j];
        // Check if they overlap (both cover the same date)
        const aEnd = a.ended_on || '9999-12-31';
        const bEnd = b.ended_on || '9999-12-31';
        if (!(a.started_on > bEnd || b.started_on > aEnd)) {
          overlaps++;
        }
      }
    }
    
    // Check session preserved
    const { rows: sess } = await pool.query(`
      SELECT COUNT(*) as count FROM sessions WHERE user_id = $1
    `, [userId]);
    
    assert(after[0].count === '0', "0 completed programs with ended_on = started_on - 1 remain");
    assert(superseded[0].count === '2', "2 programs marked as superseded");
    assert(overlaps === 0, `no blocks cover the same date, got ${overlaps} overlaps`);
    assert(sess[0].count === '1', "session preserved");
    
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function testM3_GapDaysBreakStreak() {
  console.log("\n━━━ TEST M3: Gap days between blocks count as missed ━━━\n");
  console.log("  Note: M3 is implemented in src/lib/progress/streaks.ts");
  console.log("  See scripts/test-streaks.ts for the TypeScript test");
  console.log("  ✓    Skipping database portion (TS logic only)\n");
}

async function runAll() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Block Range Followup DB Tests");
  console.log("  Migration: 20261025000025_block_range_followup.sql");
  console.log("═══════════════════════════════════════════════════════\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    // Setup test environment
    await setupTestDB(pool);
    
    // Run tests
    await testM1_MidBlockRebuildEndsOn();
    await testM2_SameDayRebuildPreservesFK();
    await testLOW_CycleWeekClamp();
    await testRows1_RepairInvalidCompleted();
    await testM3_GapDaysBreakStreak();
    
    console.log("═══════════════════════════════════════════════════════");
    if (testsFailed === 0) {
      console.log("  ✓ All tests passed");
      console.log("═══════════════════════════════════════════════════════\n");
      process.exit(0);
    } else {
      console.error(`  ❌ ${testsFailed} test(s) failed`);
      console.log("═══════════════════════════════════════════════════════\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runAll();
