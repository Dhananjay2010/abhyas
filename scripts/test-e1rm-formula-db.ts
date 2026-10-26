/**
 * Database tests for e1RM formula with 12-rep cap.
 *
 * Tests that the migration 20261025000030_align_e1rm_formula.sql correctly:
 * - Updates the SQL view's best_e1rm calculation with the 12-rep cap
 * - Recomputes exercise_progress.best_e1rm for all existing rows
 * - Handles edge cases: reps=1, high reps, in-progress sessions, timed exercises, warmups, etc.
 * - Is idempotent (can be run multiple times safely)
 *
 * This test executes the REAL migration file from disk, not a copy, to verify the actual deployed SQL.
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test npm run test:e1rm-formula-db
 * Or in CI: Skips (requires isolated PostgreSQL with schema creation privileges)
 */
import { randomUUID } from "crypto";
import type { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const REQUIRE_DB = process.env.REQUIRE_DB === '1';

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓   " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  if (!DATABASE_URL) {
    if (REQUIRE_DB) {
      console.error("\n❌ REQUIRE_DB=1 but DATABASE_URL is not set");
      process.exit(1);
    }
    console.log("\n⏭️  Skipping DB tests (DATABASE_URL not set)");
    console.log("   Set DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test to run\n");
    return true;
  }

  const { Pool } = await import("pg");
  const { readFileSync, readdirSync } = await import("fs");
  const { join } = await import("path");
  const { estimateOneRepMax, roundToStoragePrecision } = await import("../src/lib/program/progression.js");
  
  const pool = new Pool({ connectionString: DATABASE_URL });

  async function setupDatabase(pool: Pool) {
    const dbSuffix = `e1rm_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const dbName = `abhyas_test_${dbSuffix}`;
    
    try {
      await pool.query(`CREATE DATABASE ${dbName}`);
    } catch (err) {
      const error = err as { code?: string };
      if (error.code !== '42P04') {
        throw err;
      }
    }
    
    // TypeScript narrowing: DATABASE_URL is checked above
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL is required but not set");
    }
    
    const dbUrlParts = DATABASE_URL.match(/^(.+\/)([^\/]+)$/);
    if (!dbUrlParts) {
      throw new Error(`Invalid DATABASE_URL format: ${DATABASE_URL}`);
    }
    const testConnectionString = `${dbUrlParts[1]}${dbName}`;
    const testPool = new Pool({ connectionString: testConnectionString });
    
    await testPool.query(`
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

      -- Mirror Supabase: new tables in public are granted to anon/authenticated by default.
      -- Without this, a missing REVOKE in the migration would go unnoticed locally.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    `);

    const migrationsDir = join(__dirname, "../supabase/migrations");
    const files = readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    // Apply all migrations EXCEPT the e1RM alignment migration (we'll run it explicitly in tests)
    for (const file of files) {
      if (file === "20261025000030_align_e1rm_formula.sql") {
        console.log(`  Skipping migration: ${file} (will run explicitly in tests)`);
        continue;
      }
      console.log(`  Applying migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await testPool.query(sql);
    }
    
    return { testPool, dbName };
  }

  let testPool: Pool | null = null;
  let dbName: string | null = null;

  try {
    console.log("Setting up database schema and migrations...\n");
    const setup = await setupDatabase(pool);
    testPool = setup.testPool;
    dbName = setup.dbName;
    console.log(`✓ Database ready (database: ${dbName})\n`);
    
    async function createTestUser() {
      const userId = randomUUID();
      await testPool!.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2)",
        [userId, `test-${userId}@example.com`]
      );
      await testPool!.query(`
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

    async function createTestExercise(name: string, metric: string = 'reps') {
      const exerciseId = randomUUID();
      await testPool!.query(`
        INSERT INTO exercises (id, slug, name, tracks, category, primary_muscles, is_active, metric)
        VALUES ($1, $2, $3, ARRAY['weights']::track_type[], 'strength', ARRAY['chest']::muscle[], true, $4::exercise_metric)
      `, [exerciseId, name.toLowerCase().replace(/\s+/g, '-'), name, metric]);
      return exerciseId;
    }

    async function logSession(
      userId: string,
      exerciseId: string,
      localDate: string,
      sets: Array<{ weight: number; reps: number }>,
      sessionStatus: string = 'completed',
      exerciseStatus: string = 'completed'
    ) {
      const sessionId = randomUUID();
      const sessionExerciseId = randomUUID();

      await testPool!.query(`
        INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
        VALUES ($1, $2, $3, 1, false, 'weights', 'weights', $4, now(), now())
      `, [sessionId, userId, localDate, sessionStatus]);

      await testPool!.query(`
        INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status, completed_at)
        VALUES ($1, $2, $3, $4, 0, $5, now())
      `, [sessionExerciseId, sessionId, userId, exerciseId, exerciseStatus]);

      for (let i = 0; i < sets.length; i++) {
        const setId = randomUUID();
        await testPool!.query(`
          INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
          VALUES ($1, $2, $3, $4, $5, $6, false)
        `, [setId, sessionExerciseId, userId, i + 1, sets[i].reps, sets[i].weight]);
      }
    }

    // Seed test data with various edge cases BEFORE running the e1RM migration
    console.log("TEST SETUP: Seeding test data with stale/inflated e1RM values\n");

    const userId = await createTestUser();
    
    // Exercise 1: Uncapped high-rep e1RM (40kg × 15 reps)
    const ex1 = await createTestExercise("Exercise 1");
    await logSession(userId, ex1, "2026-10-20", [{ weight: 40, reps: 15 }]);
    // Manually insert inflated uncapped e1RM (40 × (1 + 15/30) = 60.00)
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 60.00, 1)
    `, [userId, ex1]);

    // Exercise 2: reps=1 with buggy 1.0333× e1RM (100kg × 1)
    const ex2 = await createTestExercise("Exercise 2");
    await logSession(userId, ex2, "2026-10-21", [{ weight: 100, reps: 1 }]);
    // Manually insert buggy e1RM (100 × 1.0333 = 103.33)
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 103.33, 1)
    `, [userId, ex2]);

    // Exercise 3: in_progress session with completed exercise (80kg × 4 reps = 90.67)
    const ex3 = await createTestExercise("Exercise 3");
    await logSession(userId, ex3, "2026-10-22", [{ weight: 80, reps: 4 }], 'in_progress', 'completed');
    // Insert stale e1RM before the in-progress session
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 85.00, 1)
    `, [userId, ex3]);

    // Exercise 4: No-sets row (should remain unchanged)
    const ex4 = await createTestExercise("Exercise 4");
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 42.00, 0)
    `, [userId, ex4]);

    // Exercise 5: Timed exercise (seconds metric, should be excluded)
    const ex5 = await createTestExercise("Exercise 5", 'seconds');
    await logSession(userId, ex5, "2026-10-23", [{ weight: 50, reps: 10 }]);
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 100.00, 1)
    `, [userId, ex5]);

    // Exercise 6: Mixed sets (52.5×8, 37.5×11) for TS vs SQL consistency check
    const ex6 = await createTestExercise("Exercise 6");
    await logSession(userId, ex6, "2026-10-24", [
      { weight: 52.5, reps: 8 },
      { weight: 37.5, reps: 11 }
    ]);
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 50.00, 1)
    `, [userId, ex6]);

    // Exercise 7: SKIPPED session_exercise (sets should not count, row unchanged)
    const ex7 = await createTestExercise("Exercise 7");
    const sessionId7 = randomUUID();
    const sessionExId7 = randomUUID();
    await testPool!.query(`
      INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
      VALUES ($1, $2, $3, 1, false, 'weights', 'weights', 'completed', now(), now())
    `, [sessionId7, userId, "2026-10-25"]);
    await testPool!.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status)
      VALUES ($1, $2, $3, $4, 0, 'skipped')
    `, [sessionExId7, sessionId7, userId, ex7]);
    // Add sets that should NOT count because exercise was skipped
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 1, 10, 90.0, false)
    `, [randomUUID(), sessionExId7, userId]);
    // Stale best_e1rm that should remain unchanged
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 75.00, 1)
    `, [userId, ex7]);

    // Exercise 8: Warmup-only exercise (warmup sets should not count, row unchanged)
    const ex8 = await createTestExercise("Exercise 8");
    const sessionId8 = randomUUID();
    const sessionExId8 = randomUUID();
    await testPool!.query(`
      INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
      VALUES ($1, $2, $3, 1, false, 'weights', 'weights', 'completed', now(), now())
    `, [sessionId8, userId, "2026-10-26"]);
    await testPool!.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status, completed_at)
      VALUES ($1, $2, $3, $4, 0, 'completed', now())
    `, [sessionExId8, sessionId8, userId, ex8]);
    // Add only warmup sets (should not count)
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 1, 8, 70.0, true)
    `, [randomUUID(), sessionExId8, userId]);
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 2, 6, 80.0, true)
    `, [randomUUID(), sessionExId8, userId]);
    // Stale best_e1rm that should remain unchanged
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 88.00, 1)
    `, [userId, ex8]);

    // Exercise 9: Non-completed session (MED-2: session status filter test)
    const ex9 = await createTestExercise("Exercise 9");
    const sessionId9 = randomUUID();
    const sessionExId9 = randomUUID();
    await testPool!.query(`
      INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at)
      VALUES ($1, $2, $3, 1, false, 'weights', 'weights', 'skipped', now())
    `, [sessionId9, userId, "2026-10-27"]);
    await testPool!.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status, completed_at)
      VALUES ($1, $2, $3, $4, 0, 'completed', now())
    `, [sessionExId9, sessionId9, userId, ex9]);
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 1, 10, 95.0, false)
    `, [randomUUID(), sessionExId9, userId]);
    // Stale best_e1rm that should remain unchanged (view filters s.status='completed')
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 110.00, 1)
    `, [userId, ex9]);

    // Exercise 14: Sets with weight_kg = 0 (MED-2: weight_kg > 0 filter test)
    const ex14 = await createTestExercise("Exercise 14");
    const sessionId14 = randomUUID();
    const sessionExId14 = randomUUID();
    await testPool!.query(`
      INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
      VALUES ($1, $2, $3, 1, false, 'bodyweight', 'bodyweight', 'completed', now(), now())
    `, [sessionId14, userId, "2026-11-01"]);
    await testPool!.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status, completed_at)
      VALUES ($1, $2, $3, $4, 0, 'completed', now())
    `, [sessionExId14, sessionId14, userId, ex14]);
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 1, 15, 0, false)
    `, [randomUUID(), sessionExId14, userId]);
    // Stale best_e1rm that should remain unchanged (filters weight_kg > 0)
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 125.00, 1)
    `, [userId, ex14]);

    // Exercise 15: Heavy warm-up set HEAVIER than working sets (MED-2: warm-up filter test)
    // Working set: 100×5 (e1RM = 116.67), Warm-up: 140×5 (e1RM = 163.33 if included)
    // View must report only the working e1RM (116.67), not the warm-up
    const ex15 = await createTestExercise("Exercise 15 - heavy warmup");
    const sessionId15 = randomUUID();
    const sessionExId15 = randomUUID();
    await testPool!.query(`
      INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
      VALUES ($1, $2, $3, 1, false, 'weights', 'weights', 'completed', now(), now())
    `, [sessionId15, userId, "2026-11-02"]);
    await testPool!.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index, status, completed_at)
      VALUES ($1, $2, $3, $4, 0, 'completed', now())
    `, [sessionExId15, sessionId15, userId, ex15]);
    // Warm-up set (heavier): 140×5
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 1, 5, 140.0, true)
    `, [randomUUID(), sessionExId15, userId]);
    // Working set: 100×5
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 2, 5, 100.0, false)
    `, [randomUUID(), sessionExId15, userId]);
    // Seed incorrect best_e1rm (as if warm-up was included)
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 163.33, 1)
    `, [userId, ex15]);

    // Exercise 16: Swapped exercise (sets must use se.exercise_id, not swapped_from_exercise_id)
    const exOriginal = await createTestExercise("Exercise 16 Original");
    const exSwapped = await createTestExercise("Exercise 16 Swapped To");
    const sessionId16 = randomUUID();
    const sessionExId16 = randomUUID();
    await testPool!.query(`
      INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
      VALUES ($1, $2, $3, 1, false, 'weights', 'weights', 'completed', now(), now())
    `, [sessionId16, userId, "2026-11-03"]);
    await testPool!.query(`
      INSERT INTO session_exercises (id, session_id, user_id, exercise_id, swapped_from_exercise_id, order_index, status, completed_at)
      VALUES ($1, $2, $3, $4, $5, 0, 'completed', now())
    `, [sessionExId16, sessionId16, userId, exSwapped, exOriginal]);
    // Sets with weight 120×6 (e1RM = 144.00)
    await testPool!.query(`
      INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
      VALUES ($1, $2, $3, 1, 6, 120.0, false)
    `, [randomUUID(), sessionExId16, userId]);
    // Seed progress for BOTH exercises (sets should only affect exSwapped)
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 0, 0), ($1, $3, 0, 0)
    `, [userId, exOriginal, exSwapped]);

    // Account-deletion user (MED-1): has sets and a progress row BEFORE the
    // migration, so the migration backs up their row; deleting the account
    // must remove that backup row too.
    const delUser = await createTestUser();
    const exDel = await createTestExercise("Exercise Del - account deletion");
    await logSession(delUser, exDel, "2026-10-20", [{ weight: 60, reps: 15 }]);
    await testPool!.query(`
      INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
      VALUES ($1, $2, 90.00, 1)
    `, [delUser, exDel]);

    console.log("✓ Test data seeded\n");

    // Read the REAL migration file from disk
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const migrationPath = join(__dirname, "../supabase/migrations/20261025000030_align_e1rm_formula.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    console.log("APPLYING MIGRATION: 20261025000030_align_e1rm_formula.sql (from disk)\n");
    await testPool!.query(migrationSQL);
    console.log("✓ Migration applied\n");

    // Now run tests against the migrated state

    console.log("TEST 1: reps=1 gives weight itself (100 kg × 1 = 100.00 kg, not 103.33 kg)");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex2]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("reps=1 returns weight itself", Math.abs(e1rm - 100) < 0.01, `expected 100, got ${e1rm}`);
      check("reps=1 does NOT give buggy 1.0333×weight", Math.abs(e1rm - 103.33) > 0.01, `should not be 103.33`);
    }

    console.log("TEST 2: High reps capped at 12 (40 kg × 15 = 56.00 kg, not 60.00 kg)");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex1]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      const expectedCapped = roundToStoragePrecision(estimateOneRepMax(40, 15));
      
      check("15 reps gives capped e1RM (56.00)", Math.abs(e1rm - expectedCapped) < 0.01, `expected ${expectedCapped}, got ${e1rm}`);
      check("15 reps does NOT give uncapped value (60.00)", Math.abs(e1rm - 60) > 0.01, `should not be 60`);
    }

    console.log("TEST 3: Recompute matches TS for mixed sets (52.5×8, 37.5×11)");
    {
      const tsE1rm = roundToStoragePrecision(Math.max(
        estimateOneRepMax(52.5, 8),
        estimateOneRepMax(37.5, 11)
      ));
      
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex6]);
      const dbE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("hardcoded expected matches TS function", Math.abs(66.5 - tsE1rm) < 0.01, `hardcoded 66.5 vs TS ${tsE1rm}`);
      check("SQL e1RM matches TS function", Math.abs(dbE1rm - tsE1rm) < 0.01, `expected ${tsE1rm}, got ${dbE1rm}`);
    }

    console.log("TEST 4: In-progress session with completed exercise keeps PB");
    {
      const expectedE1rm = roundToStoragePrecision(estimateOneRepMax(80, 4));
      
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex3]);
      const dbE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("In-progress session with completed exercise keeps PB", Math.abs(dbE1rm - expectedE1rm) < 0.01, `expected ${expectedE1rm}, got ${dbE1rm}`);
    }

    console.log("TEST 5: No-sets row unchanged");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex4]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("No-sets row unchanged", Math.abs(e1rm - 42) < 0.01, `expected 42, got ${e1rm}`);
    }

    console.log("TEST 6: Timed exercises excluded from recompute");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex5]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("Timed exercise unchanged", Math.abs(e1rm - 100) < 0.01, `expected 100, got ${e1rm}`);
    }

    console.log("TEST 7: View uses capped formula (40kg × 15 reps)");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex1, "2026-10-20"]);

      const viewE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      const expectedCapped = 56.00;

      check("View returns capped value (56.00)", Math.abs(viewE1rm - expectedCapped) < 0.01, `expected ${expectedCapped}, got ${viewE1rm}`);
    }

    console.log("TEST 7A: View reps=1 gives weight itself (100×1 → 100.00)");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex2, "2026-10-21"]);

      const viewE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("View reps=1 returns weight itself", Math.abs(viewE1rm - 100) < 0.01, `expected 100, got ${viewE1rm}`);
      check("View reps=1 does NOT give buggy 1.0333×weight", Math.abs(viewE1rm - 103.33) > 0.01, `should not be 103.33`);
    }

    console.log("TEST 7B: View excludes warmup sets");
    {
      // ex8 has only warmup sets on 2026-10-26; view should return no rows or NULL
      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex8, "2026-10-26"]);

      // View should either return no rows or NULL best_e1rm (warmup sets excluded)
      const hasNonWarmup = rows.length > 0 && rows[0].best_e1rm !== null;
      
      check("View excludes warmup-only sets", !hasNonWarmup, `expected no non-warmup e1RM, got ${rows.length} rows with ${rows[0]?.best_e1rm ?? 'NULL'}`);
    }

    console.log("TEST 7C: View excludes skipped session_exercises (MED-2/Coordinator)");
    {
      // ex7 has a skipped session_exercise on 2026-10-25 with 90×10 sets
      // View MUST exclude it (se.status = 'completed' filter added)
      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex7, "2026-10-25"]);

      // View should return no rows (skipped exercise excluded)
      const hasRow = rows.length > 0 && rows[0].best_e1rm !== null;
      
      check("View excludes skipped session_exercise", !hasRow, `expected no e1RM, got ${rows.length} rows with ${rows[0]?.best_e1rm ?? 'NULL'}`);
    }

    console.log("TEST 7D: View excludes timed exercises (MED-2/Coordinator)");
    {
      // ex5 is timed (seconds metric) on 2026-10-23
      // View MUST exclude it (e.metric != 'seconds' filter added)
      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex5, "2026-10-23"]);

      // View should return no rows (timed exercise excluded)
      const timedE1rm = rows.length > 0 && rows[0].best_e1rm !== null;
      
      check("View excludes timed exercises", !timedE1rm, `expected no e1RM for timed exercise, got ${rows.length} rows`);
    }

    console.log("TEST 8: SKIPPED session_exercise sets excluded from recompute");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex7]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("Skipped exercise unchanged", Math.abs(e1rm - 75) < 0.01, `expected 75, got ${e1rm}`);
    }

    console.log("TEST 9: Warmup-only exercise excluded from recompute");
    {
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex8]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("Warmup-only exercise unchanged", Math.abs(e1rm - 88) < 0.01, `expected 88, got ${e1rm}`);
    }

    console.log("TEST 9A: View excludes non-completed sessions (MED-2)");
    {
      // ex9 has a completed exercise in a skipped session
      // View should NOT show it (s.status = 'completed' filter)
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex9, "2026-10-27"]);
      
      const hasRow = rows.length > 0 && rows[0].best_e1rm !== null;
      check("View excludes skipped session", !hasRow, `expected no row, got ${rows.length} rows`);
    }

    console.log("TEST 9B: Recompute excludes weight_kg = 0 (MED-2)");
    {
      // ex14 has sets with weight_kg = 0
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex14]);
      const e1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      
      check("Recompute excludes weight_kg=0", Math.abs(e1rm - 125) < 0.01, `expected 125 (unchanged), got ${e1rm}`);
    }

    console.log("TEST 9E: View excludes weight_kg = 0 sets (LOW-4)");
    {
      // ex14: completed bodyweight session, one working set 0 kg × 15.
      // The view's weight_kg > 0 filter must drop it, so no row for that day.
      const { rows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex14, "2026-11-01"]);
      check("View excludes weight_kg=0 sets (no row)", rows.length === 0,
        `expected 0 rows, got ${rows.length} (best_e1rm=${rows[0]?.best_e1rm})`);
    }

    console.log("TEST 9C: Heavy warm-up set excluded (working 100×5, warm-up 140×5)");
    {
      // ex15 has warm-up 140×5 (e1RM would be 163.33) and working 100×5 (e1RM = 116.67)
      // View and recompute must report only 116.67 (working set)
      const { rows: progressRows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex15]);
      const progressE1rm = parseFloat(progressRows[0]?.best_e1rm ?? '0');
      
      // 100 * 35 / 30 = 116.666... → 116.67
      check("Recompute: heavy warm-up excluded (116.67, not 163.33)", 
        Math.abs(progressE1rm - 116.67) < 0.01, `expected 116.67, got ${progressE1rm}`);
      
      const { rows: viewRows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex15, "2026-11-02"]);
      const viewE1rm = parseFloat(viewRows[0]?.best_e1rm ?? '0');
      
      check("View: heavy warm-up excluded (116.67, not 163.33)", 
        Math.abs(viewE1rm - 116.67) < 0.01, `expected 116.67, got ${viewE1rm}`);
    }

    console.log("TEST 9D: Swapped exercise - sets stay under exercise actually performed");
    {
      // ex16: session_exercise has exercise_id=exSwapped, swapped_from=exOriginal
      // Sets (120×6 = 144.00) should affect exSwapped, NOT exOriginal
      const { rows: swappedRows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, exSwapped]);
      const swappedE1rm = parseFloat(swappedRows[0]?.best_e1rm ?? '0');
      
      // 120 * 36 / 30 = 144.00
      check("Recompute: swapped exercise gets e1RM (144.00)", 
        Math.abs(swappedE1rm - 144.00) < 0.01, `expected 144.00, got ${swappedE1rm}`);
      
      const { rows: originalRows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, exOriginal]);
      const originalE1rm = parseFloat(originalRows[0]?.best_e1rm ?? '0');
      
      check("Recompute: original exercise unchanged (0.00)", 
        Math.abs(originalE1rm - 0.00) < 0.01, `expected 0.00, got ${originalE1rm}`);
      
      // View should also show only exSwapped
      const { rows: viewRows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, exSwapped, "2026-11-03"]);
      const viewE1rm = parseFloat(viewRows[0]?.best_e1rm ?? '0');
      
      check("View: swapped exercise shows e1RM (144.00)", 
        Math.abs(viewE1rm - 144.00) < 0.01, `expected 144.00, got ${viewE1rm}`);
      
      const { rows: viewOrigRows } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, exOriginal, "2026-11-03"]);
      
      check("View: original exercise has no row", viewOrigRows.length === 0, 
        `expected 0 rows, got ${viewOrigRows.length}`);
    }

    console.log("TEST 10: Exact rational arithmetic - JS matches SQL (44.25×7, 21.75×7, 494.65×9)");
    {
      // HIGH-1: Exact rational: weight * (30 + min(reps,12)) / 30, then ROUND(x,2)
      
      // Test 44.25×7: 44.25 * 37 / 30 = 54.575 → 54.58
      const { rows: rows1 } = await testPool!.query(`
        SELECT round(44.25 * (30 + least(7, 12)) / 30, 2)::numeric(6,2) as e1rm
      `);
      const sql1 = parseFloat(rows1[0].e1rm);
      const js1 = estimateOneRepMax(44.25, 7);
      check("44.25×7: SQL = 54.58", Math.abs(sql1 - 54.58) < 0.01, `got ${sql1}`);
      check("44.25×7: JS = 54.58", Math.abs(js1 - 54.58) < 0.01, `got ${js1}`);
      check("44.25×7: SQL === JS", Math.abs(sql1 - js1) < 0.01, `SQL=${sql1}, JS=${js1}`);
      
      // Test 21.75×7: 21.75 * 37 / 30 = 26.825 → 26.83
      const { rows: rows2 } = await testPool!.query(`
        SELECT round(21.75 * (30 + least(7, 12)) / 30, 2)::numeric(6,2) as e1rm
      `);
      const sql2 = parseFloat(rows2[0].e1rm);
      const js2 = estimateOneRepMax(21.75, 7);
      check("21.75×7: SQL = 26.83", Math.abs(sql2 - 26.83) < 0.01, `got ${sql2}`);
      check("21.75×7: JS = 26.83", Math.abs(js2 - 26.83) < 0.01, `got ${js2}`);
      check("21.75×7: SQL === JS", Math.abs(sql2 - js2) < 0.01, `SQL=${sql2}, JS=${js2}`);
      
      // Test 494.65×9: 494.65 * 39 / 30 = 643.045 → 643.05
      const { rows: rows3 } = await testPool!.query(`
        SELECT round(494.65 * (30 + least(9, 12)) / 30, 2)::numeric(6,2) as e1rm
      `);
      const sql3 = parseFloat(rows3[0].e1rm);
      const js3 = estimateOneRepMax(494.65, 9);
      check("494.65×9: SQL = 643.05", Math.abs(sql3 - 643.05) < 0.01, `got ${sql3}`);
      check("494.65×9: JS = 643.05", Math.abs(js3 - 643.05) < 0.01, `got ${js3}`);
      check("494.65×9: SQL === JS", Math.abs(sql3 - js3) < 0.01, `SQL=${sql3}, JS=${js3}`);
      
      // Now test these values through the actual view
      const ex10 = await createTestExercise("Exercise 10 - 44.25×7");
      await logSession(userId, ex10, "2026-10-27", [{ weight: 44.25, reps: 7 }]);
      const { rows: viewRows1 } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex10, "2026-10-27"]);
      const view1 = parseFloat(viewRows1[0]?.best_e1rm ?? '0');
      check("44.25×7: View = 54.58", Math.abs(view1 - 54.58) < 0.01, `got ${view1}`);
      
      const ex11 = await createTestExercise("Exercise 11 - 21.75×7");
      await logSession(userId, ex11, "2026-10-28", [{ weight: 21.75, reps: 7 }]);
      const { rows: viewRows2 } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex11, "2026-10-28"]);
      const view2 = parseFloat(viewRows2[0]?.best_e1rm ?? '0');
      check("21.75×7: View = 26.83", Math.abs(view2 - 26.83) < 0.01, `got ${view2}`);
      
      const ex12 = await createTestExercise("Exercise 12 - 494.65×9");
      await logSession(userId, ex12, "2026-10-29", [{ weight: 494.65, reps: 9 }]);
      const { rows: viewRows3 } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex12, "2026-10-29"]);
      const view3 = parseFloat(viewRows3[0]?.best_e1rm ?? '0');
      check("494.65×9: View = 643.05", Math.abs(view3 - 643.05) < 0.01, `got ${view3}`);
      
    }

    console.log("TEST 10A: Rounding up (.5 → next higher): 1.15×3, 17.15×3, 33.05×3, 11.25×7");
    {
      // Test cases where exact value ends in .5 and must round up
      
      // 1.15×3: 1.15 * 33 / 30 = 1.265 → 1.27
      const sql1 = parseFloat((await testPool!.query(`SELECT round(1.15 * 33 / 30, 2)::numeric(6,2) as e1rm`)).rows[0].e1rm);
      const js1 = estimateOneRepMax(1.15, 3);
      check("1.15×3: SQL = 1.27", Math.abs(sql1 - 1.27) < 0.01, `got ${sql1}`);
      check("1.15×3: JS = 1.27", Math.abs(js1 - 1.27) < 0.01, `got ${js1}`);
      
      // 17.15×3: 17.15 * 33 / 30 = 18.865 → 18.87
      const sql2 = parseFloat((await testPool!.query(`SELECT round(17.15 * 33 / 30, 2)::numeric(6,2) as e1rm`)).rows[0].e1rm);
      const js2 = estimateOneRepMax(17.15, 3);
      check("17.15×3: SQL = 18.87", Math.abs(sql2 - 18.87) < 0.01, `got ${sql2}`);
      check("17.15×3: JS = 18.87", Math.abs(js2 - 18.87) < 0.01, `got ${js2}`);
      
      // 33.05×3: 33.05 * 33 / 30 = 36.365 → 36.36
      const sql3 = parseFloat((await testPool!.query(`SELECT round(33.05 * 33 / 30, 2)::numeric(6,2) as e1rm`)).rows[0].e1rm);
      const js3 = estimateOneRepMax(33.05, 3);
      check("33.05×3: SQL = 36.36", Math.abs(sql3 - 36.36) < 0.01, `got ${sql3}`);
      check("33.05×3: JS = 36.36", Math.abs(js3 - 36.36) < 0.01, `got ${js3}`);
      
      // 11.25×7: 11.25 * 37 / 30 = 13.875 → 13.88
      const sql4 = parseFloat((await testPool!.query(`SELECT round(11.25 * 37 / 30, 2)::numeric(6,2) as e1rm`)).rows[0].e1rm);
      const js4 = estimateOneRepMax(11.25, 7);
      check("11.25×7: SQL = 13.88", Math.abs(sql4 - 13.88) < 0.01, `got ${sql4}`);
      check("11.25×7: JS = 13.88", Math.abs(js4 - 13.88) < 0.01, `got ${js4}`);
      
      // Test through view: 11.25×7
      const ex10a = await createTestExercise("Exercise 10A - 11.25×7");
      await logSession(userId, ex10a, "2026-11-02", [{ weight: 11.25, reps: 7 }]);
      const viewE1rm = parseFloat((await testPool!.query(`
        SELECT best_e1rm FROM exercise_strength_history 
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, ex10a, "2026-11-02"])).rows[0]?.best_e1rm ?? '0');
      check("11.25×7: View = 13.88", Math.abs(viewE1rm - 13.88) < 0.01, `got ${viewE1rm}`);
      
    }

    console.log("TEST 11: Migration re-run updates 0 rows and updated_at unchanged");
    {
      // Record updated_at before re-running migration
      // At this point, the migration has been run once during seed data
      const { rows: beforeRerun } = await testPool!.query(`
        SELECT user_id, exercise_id, best_e1rm, updated_at::text 
        FROM exercise_progress 
        WHERE user_id = $1
        ORDER BY exercise_id
      `, [userId]);
      
      // Re-run the REAL migration file (should update 0 rows due to IS DISTINCT FROM)
      // Migration is idempotent: view/backup already exist, UPDATE touches 0 rows
      await testPool!.query(migrationSQL);
      
      // Check updated_at unchanged
      const { rows: afterRerun } = await testPool!.query(`
        SELECT user_id, exercise_id, best_e1rm, updated_at::text 
        FROM exercise_progress 
        WHERE user_id = $1
        ORDER BY exercise_id
      `, [userId]);
      
      let allUnchanged = true;
      let changedCount = 0;
      for (let i = 0; i < beforeRerun.length; i++) {
        if (beforeRerun[i].updated_at !== afterRerun[i].updated_at) {
          allUnchanged = false;
          changedCount++;
        }
      }
      
      check("Re-run real migration updates 0 rows (idempotent)", allUnchanged, `${changedCount} of ${beforeRerun.length} updated_at changed`);
      check("Re-run: updated_at unchanged for all rows", allUnchanged, `${changedCount} of ${beforeRerun.length} updated_at changed`);
      
    }

    let ex13Id = "";
    console.log("TEST 11A: Migration preserves correct stored values (no false PB)");
    {
      // Seed an exercise with correct stored 54.58 (from 44.25×7)
      const ex13 = await createTestExercise("Exercise 13 - preserve 54.58");
      ex13Id = ex13;
      await logSession(userId, ex13, "2026-10-30", [{ weight: 44.25, reps: 7 }]);
      await testPool!.query(`
        INSERT INTO exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
        VALUES ($1, $2, 54.58, 1)
      `, [userId, ex13]);
      
      // Run migration (it's already been run, but we'll verify the value is unchanged)
      await testPool!.query(migrationSQL);
      
      const { rows: afterMigration } = await testPool!.query(`
        SELECT best_e1rm FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2
      `, [userId, ex13]);
      const afterE1rm = parseFloat(afterMigration[0]?.best_e1rm ?? '0');
      
      check("Correct 54.58 unchanged by migration", Math.abs(afterE1rm - 54.58) < 0.01, `got ${afterE1rm}`);
      
      // Test nextBest/PB detection with prior 54.58 and new 44.25×7 set (should be no PB)
      const { nextBest } = await import("../src/lib/program/progression");
      const result = nextBest(
        [{ reps: 7, weightKg: 44.25 }],
        { bestWeightKg: 44.25, bestReps: 7, bestE1rm: 54.58 },
        { metric: "reps" }
      );
      
      check("nextBest: repeating 44.25×7 with prior 54.58 → no PB", result.personalBest === null,
        result.personalBest ? `got ${result.personalBest.kind}` : undefined);
      check("nextBest: bestE1rm stays 54.58", result.bestE1rm === 54.58, `got ${result.bestE1rm}`);
      
    }

    console.log("TEST 12: Backup table exists and preserves pre-migration values");
    {
      // Check backup table exists
      const { rows: tableExists } = await testPool!.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'exercise_progress_best_e1rm_backup_20261025000030'
        ) as exists
      `);
      check("Backup table exists", tableExists[0].exists, "table not found");
      
      if (tableExists[0].exists) {
        // Assert backup holds the seeded PRE-migration values
        const { rows: backupEx1 } = await testPool!.query(`
          SELECT best_e1rm FROM exercise_progress_best_e1rm_backup_20261025000030
          WHERE user_id = $1 AND exercise_id = $2
        `, [userId, ex1]);
        const backupEx1Value = parseFloat(backupEx1[0]?.best_e1rm ?? '0');
        check("Backup: ex1 = 60.00 (uncapped pre-migration)", Math.abs(backupEx1Value - 60.00) < 0.01, `got ${backupEx1Value}`);
        
        const { rows: backupEx2 } = await testPool!.query(`
          SELECT best_e1rm FROM exercise_progress_best_e1rm_backup_20261025000030
          WHERE user_id = $1 AND exercise_id = $2
        `, [userId, ex2]);
        const backupEx2Value = parseFloat(backupEx2[0]?.best_e1rm ?? '0');
        check("Backup: ex2 = 103.33 (buggy 1.0333x pre-migration)", Math.abs(backupEx2Value - 103.33) < 0.01, `got ${backupEx2Value}`);
        
        // Backup should have entries (at least from our test data)
        const { rows: backupRows } = await testPool!.query(`
          SELECT COUNT(*) as count FROM exercise_progress_best_e1rm_backup_20261025000030
        `);
        const backupCount = parseInt(backupRows[0].count);
        check("Backup table has rows", backupCount > 0, `count=${backupCount}`);
        
        // Re-run migration and verify backup is unchanged
        const { rows: beforeRerun } = await testPool!.query(`
          SELECT user_id, exercise_id, best_e1rm 
          FROM exercise_progress_best_e1rm_backup_20261025000030
          ORDER BY user_id, exercise_id
        `);
        
        await testPool!.query(migrationSQL);
        
        const { rows: afterRerun } = await testPool!.query(`
          SELECT user_id, exercise_id, best_e1rm 
          FROM exercise_progress_best_e1rm_backup_20261025000030
          ORDER BY user_id, exercise_id
        `);
        
        check("Backup unchanged by re-running migration", beforeRerun.length === afterRerun.length && 
          beforeRerun.every((row, i) => 
            row.user_id === afterRerun[i].user_id && 
            row.exercise_id === afterRerun[i].exercise_id &&
            Math.abs(parseFloat(row.best_e1rm) - parseFloat(afterRerun[i].best_e1rm)) < 0.01
          ), `backup rows changed`);
      }
      
    }

    console.log("TEST 13: Migration is idempotent (running twice changes nothing)");
    {
      // Record all e1RM values before re-running
      const { rows: beforeRows } = await testPool!.query(`
        SELECT exercise_id, best_e1rm FROM exercise_progress WHERE user_id = $1 ORDER BY exercise_id
      `, [userId]);
      
      // Re-run the migration
      await testPool!.query(migrationSQL);
      
      // Check all values are unchanged
      const { rows: afterRows } = await testPool!.query(`
        SELECT exercise_id, best_e1rm FROM exercise_progress WHERE user_id = $1 ORDER BY exercise_id
      `, [userId]);
      
      let allUnchanged = true;
      for (let i = 0; i < beforeRows.length; i++) {
        if (Math.abs(parseFloat(beforeRows[i].best_e1rm) - parseFloat(afterRows[i].best_e1rm)) > 0.01) {
          allUnchanged = false;
          break;
        }
      }
      
      check("Migration is idempotent", allUnchanged, `all ${beforeRows.length} rows unchanged after re-run`);
    }

    console.log("TEST 10B: JS-vs-SQL sweep through real view & recompute (0.25..500 × 1..15)");
    {
      // Seed a grid of 2000 weights × 15 reps = 30,000 cases through real rows
      // Re-run the migration to test both the view AND the recompute UPDATE
      const { computeE1rm } = await import("../src/lib/program/progression");
      
      await testPool!.query(`
        create temp table sweep_users as select i as wi, gen_random_uuid() as user_id, gen_random_uuid() as session_id from generate_series(1,2000) i;
        insert into auth.users (id, email) select user_id, 'sweep-'||wi||'@t.test' from sweep_users;
        create temp table sweep_ex as select r, (select id from exercises where metric='reps' order by id offset r-1 limit 1) as exercise_id from generate_series(1,15) r;
        insert into sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
          select session_id, user_id, date '2030-01-01', 1, false, 'weights', 'weights', 'completed', now(), now() from sweep_users;
        create temp table sweep_se as select u.wi, x.r, u.user_id, u.session_id, x.exercise_id, gen_random_uuid() as se_id from sweep_users u cross join sweep_ex x;
        insert into session_exercises (id, session_id, user_id, exercise_id, order_index, status, completed_at)
          select se_id, session_id, user_id, exercise_id, r, 'completed', now() from sweep_se;
        insert into session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
          select gen_random_uuid(), se_id, user_id, 1, r, (wi * 0.25)::numeric(6,2), false from sweep_se;
        insert into exercise_progress (user_id, exercise_id, best_e1rm, total_sessions)
          select user_id, exercise_id, 0, 1 from sweep_se;
      `);
      
      // Re-run the REAL migration file to recompute and populate the view
      await testPool!.query(migrationSQL);
      
      const { rows } = await testPool!.query(`
        select s.wi, s.r, v.best_e1rm::text as view_e1rm, ep.best_e1rm::text as ep_e1rm
        from sweep_se s
        left join exercise_strength_history v on v.user_id = s.user_id and v.exercise_id = s.exercise_id and v.local_date = date '2030-01-01'
        left join exercise_progress ep on ep.user_id = s.user_id and ep.exercise_id = s.exercise_id
      `);
      
      let vd = 0, pd = 0, first = "";
      for (const row of rows) {
        const js = computeE1rm(row.wi * 0.25, row.r);
        if (row.view_e1rm === null || parseFloat(row.view_e1rm) !== js) { 
          vd++; 
          first ||= `view ${row.wi*0.25}×${row.r} sql=${row.view_e1rm} js=${js}`; 
        }
        if (row.ep_e1rm === null || parseFloat(row.ep_e1rm) !== js) { 
          pd++; 
          first ||= `recompute ${row.wi*0.25}×${row.r} sql=${row.ep_e1rm} js=${js}`; 
        }
      }
      
      check(`Sweep: view === computeE1rm across ${rows.length} cases`, rows.length === 30000 && vd === 0, first);
      check(`Sweep: recompute === computeE1rm across ${rows.length} cases`, rows.length === 30000 && pd === 0, first);
    }

    console.log("TEST 14: Backup table has RLS enabled");
    {
      const { rows: tableExists } = await testPool!.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'exercise_progress_best_e1rm_backup_20261025000030'
        ) as exists
      `);
      
      if (tableExists[0].exists) {
        const { rows } = await testPool!.query(`
          SELECT relrowsecurity FROM pg_class WHERE relname = 'exercise_progress_best_e1rm_backup_20261025000030'
        `);
        check("Backup table has RLS enabled", rows[0]?.relrowsecurity === true, `relrowsecurity=${rows[0]?.relrowsecurity}`);
        const { rows: privs } = await testPool!.query(`
          SELECT r.role, p.priv,
                 has_table_privilege(r.role, 'public.exercise_progress_best_e1rm_backup_20261025000030', p.priv) AS has
          FROM (VALUES ('anon'), ('authenticated')) r(role)
          CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
        `);
        const granted = privs.filter(r => r.has).map(r => `${r.role}:${r.priv}`);
        check("Backup table: no anon/authenticated privileges", granted.length === 0, `granted=${granted.join(",")}`);
        // MED-1: same FK target as exercise_progress.user_id, with ON DELETE CASCADE
        const { rows: epFk } = await testPool!.query(`
          SELECT c.confrelid::regclass::text AS target
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
          WHERE c.conrelid = 'public.exercise_progress'::regclass AND c.contype = 'f' AND a.attname = 'user_id'
        `);
        const { rows: fks } = await testPool!.query(`
          SELECT c.confrelid::regclass::text AS target, c.confdeltype,
                 (SELECT array_agg(a.attname::text) FROM pg_attribute a
                   WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols,
                 (SELECT array_agg(a.attname::text) FROM pg_attribute a
                   WHERE a.attrelid = c.confrelid AND a.attnum = ANY (c.confkey)) AS refcols
          FROM pg_constraint c
          WHERE c.conrelid = 'public.exercise_progress_best_e1rm_backup_20261025000030'::regclass
            AND c.contype = 'f'
        `);
        const fk = fks.find(r => JSON.stringify(r.cols) === JSON.stringify(["user_id"]));
        check("Backup FK on user_id exists", !!fk, `fks=${JSON.stringify(fks)}`);
        check("Backup FK targets the same table as exercise_progress.user_id",
          !!fk && epFk.length === 1 && fk.target === epFk[0].target && JSON.stringify(fk.refcols) === JSON.stringify(["id"]),
          `backup=${fk?.target}(${fk?.refcols}) exercise_progress=${epFk[0]?.target}`);
        check("Backup FK is ON DELETE CASCADE (confdeltype 'c')", fk?.confdeltype === "c", `confdeltype=${fk?.confdeltype}`);
        const { rows: dupFk } = await testPool!.query(`
          SELECT count(*)::int AS n FROM pg_constraint
          WHERE conrelid = 'public.exercise_progress_best_e1rm_backup_20261025000030'::regclass AND contype = 'f'
        `);
        check("Backup FK not duplicated by re-runs", dupFk[0].n === 1, `n=${dupFk[0].n}`);
      } else {
        check("Backup table has RLS enabled", false, "table does not exist");
      }
    }

    const backupExists = async () => (await testPool!.query(
      `SELECT to_regclass('public.exercise_progress_best_e1rm_backup_20261025000030') IS NOT NULL AS e`)).rows[0].e === true;

    console.log("TEST 15: Account deletion removes the user's backup rows (MED-1)");
    if (!(await backupExists())) {
      check("Account deletion: backup table exists", false, "table does not exist");
    } else {
      const countFor = async (uid: string) => parseInt((await testPool!.query(
        `SELECT count(*) AS n FROM exercise_progress_best_e1rm_backup_20261025000030 WHERE user_id = $1`, [uid]
      )).rows[0].n);
      const beforeDel = await countFor(delUser);
      const beforeOther = await countFor(userId);
      check("Deletion user has backup rows before deletion", beforeDel > 0, `count=${beforeDel}`);
      // Real path: the app's delete_own_account() as that user
      const client = await testPool!.connect();
      let delError = "";
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [delUser]);
        await client.query("SELECT public.delete_own_account()");
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        delError = e instanceof Error ? e.message : String(e);
      } finally {
        client.release();
      }
      // A backup FK without CASCADE would block the deletion outright
      check("delete_own_account succeeds", delError === "", delError);
      const authLeft = parseInt((await testPool!.query(`SELECT count(*) AS n FROM auth.users WHERE id = $1`, [delUser])).rows[0].n);
      check("delete_own_account removed the auth user", authLeft === 0, `auth rows=${authLeft}`);
      const afterDel = await countFor(delUser);
      check("Zero backup rows remain for the deleted user", afterDel === 0, `count=${afterDel}`);
      check("Other users' backup rows untouched", (await countFor(userId)) === beforeOther, `before=${beforeOther}`);
    }

    console.log("TEST 16: Guarded restore SQL (from the migration comment) keeps bests earned after the migration (LOW-3)");
    if (!(await backupExists())) {
      check("Guarded restore: backup table exists", false, "table does not exist");
    } else {
      const lines = migrationSQL.split("\n");
      const start = lines.findIndex(l => /^-- UPDATE exercise_progress ep/.test(l));
      const end = lines.findIndex((l, i) => i >= start && /;\s*$/.test(l));
      const restoreSQL = start >= 0 && end >= start ? lines.slice(start, end + 1).map(l => l.replace(/^-- ?/, "")).join("\n") : "";
      check("Restore SQL found in migration comment", restoreSQL.length > 0);
      const val = async (ex: string) => (await testPool!.query(
        `SELECT best_e1rm::text AS v FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2`, [userId, ex])).rows[0]?.v;
      const client = await testPool!.connect();
      try {
        await client.query("BEGIN");
        // ex2: migrated 103.33 -> 100.00, then the member earns 120.00 after the migration
        await client.query(`UPDATE exercise_progress SET best_e1rm = 120.00 WHERE user_id = $1 AND exercise_id = $2`, [userId, ex2]);
        await client.query(restoreSQL);
        const r = async (ex: string) => (await client.query(
          `SELECT best_e1rm::text AS v FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2`, [userId, ex])).rows[0]?.v;
        check("Restore: untouched migrated row goes back to backup (ex1 56.00 -> 60.00)", (await r(ex1)) === "60.00", `got ${await r(ex1)}`);
        check("Restore: post-migration best kept (ex2 stays 120.00, not 103.33)", (await r(ex2)) === "120.00", `got ${await r(ex2)}`);
        check("Restore: row created after migration untouched (ex13 54.58)", (await r(ex13Id)) === "54.58", `got ${await r(ex13Id)}`);
        check("Restore: unchanged row stays (ex4 42.00)", (await r(ex4)) === "42.00", `got ${await r(ex4)}`);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      check("Restore test rolled back (ex1 back to 56.00)", (await val(ex1)) === "56.00", `got ${await val(ex1)}`);
    }

    console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECKS FAILED`}\n`);

  } catch (err) {
    console.log(`\nTest error: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    failures++;
    console.log(`\n❌ ${failures} CHECKS FAILED\n`);
  } finally {
    if (testPool && dbName) {
      try {
        await testPool.end();
        // Drop the temporary database
        await pool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      } catch (err) {
        console.error(`Warning: failed to drop temp database ${dbName}:`, err instanceof Error ? err.message : String(err));
      }
    } else if (testPool) {
      await testPool.end();
    }
    if (pool) {
      await pool.end();
    }
  }

  return failures === 0;
}

runTests().then(
  success => process.exit(success ? 0 : 1),
  err => {
    console.error("Fatal error:", err);
    process.exit(1);
  }
);
