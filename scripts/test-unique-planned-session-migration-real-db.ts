/**
 * Real database test: unique index on (user_id, local_date) WHERE status='planned'
 *
 * Verifies migration 20261025000033:
 * - Dedupes planned sessions per (user_id, local_date)
 * - Ranks by: has sets DESC, has exercises DESC, has breathing DESC, created_at ASC, id ASC
 * - DELETEs childless duplicates
 * - UPDATEs data-bearing duplicates to status='skipped'
 * - Zero child rows lost (session_exercises, session_sets, breathing_logs)
 *
 * Run: REAL_DB=1 npm run test:unique-planned-session-migration-real-db
 */

import { readFileSync } from "fs";
import { Client } from "pg";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const dbUrl = SUPABASE_URL.replace("http://", "postgresql://postgres:postgres@").replace(":54321", ":54322/postgres");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "ok" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function main() {
  if (process.env.REAL_DB !== "1") {
    console.log("⏭️  Skipping real DB test (REAL_DB=1 not set)");
    return;
  }

  console.log("\nUnique planned session migration test\n");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Everything in one transaction, ROLLBACK at end
    await client.query("BEGIN");

    // Drop the index - migrations have already run
    await client.query("DROP INDEX IF EXISTS public.sessions_user_date_planned_unique;");

    // Create test user
    const userId = "00000000-1111-2222-3333-444444444444";
    await client.query(`
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      VALUES ($1, 'test-migration@example.com', 'dummy', now(), now(), now())
      ON CONFLICT (id) DO NOTHING
    `, [userId]);

    // Create test program/day/exercise
    const programId = "00000000-0000-0000-0000-000000000001";
    const programDayId = "00000000-0000-0000-0000-000000000002";
    const exerciseId = (await client.query("SELECT id FROM exercises LIMIT 1")).rows[0].id;

    await client.query(`
      INSERT INTO programs (id, user_id, goal, level, primary_track, split_type, days_per_week, deload_week, started_on, ends_on, block_number, week_offset, status)
      VALUES ($1, $2, 'strength', 'intermediate', 'weights', 'upper_lower', 3, 4, '2026-11-01', '2026-12-19', 1, 0, 'active')
      ON CONFLICT (id) DO NOTHING
    `, [programId, userId]);

    await client.query(`
      INSERT INTO program_days (id, program_id, user_id, day_index, day_type, status)
      VALUES ($1, $2, $3, 1, 'weights', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [programDayId, programId, userId]);

    // Test cases with explicit UUIDs and timestamps
    const baseTime = "2026-11-15T10:00:00Z";
    const laterTime = "2026-11-15T10:30:00Z";
    const latestTime = "2026-11-15T11:00:00Z";

    // Case IDs
    const caseA1 = "a0000000-0000-0000-0000-000000000001";
    const caseA2 = "a0000000-0000-0000-0000-000000000002";
    const caseB1 = "b0000000-0000-0000-0000-000000000001";
    const caseB2 = "b0000000-0000-0000-0000-000000000002";
    const caseB2_1 = "c0000000-0000-0000-0000-000000000001";
    const caseB2_2 = "c0000000-0000-0000-0000-000000000002";
    const caseC1 = "d0000000-0000-0000-0000-000000000001";
    const caseC2 = "d0000000-0000-0000-0000-000000000002";
    const caseD1 = "e0000000-0000-0000-0000-000000000001";
    const caseD2 = "e0000000-0000-0000-0000-000000000002";
    const caseD3 = "e0000000-0000-0000-0000-000000000003";
    const caseD4 = "e0000000-0000-0000-0000-000000000004";
    const caseE1 = "f0000000-0000-0000-0000-000000000001";
    const caseE2 = "f0000000-0000-0000-0000-000000000002";
    const caseF1 = "90000000-0000-0000-0000-000000000001";
    const caseF2 = "90000000-0000-0000-0000-000000000002";
    const caseG1 = "10000000-0000-0000-0000-000000000001";
    const caseG2 = "00000000-0000-0000-0000-000000000002";
    const caseH1 = "80000000-0000-0000-0000-000000000001";
    const caseH2 = "80000000-0000-0000-0000-000000000002";
    const caseH3 = "80000000-0000-0000-0000-000000000003";

    // Insert sessions
    await client.query(`
      INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, status, planned_type, week_in_block, is_deload, created_at) VALUES
      -- Case (a): pure dup
      ($1, $2, $3, $4, '2026-11-20', 'planned', 'weights', 1, false, $5),
      ($6, $2, $3, $4, '2026-11-20', 'planned', 'weights', 1, false, $7),
      -- Case (b): higher id has exercises and sets
      ($8, $2, $3, $4, '2026-11-21', 'planned', 'weights', 1, false, $5),
      ($9, $2, $3, $4, '2026-11-21', 'planned', 'weights', 1, false, $5),
      -- Case (b2): higher id has 1 exercise and 0 sets
      ($10, $2, $3, $4, '2026-11-22', 'planned', 'weights', 1, false, $5),
      ($11, $2, $3, $4, '2026-11-22', 'planned', 'weights', 1, false, $5),
      -- Case (c): both have exercises and sets
      ($12, $2, $3, $4, '2026-11-23', 'planned', 'weights', 1, false, $5),
      ($13, $2, $3, $4, '2026-11-23', 'planned', 'weights', 1, false, $7),
      -- Case (d): mixed statuses
      ($14, $2, $3, $4, '2026-11-24', 'planned', 'weights', 1, false, $5),
      ($15, $2, $3, $4, '2026-11-24', 'completed', NULL, 1, false, $5),
      ($16, $2, $3, $4, '2026-11-24', 'in_progress', NULL, 1, false, $5),
      ($17, $2, $3, $4, '2026-11-24', 'skipped', NULL, 1, false, $5),
      -- Case (e): different dates
      ($18, $2, $3, $4, '2026-11-25', 'planned', 'weights', 1, false, $5),
      ($19, $2, $3, $4, '2026-11-26', 'planned', 'weights', 1, false, $5),
      -- Case (f): dropped row has breathing_log
      ($20, $2, $3, $4, '2026-11-27', 'planned', 'meditation', 1, false, $5),
      ($21, $2, $3, $4, '2026-11-27', 'planned', 'meditation', 1, false, $7),
      -- Case (g): lowest uuid is NEWER empty, older has exercise
      ($22, $2, $3, $4, '2026-11-28', 'planned', 'weights', 1, false, $5),
      ($23, $2, $3, $4, '2026-11-28', 'planned', 'weights', 1, false, $7),
      -- Case (h): three planned, middle has children
      ($24, $2, $3, $4, '2026-11-29', 'planned', 'weights', 1, false, $5),
      ($25, $2, $3, $4, '2026-11-29', 'planned', 'weights', 1, false, $7),
      ($26, $2, $3, $4, '2026-11-29', 'planned', 'weights', 1, false, $27)
    `, [
      caseA1, userId, programId, programDayId, baseTime,
      caseA2, laterTime,
      caseB1, caseB2,
      caseB2_1, caseB2_2,
      caseC1, caseC2,
      caseD1, caseD2, caseD3, caseD4,
      caseE1, caseE2,
      caseF1, caseF2,
      caseG1, caseG2,
      caseH1, caseH2, caseH3, latestTime
    ]);

    // Insert session_exercises
    await client.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status, planned_sets) VALUES
      -- Case (b): B2 has exercise with sets
      ('be000000-0000-0000-0000-000000000002', $1, $2, $3, 0, 'pending', 3),
      -- Case (b2): B2_2 has exercise without sets
      ('be000000-0000-0000-0000-000000000022', $4, $2, $3, 0, 'pending', 3),
      -- Case (c): both have exercises with sets
      ('ce000000-0000-0000-0000-000000000001', $5, $2, $3, 0, 'pending', 3),
      ('ce000000-0000-0000-0000-000000000002', $6, $2, $3, 0, 'pending', 3),
      -- Case (g): G1 has exercise
      ('91000000-0000-0000-0000-000000000001', $7, $2, $3, 0, 'pending', 3),
      -- Case (h): H2 (middle) has exercise
      ('8e000000-0000-0000-0000-000000000002', $8, $2, $3, 0, 'pending', 3)
    `, [caseB2, userId, exerciseId, caseB2_2, caseC1, caseC2, caseG1, caseH2]);

    // Insert session_sets
    await client.query(`
      INSERT INTO session_sets (user_id, session_exercise_id, set_number, reps, weight_kg, is_warmup_set) VALUES
      -- Case (b): B2 has sets
      ($1, 'be000000-0000-0000-0000-000000000002', 1, 10, 100, false),
      -- Case (c): both have sets
      ($1, 'ce000000-0000-0000-0000-000000000001', 1, 10, 100, false),
      ($1, 'ce000000-0000-0000-0000-000000000002', 1, 10, 100, false)
    `, [userId]);

    // Insert breathing_log for case (f)
    await client.query(`
      INSERT INTO breathing_logs (session_id, user_id, pattern_name, breaths, cycles_completed, planned_cycles, seconds, guidance, ended_early) VALUES
      ($1, $2, 'Box Breathing', 20, 5, 5, 80, 'tones', false)
    `, [caseF2, userId]);

    // Count children before migration
    const exercisesBefore = (await client.query("SELECT COUNT(*) FROM session_exercises WHERE user_id = $1", [userId])).rows[0].count;
    const setsBefore = (await client.query("SELECT COUNT(*) FROM session_sets WHERE user_id = $1", [userId])).rows[0].count;
    const breathingBefore = (await client.query("SELECT COUNT(*) FROM breathing_logs WHERE user_id = $1", [userId])).rows[0].count;

    console.log("Before migration:");
    console.log(`  session_exercises: ${exercisesBefore}`);
    console.log(`  session_sets: ${setsBefore}`);
    console.log(`  breathing_logs: ${breathingBefore}\n`);

    // Execute migration SQL (strip any BEGIN/COMMIT, we're already in a transaction)
    const migrationSql = readFileSync("supabase/migrations/20261025000033_unique_planned_session_per_user_day.sql", "utf8");
    const sqlBody = migrationSql
      .replace(/^-- .*$/gm, "") // Remove comments
      .replace(/^\s*$/gm, "")    // Remove empty lines
      .trim();
    
    // Extract just the DO block and CREATE INDEX
    const doBlockMatch = sqlBody.match(/DO \$\$[\s\S]*?END \$\$;/);
    const createIndexMatch = sqlBody.match(/CREATE UNIQUE INDEX[\s\S]*?;/);
    
    if (doBlockMatch) {
      await client.query(doBlockMatch[0]);
    }

    // Count children after migration
    const exercisesAfter = (await client.query("SELECT COUNT(*) FROM session_exercises WHERE user_id = $1", [userId])).rows[0].count;
    const setsAfter = (await client.query("SELECT COUNT(*) FROM session_sets WHERE user_id = $1", [userId])).rows[0].count;
    const breathingAfter = (await client.query("SELECT COUNT(*) FROM breathing_logs WHERE user_id = $1", [userId])).rows[0].count;

    console.log("After migration:");
    console.log(`  session_exercises: ${exercisesAfter}`);
    console.log(`  session_sets: ${setsAfter}`);
    console.log(`  breathing_logs: ${breathingAfter}\n`);

    console.log("Zero child rows lost:");
    check("session_exercises count unchanged", exercisesBefore === exercisesAfter);
    check("session_sets count unchanged", setsBefore === setsAfter);
    check("breathing_logs count unchanged", breathingBefore === breathingAfter);

    // Query final state
    const sessions = (await client.query("SELECT id, local_date, status FROM sessions WHERE user_id = $1 ORDER BY local_date, id", [userId])).rows;

    console.log("\nCase (a): pure dup");
    const caseARows = sessions.filter(s => s.local_date === "2026-11-20" && s.status === "planned");
    check("Exactly one planned row", caseARows.length === 1);
    check("Oldest row kept", caseARows[0]?.id === caseA1, `got ${caseARows[0]?.id}`);

    console.log("\nCase (b): higher id has exercises and sets");
    const caseBRows = sessions.filter(s => s.local_date === "2026-11-21" && s.status === "planned");
    const caseBSkipped = sessions.filter(s => s.local_date === "2026-11-21" && s.status === "skipped");
    check("Exactly one planned row", caseBRows.length === 1);
    check("Row with sets kept as planned", caseBRows[0]?.id === caseB2);
    check("Childless row deleted (not skipped)", caseBSkipped.length === 0);

    console.log("\nCase (b2): higher id has 1 exercise and 0 sets");
    const caseB2Rows = sessions.filter(s => s.local_date === "2026-11-22" && s.status === "planned");
    const caseB2Skipped = sessions.filter(s => s.local_date === "2026-11-22" && s.status === "skipped");
    check("Exactly one planned row", caseB2Rows.length === 1);
    check("Row with exercise (no sets) kept as planned", caseB2Rows[0]?.id === caseB2_2);
    check("Childless row deleted", caseB2Skipped.length === 0);

    console.log("\nCase (c): both have exercises and sets");
    const caseCRows = sessions.filter(s => s.local_date === "2026-11-23" && s.status === "planned");
    const caseCSkipped = sessions.filter(s => s.local_date === "2026-11-23" && s.status === "skipped");
    check("Exactly one planned row", caseCRows.length === 1);
    check("Older row kept as planned", caseCRows[0]?.id === caseC1, `got ${caseCRows[0]?.id}`);
    check("Newer data-bearing row skipped (not deleted)", caseCSkipped.length === 1 && caseCSkipped[0]?.id === caseC2);

    console.log("\nCase (d): mixed statuses");
    const caseDAll = sessions.filter(s => s.local_date === "2026-11-24");
    check("All 4 statuses present", caseDAll.length === 4);
    check("Planned row untouched", caseDAll.some(s => s.id === caseD1 && s.status === "planned"));
    check("Completed row untouched", caseDAll.some(s => s.id === caseD2 && s.status === "completed"));
    check("In-progress row untouched", caseDAll.some(s => s.id === caseD3 && s.status === "in_progress"));
    check("Skipped row untouched", caseDAll.some(s => s.id === caseD4 && s.status === "skipped"));

    console.log("\nCase (e): different dates");
    check("Both planned rows kept", 
      sessions.some(s => s.id === caseE1 && s.status === "planned") &&
      sessions.some(s => s.id === caseE2 && s.status === "planned")
    );

    console.log("\nCase (f): dropped row has breathing_log");
    const caseFRows = sessions.filter(s => s.local_date === "2026-11-27" && s.status === "planned");
    const caseFSkipped = sessions.filter(s => s.local_date === "2026-11-27" && s.status === "skipped");
    check("Exactly one planned row", caseFRows.length === 1);
    check("Childless row kept as planned", caseFRows[0]?.id === caseF1);
    check("Row with breathing_log skipped (not deleted)", caseFSkipped.length === 1 && caseFSkipped[0]?.id === caseF2);

    console.log("\nCase (g): lowest uuid is NEWER empty, older has exercise");
    const caseGRows = sessions.filter(s => s.local_date === "2026-11-28" && s.status === "planned");
    check("Exactly one planned row", caseGRows.length === 1);
    check("Older row with exercise kept (not lower uuid)", caseGRows[0]?.id === caseG1, `got ${caseGRows[0]?.id}`);

    console.log("\nCase (h): three planned, middle has children");
    const caseHRows = sessions.filter(s => s.local_date === "2026-11-29" && s.status === "planned");
    const caseHSkipped = sessions.filter(s => s.local_date === "2026-11-29" && s.status === "skipped");
    check("Exactly one planned row", caseHRows.length === 1);
    check("Oldest row kept as planned", caseHRows[0]?.id === caseH1);
    check("Middle row (data-bearing) skipped", caseHSkipped.some(s => s.id === caseH2));
    check("Newest childless row deleted", !sessions.some(s => s.id === caseH3));

    console.log("\nIndex creation:");
    if (createIndexMatch) {
      await client.query(createIndexMatch[0]);
    }
    
    // Try to insert duplicate planned
    try {
      await client.query(`
        INSERT INTO sessions (user_id, program_id, program_day_id, local_date, status, planned_type, week_in_block, is_deload)
        VALUES ($1, $2, $3, '2026-11-20', 'planned', 'weights', 1, false)
      `, [userId, programId, programDayId]);
      check("Index prevents duplicate planned", false);
    } catch (e) {
      const err = e as { code?: string };
      check("Index prevents duplicate planned", err.code === "23505");
    }

    // ROLLBACK everything
    await client.query("ROLLBACK");

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  } else {
    console.log("\n✅ All migration checks passed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
