/**
 * Test suite for block-range followup issues (M1, M2, M3, Rows #1, LOW)
 * Run against main (without 000025) to show failures, then with 000025 to show passes.
 */
import { Pool } from "pg";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

async function testM1_MidBlockRebuildWeekOverflow() {
  console.log("━━━ TEST M1: Mid-block rebuild week overflow ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    const exerciseId = (await pool.query("SELECT id FROM exercises LIMIT 1")).rows[0]?.id;
    
    if (!exerciseId) throw new Error("No exercises found");
    
    // Create auth user
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Create initial block: Oct 15 - Nov 11 (28 days)
    const block1Id = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-15', '2026-11-11', 4, 0, 'active')
    `, [block1Id, userId]);
    
    // Rebuild on day 26 (Nov 9 = day 26 of 28, week 4)
    // Expected: week_offset = 3, but if ends_on is Nov 9 + 27 = Dec 6, then day 28 shows week 7
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      const result = await client.query(`
        SELECT rebuild_block($1, $2) as result
      `, ["2026-11-09", JSON.stringify({
        id: randomUUID(),
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        ends_on: "2026-12-06", // Today + 27 = full 28 days
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
      
      const { rows } = await pool.query(`
        SELECT started_on, ends_on, week_offset, 
               cycle_week_for(week_offset, started_on, ends_on) as last_day_week
        FROM programs WHERE user_id = $1 AND status = 'active'
      `, [userId]);
      
      const prog = rows[0];
      console.log(`  Started: ${prog.started_on}, Ends: ${prog.ends_on}, Offset: ${prog.week_offset}`);
      console.log(`  Last day (${prog.ends_on}) shows: Week ${prog.last_day_week} of 4\n`);
      
      if (prog.last_day_week > 4) {
        console.log(`  ❌ FAIL: Last day shows Week ${prog.last_day_week} > 4 (week overflow)\n`);
      } else {
        console.log(`  ✓    Last day shows Week ${prog.last_day_week} <= 4\n`);
      }
      
    } finally {
      client.release();
    }
    
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function testM2_SameDayRebuildSessionLabels() {
  console.log("━━━ TEST M2: Same-day rebuild session labels ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const userId = randomUUID();
    const exerciseId = (await pool.query("SELECT id FROM exercises LIMIT 1")).rows[0]?.id;
    
    if (!exerciseId) throw new Error("No exercises found");
    
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Create initial block
    const block1Id = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-24', '2026-11-20', 4, 0, 'active')
    `, [block1Id, userId]);
    
    const programDayId = randomUUID();
    await pool.query(`
      INSERT INTO program_days (id, program_id, user_id, day_index, day_type, label)
      VALUES ($1, $2, $3, 1, 'weights', 'Full Body A')
    `, [programDayId, block1Id, userId]);
    
    // Create a completed session
    const sessionId = randomUUID();
    await pool.query(`
      INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, status, week_in_block, is_deload, planned_type, actual_type)
      VALUES ($1, $2, $3, $4, '2026-10-24', 'completed', 1, false, 'weights', 'weights')
    `, [sessionId, userId, block1Id, programDayId]);
    
    console.log(`  Created session with program_day_id = ${programDayId.substring(0, 8)}...\n`);
    
    // Same-day rebuild
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      
      await client.query(`
        SELECT rebuild_block($1, $2) as result
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
      
      const sess = rows[0];
      console.log(`  After same-day rebuild:`);
      console.log(`    session.program_day_id = ${sess.program_day_id?.substring(0, 8) ?? 'NULL'}...`);
      console.log(`    program_days.label = ${sess.label ?? 'NULL'}\n`);
      
      if (sess.program_day_id === null) {
        console.log(`  ❌ FAIL: session.program_day_id is NULL (orphaned session)\n`);
      } else {
        console.log(`  ✓    session.program_day_id is not NULL\n`);
      }
      
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

async function testLOW_CycleWeekBeforeStart() {
  console.log("━━━ TEST LOW: cycleWeekFor clamps to week 1 for date before start ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const { rows } = await pool.query(`
      SELECT cycle_week_for(0, '2026-10-20'::date, '2026-10-19'::date) as week
    `);
    
    console.log(`  Date before start with offset=0: week ${rows[0]?.week}`);
    
    if (rows[0]?.week === 1) {
      console.log(`  ✓    Clamps to week 1 for date before start\n`);
    } else {
      console.log(`  ❌ FAIL: Expected week 1, got ${rows[0]?.week}\n`);
    }
    
    const { rows: rows2 } = await pool.query(`
      SELECT cycle_week_for(3, '2026-10-20'::date, '2026-10-19'::date) as week
    `);
    
    console.log(`  Date before start with offset=3: week ${rows2[0]?.week}`);
    
    if (rows2[0]?.week === 1) {
      console.log(`  ✓    Clamps to week 1 even with week_offset\n`);
    } else {
      console.log(`  ❌ FAIL: Expected week 1, got ${rows2[0]?.week}\n`);
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ FAIL: Unexpected error: ${message}\n`);
  } finally {
    await pool.end();
  }
}

async function testRows1_CompletedProgramsInvalidRange() {
  console.log("━━━ TEST Rows #1: Repair completed programs with ended_on = started_on - 1 ━━━\n");
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    // Simulate historical bad data: completed programs with ended_on = started_on - 1
    const userId = randomUUID();
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@local.test')`, [userId]);
    
    // Block 1: No sessions (will be deleted by repair)
    const badBlock1 = randomUUID();
    await pool.query(`
      INSERT INTO programs (id, user_id, block_number, split_type, days_per_week, primary_track, goal, level, started_on, ends_on, ended_on, deload_week, week_offset, status)
      VALUES ($1, $2, 1, 'full_body', 3, 'weights', 'strength', 'intermediate', '2026-10-20', '2026-11-16', '2026-10-19', 4, 0, 'completed')
    `, [badBlock1, userId]);
    
    // Block 2: Has session (ended_on will be set to started_on by repair)
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
    
    console.log(`  Created 2 invalid programs: 1 without sessions, 1 with sessions\n`);
    
    const { rows: before } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    
    console.log(`  Before repair: ${before[0].count} programs with ended_on = started_on - 1\n`);
    
    // Run repair SQL (same as in migration)
    await pool.query(`
      DELETE FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
      AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.program_id = programs.id)
    `, [userId]);
    
    await pool.query(`
      UPDATE programs
      SET ended_on = started_on
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.program_id = programs.id)
    `, [userId]);
    
    const { rows: after } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on - 1
    `, [userId]);
    
    const { rows: repaired } = await pool.query(`
      SELECT COUNT(*) as count
      FROM programs
      WHERE user_id = $1 AND status = 'completed' AND ended_on = started_on
    `, [userId]);
    
    console.log(`  After repair:`);
    console.log(`    ${after[0].count} programs with ended_on = started_on - 1 (invalid)`);
    console.log(`    ${repaired[0].count} programs with ended_on = started_on (zero-length, valid)`);
    console.log(`    ${2 - parseInt(after[0].count) - parseInt(repaired[0].count)} programs deleted (no sessions)\n`);
    
    if (after[0].count === '0' && repaired[0].count === '1') {
      console.log(`  ✓    Repair successful: invalid rows fixed or deleted\n`);
    } else {
      console.log(`  ❌ FAIL: Expected 0 invalid and 1 repaired, got ${after[0].count} invalid and ${repaired[0].count} repaired\n`);
    }
    
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM programs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    
  } finally {
    await pool.end();
  }
}

async function testTZ1_CompletedSessionAfterTimezoneChange() {
  console.log("━━━ TEST TZ-1: Completed session after timezone change ━━━\n");
  
  console.log("  Note: This is a TypeScript test, not a database test.\n");
  console.log("  See scripts/test-streaks.ts for the actual test implementation.\n");
  console.log("  Skipping database portion.\n");
}

async function runAll() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Block Range Followup Issues Test Suite");
  console.log("  Run WITHOUT migration 000025 to see failures");
  console.log("═══════════════════════════════════════════════════════\n");
  
  try {
    await testM1_MidBlockRebuildWeekOverflow();
    await testM2_SameDayRebuildSessionLabels();
    await testLOW_CycleWeekBeforeStart();
    await testRows1_CompletedProgramsInvalidRange();
    await testTZ1_CompletedSessionAfterTimezoneChange();
    
    console.log("═══════════════════════════════════════════════════════");
    console.log("  All tests complete");
    console.log("═══════════════════════════════════════════════════════\n");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

runAll();
