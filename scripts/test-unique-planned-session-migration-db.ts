/**
 * Database test for migration 20261025000033_unique_planned_session_per_user_day.sql
 *
 * Tests that:
 * - Duplicate planned sessions are deduped, keeping lowest id
 * - Non-planned sessions (completed, in_progress) survive
 * - Sessions for different users/dates survive
 * - Unique constraint prevents duplicate planned sessions
 * - Migration is idempotent (can be re-run safely)
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test npm run test:unique-planned-session-migration-db
 */

import { randomUUID } from "crypto";
import type { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓   " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  if (!DATABASE_URL) {
    console.log("\n⏭️  Skipping DB tests (DATABASE_URL not set)");
    console.log("   Set DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test to run\n");
    return true;
  }

  const { Pool } = await import("pg");
  const { readFileSync } = await import("fs");
  
  const pool = new Pool({ connectionString: DATABASE_URL });

  async function setupDatabase(pool: Pool) {
    // Create minimal schema
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS public;
      
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text UNIQUE NOT NULL
      );
      
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    `);

    // Create sessions table with minimal schema
    await pool.query(`
      DROP TABLE IF EXISTS public.sessions CASCADE;
      
      CREATE TABLE public.sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        local_date date NOT NULL,
        status text NOT NULL,
        actual_type text,
        program_day_id uuid,
        created_at timestamptz DEFAULT now()
      );
      
      CREATE INDEX sessions_user_date_idx ON public.sessions (user_id, local_date DESC);
    `);
  }

  async function cleanupDatabase(pool: Pool) {
    await pool.query(`
      DROP TABLE IF EXISTS public.sessions CASCADE;
      DROP TABLE IF EXISTS auth.users CASCADE;
      DROP SCHEMA IF EXISTS auth CASCADE;
    `);
  }

  try {
    console.log("\n📦 Setting up test database...");
    await setupDatabase(pool);

    const user1 = randomUUID();
    const user2 = randomUUID();
    const date1 = "2026-11-02";
    const date2 = "2026-11-03";

    // Insert test users
    await pool.query("INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)", [
      user1,
      "user1@test.com",
      user2,
      "user2@test.com",
    ]);

    console.log("\n🧪 Testing migration 20261025000033...\n");

    // Test 1: Seed duplicate planned sessions
    console.log("1. Seed duplicate planned sessions");
    await pool.query(`
      INSERT INTO public.sessions (id, user_id, local_date, status, program_day_id)
      VALUES
        -- Duplicates for user1, date1 (keep lowest: sess-aaa)
        ('00000000-0000-0000-0000-000000000003', $1, $2, 'planned', 'day-1'),
        ('00000000-0000-0000-0000-000000000001', $1, $2, 'planned', 'day-1'),
        ('00000000-0000-0000-0000-000000000002', $1, $2, 'planned', 'day-1'),
        -- Different date (should survive)
        ('00000000-0000-0000-0000-000000000004', $1, $3, 'planned', 'day-1'),
        -- Different user (should survive)
        ('00000000-0000-0000-0000-000000000005', $4, $2, 'planned', 'day-1'),
        -- Different status (should survive)
        ('00000000-0000-0000-0000-000000000006', $1, $2, 'completed', 'day-1'),
        ('00000000-0000-0000-0000-000000000007', $1, $2, 'in_progress', 'day-1')
    `, [user1, date1, date2, user2]);

    const beforeCount = await pool.query("SELECT COUNT(*) FROM public.sessions");
    check("Seeded 7 sessions", parseInt(beforeCount.rows[0].count) === 7);

    // Test 2: Apply migration
    console.log("\n2. Apply migration");
    const migration = readFileSync(
      "supabase/migrations/20261025000033_unique_planned_session_per_user_day.sql",
      "utf-8"
    );
    await pool.query(migration);
    check("Migration applied", true);

    // Test 3: Verify deduplication
    console.log("\n3. Verify deduplication");
    const afterCount = await pool.query("SELECT COUNT(*) FROM public.sessions");
    check("Deleted 2 duplicate sessions", parseInt(afterCount.rows[0].count) === 5, `count=${afterCount.rows[0].count}`);

    const kept = await pool.query(
      "SELECT id FROM public.sessions WHERE user_id = $1 AND local_date = $2 AND status = 'planned'",
      [user1, date1]
    );
    check(
      "Kept lowest id (sess-001)",
      kept.rows[0]?.id === "00000000-0000-0000-0000-000000000001",
      `id=${kept.rows[0]?.id}`
    );

    // Test 4: Verify non-matching rows survived
    console.log("\n4. Verify non-matching rows survived");
    const otherDate = await pool.query(
      "SELECT id FROM public.sessions WHERE user_id = $1 AND local_date = $2",
      [user1, date2]
    );
    check("Different date session survived", otherDate.rows.length === 1);

    const otherUser = await pool.query(
      "SELECT id FROM public.sessions WHERE user_id = $1 AND local_date = $2",
      [user2, date1]
    );
    check("Different user session survived", otherUser.rows.length === 1);

    const completed = await pool.query(
      "SELECT id FROM public.sessions WHERE user_id = $1 AND local_date = $2 AND status = 'completed'",
      [user1, date1]
    );
    check("Completed session survived", completed.rows.length === 1);

    const inProgress = await pool.query(
      "SELECT id FROM public.sessions WHERE user_id = $1 AND local_date = $2 AND status = 'in_progress'",
      [user1, date1]
    );
    check("In-progress session survived", inProgress.rows.length === 1);

    // Test 5: Verify unique constraint
    console.log("\n5. Verify unique constraint");
    try {
      await pool.query(
        "INSERT INTO public.sessions (user_id, local_date, status) VALUES ($1, $2, 'planned')",
        [user1, date1]
      );
      check("Duplicate planned insert fails with 23505", false, "Should have thrown error");
    } catch (err) {
      const error = err as { code?: string };
      check("Duplicate planned insert fails with 23505", error.code === "23505", `code=${error.code}`);
    }

    // Test 6: Verify different date succeeds
    console.log("\n6. Verify different date succeeds");
    await pool.query(
      "INSERT INTO public.sessions (user_id, local_date, status) VALUES ($1, '2026-11-04', 'planned')",
      [user1]
    );
    check("Planned session for different date succeeds", true);

    // Test 7: Idempotency - re-run migration
    console.log("\n7. Re-run migration (idempotency)");
    await pool.query(migration);
    const finalCount = await pool.query("SELECT COUNT(*) FROM public.sessions");
    check("Count unchanged after re-run", parseInt(finalCount.rows[0].count) === 6, `count=${finalCount.rows[0].count}`);

    console.log("\n🧹 Cleaning up test database...");
    await cleanupDatabase(pool);

    await pool.end();

    if (failures > 0) {
      console.log(`\n❌ ${failures} test(s) failed\n`);
      return false;
    }

    console.log("\n✅ All migration tests passed\n");
    return true;
  } catch (err) {
    console.error("\n❌ Test error:", err);
    try {
      await cleanupDatabase(pool);
      await pool.end();
    } catch {}
    return false;
  }
}

runTests()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
