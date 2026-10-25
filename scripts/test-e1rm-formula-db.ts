/**
 * Database tests for e1RM formula fix in exercise_strength_history view.
 *
 * Tests that the SQL view's best_e1rm calculation matches the canonical
 * TypeScript implementation from src/lib/program/progression.ts:
 * - reps=1 gives weight itself (not 1.0333×weight)
 * - High reps are NOT capped at 12 (40 kg × 15 reps = 60 kg, not 56 kg)
 * - The formula matches roundToStoragePrecision(estimateOneRepMax(w, r))
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
    // Use a timestamped database name to avoid collisions
    const dbSuffix = `e1rm_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const dbName = `abhyas_test_${dbSuffix}`;
    
    // Create a new database for this test
    try {
      await pool.query(`CREATE DATABASE ${dbName}`);
    } catch (err: any) {
      if (err.code !== '42P04') { // database already exists
        throw err;
      }
    }
    
    // Connect to the new database
    const testPool = new Pool({ 
      connectionString: DATABASE_URL.replace(/\/[^\/]*$/, `/${dbName}`)
    });
    
    // Create auth schema stubs
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
    `);

    // Apply all migrations in order
    const migrationsDir = join(__dirname, "../supabase/migrations");
    const files = readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
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
    
    // Helper to create a test user
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

    // Helper to create a test exercise
    async function createTestExercise(name: string) {
      const exerciseId = randomUUID();
      await testPool!.query(`
        INSERT INTO exercises (id, slug, name, tracks, category, primary_muscles, is_active)
        VALUES ($1, $2, $3, ARRAY['weights']::track_type[], 'strength', ARRAY['chest']::muscle[], true)
      `, [exerciseId, name.toLowerCase().replace(/\s+/g, '-'), name]);
      return exerciseId;
    }

    // Helper to log a session with sets
    async function logSession(
      userId: string,
      exerciseId: string,
      localDate: string,
      sets: Array<{ weight: number; reps: number }>
    ) {
      const sessionId = randomUUID();
      const sessionExerciseId = randomUUID();

      await testPool!.query(`
        INSERT INTO sessions (id, user_id, local_date, week_in_block, is_deload, planned_type, actual_type, status, started_at, completed_at)
        VALUES ($1, $2, $3, 1, false, 'weights', 'weights', 'completed', now(), now())
      `, [sessionId, userId, localDate]);

      await testPool!.query(`
        INSERT INTO session_exercises (id, session_id, user_id, exercise_id, order_index)
        VALUES ($1, $2, $3, $4, 0)
      `, [sessionExerciseId, sessionId, userId, exerciseId]);

      for (let i = 0; i < sets.length; i++) {
        const setId = randomUUID();
        await testPool!.query(`
          INSERT INTO session_sets (id, session_exercise_id, user_id, set_number, reps, weight_kg, is_warmup_set)
          VALUES ($1, $2, $3, $4, $5, $6, false)
        `, [setId, sessionExerciseId, userId, i + 1, sets[i].reps, sets[i].weight]);
      }
    }

    console.log("TEST 1: reps=1 gives weight itself (100 kg × 1 = 100.00 kg, not 103.33 kg)");
    {
      const userId = await createTestUser();
      const exerciseId = await createTestExercise("Test Exercise 1");

      await logSession(userId, exerciseId, "2026-10-25", [
        { weight: 100, reps: 1 },
      ]);

      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, exerciseId, "2026-10-25"]);

      const dbE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      const expectedE1rm = 100.00;
      const oldBuggyE1rm = 103.33;

      check("reps=1 returns weight itself", Math.abs(dbE1rm - expectedE1rm) < 0.01, `expected ${expectedE1rm}, got ${dbE1rm}`);
      check("reps=1 does NOT give buggy 1.0333×weight", Math.abs(dbE1rm - oldBuggyE1rm) > 0.01, `should not be ${oldBuggyE1rm}`);

      console.log("  PASS: Test 1\n");
    }

    console.log("TEST 2: High reps NOT capped (40 kg × 15 = 60.00 kg, not 56.00 kg)");
    {
      const userId = await createTestUser();
      const exerciseId = await createTestExercise("Test Exercise 2");

      await logSession(userId, exerciseId, "2026-10-25", [
        { weight: 40, reps: 15 },
      ]);

      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, exerciseId, "2026-10-25"]);

      const dbE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');
      const expectedE1rm = 60.00;  // 40 × (1 + 15/30) = 40 × 1.5 = 60
      const oldCappedE1rm = 56.00; // 40 × (1 + 12/30) = 40 × 1.4 = 56

      check("15 reps gives uncapped e1RM", Math.abs(dbE1rm - expectedE1rm) < 0.01, `expected ${expectedE1rm}, got ${dbE1rm}`);
      check("15 reps does NOT give old capped value", Math.abs(dbE1rm - oldCappedE1rm) > 0.01, `should not be ${oldCappedE1rm}`);

      console.log("  PASS: Test 2\n");
    }

    console.log("TEST 3: SQL matches TS for mixed sets (52.5×8, 37.5×11)");
    {
      const userId = await createTestUser();
      const exerciseId = await createTestExercise("Test Exercise 3");

      const testSets = [
        { weight: 52.5, reps: 8 },
        { weight: 37.5, reps: 11 },
      ];

      await logSession(userId, exerciseId, "2026-10-25", testSets);

      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, exerciseId, "2026-10-25"]);

      const dbE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');

      // Compute expected e1RM using TypeScript function
      const e1rms = testSets.map(s => roundToStoragePrecision(estimateOneRepMax(s.weight, s.reps)));
      const expectedE1rm = Math.max(...e1rms);

      // Hardcoded expected values for the test (derived from TS function)
      // 52.5 × (1 + 8/30) = 52.5 × 1.2666... = 66.5
      // 37.5 × (1 + 11/30) = 37.5 × 1.3666... = 51.25
      const hardcodedExpected = 66.50;

      // Verify hardcoded values match TS function (so they can't drift)
      check("hardcoded expected matches TS function", Math.abs(hardcodedExpected - expectedE1rm) < 0.01, 
        `hardcoded ${hardcodedExpected} vs TS ${expectedE1rm}`);

      check("SQL e1RM matches TS function", Math.abs(dbE1rm - expectedE1rm) < 0.01, 
        `expected ${expectedE1rm}, got ${dbE1rm}`);

      console.log("  PASS: Test 3\n");
    }

    console.log("TEST 4: Additional parity checks (100×3, 80×10, 60×20)");
    {
      const userId = await createTestUser();
      const exerciseId = await createTestExercise("Test Exercise 4");

      const testSets = [
        { weight: 100, reps: 3 },
        { weight: 80, reps: 10 },
        { weight: 60, reps: 20 },
      ];

      await logSession(userId, exerciseId, "2026-10-25", testSets);

      const { rows } = await testPool!.query(`
        SELECT best_e1rm
        FROM exercise_strength_history
        WHERE user_id = $1 AND exercise_id = $2 AND local_date = $3
      `, [userId, exerciseId, "2026-10-25"]);

      const dbE1rm = parseFloat(rows[0]?.best_e1rm ?? '0');

      // Compute expected e1RM using TypeScript function
      const e1rms = testSets.map(s => roundToStoragePrecision(estimateOneRepMax(s.weight, s.reps)));
      const expectedE1rm = Math.max(...e1rms);

      // Hardcoded expected values (derived from TS function):
      // 100 × (1 + 3/30) = 100 × 1.1 = 110.00
      // 80 × (1 + 10/30) = 80 × 1.3333... = 106.67 (rounded to 2dp)
      // 60 × (1 + 20/30) = 60 × 1.6666... = 100.00
      const hardcodedExpected = 110.00;

      // Verify hardcoded values match TS function (so they can't drift)
      check("hardcoded expected matches TS function", Math.abs(hardcodedExpected - expectedE1rm) < 0.01, 
        `hardcoded ${hardcodedExpected} vs TS ${expectedE1rm}`);

      check("SQL e1RM matches TS function", Math.abs(dbE1rm - expectedE1rm) < 0.01, 
        `expected ${expectedE1rm}, got ${dbE1rm}`);

      console.log("  PASS: Test 4\n");
    }

    // Cleanup: close test pool and drop test database
    await testPool.end();
    await pool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await pool.end();

    return failures === 0;
  } catch (error) {
    console.error("\nTest error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    
    // Try to cleanup on error
    if (testPool) {
      try {
        await testPool.end();
      } catch {}
    }
    if (dbName) {
      try {
        await pool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      } catch {}
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
