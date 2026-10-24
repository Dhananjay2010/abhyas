/**
 * Block range followup DB tests (M1, M2, M3, Rows#1, LOW)
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

async function testM1_MidBlockRebuildPreservesDates() {
  console.log("\n━━━ TEST M1: Mid-block rebuild preserves dates and boundaries ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    const exerciseId = (await pool.query("SELECT id FROM exercises LIMIT 1")).rows[0]?.id;
    
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Create block: Oct 15 - Nov 11 (28 days, deload week 4 = Oct 29 - Nov 4)
    const blockId = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-15', '2026-11-11', 4, 0, 'active')
    `, [blockId, userId]);
    
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      // Rebuild on day 27 (Nov 10)
      await client.query(`
        SELECT rebuild_block($1, $2)
      `, ["2026-11-10", JSON.stringify({
        id: randomUUID(),
        block_number: 1,
        split_type: "ppl",
        days_per_week: 6,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-12-07", // payload ignored for mid-block
        deload_week: 4,
        days: [{
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
            rest_seconds: 120
          }]
        }]
      })]);
      await client.query("COMMIT");
      
      const { rows } = await pool.query(`
        SELECT started_on, ends_on, week_offset,
               cycle_week_for(week_offset, started_on, ends_on) as last_day_week
        FROM programs WHERE user_id = $1 AND status = 'active'
      `, [userId]);
      
      const prog = rows[0];
      
      assert(prog.started_on.toISOString().startsWith('2026-10-15'), 
        `started_on unchanged (2026-10-15), got ${prog.started_on.toISOString().split('T')[0]}`);
      assert(prog.ends_on.toISOString().startsWith('2026-11-11'), 
        `ends_on unchanged (2026-11-11), got ${prog.ends_on.toISOString().split('T')[0]}`);
      assert(prog.week_offset === 0, 
        `week_offset unchanged (0), got ${prog.week_offset}`);
      assert(prog.last_day_week <= 4, 
        `last day week <= 4, got ${prog.last_day_week}`);
      
      // Test deload date is unchanged (week 4 day 1 = Oct 29, Tue)
      const deloadStart = new Date('2026-10-29T00:00:00Z');
      const deloadWeek = await pool.query(`
        SELECT cycle_week_for($1, $2, $3) as week
      `, [prog.week_offset, prog.started_on, deloadStart]);
      assert(deloadWeek.rows[0].week === 4, 
        `deload still in week 4, got week ${deloadWeek.rows[0].week}`);
      
    } finally {
      client.release();
    }
    
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function testM2_HistoryLabelsPreserved() {
  console.log("\n━━━ TEST M2: History labels preserved after same-day rebuild ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    const exerciseId = (await pool.query("SELECT id FROM exercises LIMIT 1")).rows[0]?.id;
    
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    const blockId = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'upper_lower', 4, 'weights', 'strength', 'intermediate', '2026-10-24', '2026-11-20', 4, 0, 'active')
    `, [blockId, userId]);
    
    const programDayId = randomUUID();
    await pool.query(`
      INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
      VALUES ($1, $2, $3, 1, 'weights', 'Lower')
    `, [programDayId, blockId, userId]);
    
    const sessionId = randomUUID();
    await pool.query(`
      INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, status, week_in_block, is_deload, planned_type, actual_type)
      VALUES ($1, $2, $3, $4, '2026-10-24', 'completed', 1, false, 'weights', 'weights')
    `, [sessionId, userId, blockId, programDayId]);
    
    console.log(`  Created completed session with label 'Lower'\n`);
    
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
          label: "Workout",
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
      
      // Check History label (JOIN to program_days like History does)
      const { rows } = await pool.query(`
        SELECT s.id, s.program_day_id, pd.label, pd.status as day_status
        FROM sessions s
        LEFT JOIN program_days pd ON s.program_day_id = pd.id
        WHERE s.id = $1
      `, [sessionId]);
      
      const sess = rows[0];
      console.log(`  After rebuild:`);
      console.log(`    session.program_day_id: ${sess.program_day_id?.substring(0, 8) ?? 'NULL'}...`);
      console.log(`    History label: ${sess.label ?? 'NULL'}`);
      console.log(`    program_day.status: ${sess.day_status ?? 'NULL'}\n`);
      
      assert(sess.program_day_id !== null, "session.program_day_id is not NULL");
      assert(sess.label === "Lower", `History label unchanged ('Lower'), got '${sess.label}'`);
      assert(sess.day_status === 'superseded', `old program_day marked superseded, got '${sess.day_status}'`);
      
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

async function testRows1_RepairNoOverlaps() {
  console.log("\n━━━ TEST Rows#1: Repair preserves history, no overlaps ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Block 1: ended_on = started_on - 1
    const badBlock1 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, ended_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-20', '2026-11-16', '2026-10-19', 4, 0, 'completed')
    `, [badBlock1, userId]);
    
    // Block 2: ended_on = started_on - 1, WITH session
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
    
    // Successor block starting on SAME DAY as block2
    const successor = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 3, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-21', '2026-11-17', 4, 0, 'active')
    `, [successor, userId]);
    
    console.log(`  Before repair: 2 invalid completed programs\n`);
    
    // Run repair
    await pool.query(`
      UPDATE programs
      SET status = 'superseded'
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    
    const { rows: after } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    
    // Check overlaps using blockForDate logic
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
        // Only active/completed blocks should not overlap
        if ((a.status === 'active' || a.status === 'completed') &&
            (b.status === 'active' || b.status === 'completed')) {
          const aEnd = a.ended_on || '9999-12-31';
          const bEnd = b.ended_on || '9999-12-31';
          // Check if 2026-10-21 is covered by both (it should only be covered by successor)
          if (a.started_on <= '2026-10-21' && '2026-10-21' <= aEnd &&
              b.started_on <= '2026-10-21' && '2026-10-21' <= bEnd) {
            overlaps++;
            console.log(`  Overlap found: ${a.id.substring(0,8)} and ${b.id.substring(0,8)} both cover 2026-10-21`);
          }
        }
      }
    }
    
    const { rows: sess } = await pool.query(`
      SELECT COUNT(*) as count FROM sessions WHERE user_id = $1
    `, [userId]);
    
    assert(after[0].count === '0', "0 completed programs with ended_on = started_on - 1 remain");
    assert(overlaps === 0, `no active/completed blocks overlap, got ${overlaps} overlaps`);
    assert(sess[0].count === '1', "session preserved");
    
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function runAll() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Block Range Followup DB Tests");
  console.log("  Migration: 20261025000025_block_range_followup.sql");
  console.log("═══════════════════════════════════════════════════════\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    await setupTestDB(pool);
    
    await testM1_MidBlockRebuildPreservesDates();
    await testM2_HistoryLabelsPreserved();
    await testLOW_CycleWeekClamp();
    await testRows1_RepairNoOverlaps();
    
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
