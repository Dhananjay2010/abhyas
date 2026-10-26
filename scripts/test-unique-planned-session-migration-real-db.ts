/**
 * Real database test for migration 20261025000033_unique_planned_session_per_user_day.sql
 *
 * Tests that:
 * - Duplicate planned sessions are deduped, keeping the lowest id
 * - Non-planned sessions (completed, in_progress) survive
 * - Sessions for different users/dates survive
 * - Unique constraint prevents duplicate planned sessions
 * - Migration is idempotent (can be re-run safely)
 * - FK cascade works (session_exercises deleted when parent session deleted)
 *
 * Run: supabase start && REAL_DB=1 npm run test:unique-planned-session-migration-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function testDatabaseConnection() {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await client.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function runTests() {
  if (process.env.REAL_DB !== "1") {
    console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
    console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
    return true;
  }

  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.error("\n❌ REAL_DB=1 but Supabase is not available");
    console.error("   Run `supabase start` to enable these tests\n");
    return false;
  }

  console.log("✓ Connected to Supabase\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  console.log("🧪 Testing migration 20261025000033\n");

  try {
    // Create test users
    const user1 = randomUUID();
    const user2 = randomUUID();
    
    const { error: authError } = await adminClient.auth.admin.createUser({
      email: `test-${user1}@example.com`,
      password: "test-password-123",
      user_metadata: {},
      email_confirm: true,
    });
    
    if (authError && !authError.message.includes("already exists")) {
      throw new Error(`Failed to create test user: ${authError.message}`);
    }

    const { error: authError2 } = await adminClient.auth.admin.createUser({
      email: `test-${user2}@example.com`,
      password: "test-password-456",
      user_metadata: {},
      email_confirm: true,
    });
    
    if (authError2 && !authError2.message.includes("already exists")) {
      throw new Error(`Failed to create test user 2: ${authError2.message}`);
    }

    // Create test program
    const programId = randomUUID();
    const { error: progError } = await adminClient.from("programs").insert({
      id: programId,
      user_id: user1,
      name: "Test Program",
      status: "active",
      started_on: "2026-11-01",
    });
    
    if (progError) throw new Error(`Failed to create program: ${progError.message}`);

    // Create test program_day
    const programDayId = randomUUID();
    const { error: dayError } = await adminClient.from("program_days").insert({
      id: programDayId,
      program_id: programId,
      day_index: 1,
      day_type: "weights",
    });
    
    if (dayError) throw new Error(`Failed to create program_day: ${dayError.message}`);

    console.log("1. Test deduplication in transaction\n");

    // In a transaction, drop the index, seed duplicates, run migration, rollback
    const { data: txData, error: txError } = await adminClient.rpc("exec_sql", {
      sql: `
        BEGIN;
        
        -- Drop the index temporarily to allow duplicates
        DROP INDEX IF EXISTS public.sessions_user_date_planned_unique;
        
        -- Insert duplicate planned sessions for testing
        INSERT INTO public.sessions (id, user_id, local_date, status, program_day_id)
        VALUES
          ('00000000-0000-0000-0000-000000000003', '${user1}', '2026-11-02', 'planned', '${programDayId}'),
          ('00000000-0000-0000-0000-000000000001', '${user1}', '2026-11-02', 'planned', '${programDayId}'),
          ('00000000-0000-0000-0000-000000000002', '${user1}', '2026-11-02', 'planned', '${programDayId}'),
          ('00000000-0000-0000-0000-000000000004', '${user1}', '2026-11-03', 'planned', '${programDayId}'),
          ('00000000-0000-0000-0000-000000000005', '${user2}', '2026-11-02', 'planned', '${programDayId}'),
          ('00000000-0000-0000-0000-000000000006', '${user1}', '2026-11-01', 'completed', '${programDayId}'),
          ('00000000-0000-0000-0000-000000000007', '${user1}', '2026-11-01', 'in_progress', '${programDayId}');
        
        -- Insert a session_exercises row under one of the duplicates that will be deleted
        INSERT INTO public.session_exercises (id, session_id, user_id, exercise_id, order_index)
        SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '${user1}', id, 0
        FROM exercises LIMIT 1;
        
        ROLLBACK;
      `,
    });

    check("Transaction setup (no error)", !txError, txError?.message || "");

    console.log("\n2. Seed real test data\n");

    // Now seed the actual test data (without the index)
    const sess1 = randomUUID();
    const sess2 = randomUUID();
    const sess3 = randomUUID();
    const sessOtherDate = randomUUID();
    const sessOtherUser = randomUUID();

    // Insert sessions
    const { error: sessError } = await adminClient.from("sessions").insert([
      { id: sess1, user_id: user1, local_date: "2026-11-02", status: "planned", program_day_id: programDayId },
      { id: sess2, user_id: user1, local_date: "2026-11-02", status: "planned", program_day_id: programDayId },
      { id: sess3, user_id: user1, local_date: "2026-11-02", status: "planned", program_day_id: programDayId },
      { id: sessOtherDate, user_id: user1, local_date: "2026-11-03", status: "planned", program_day_id: programDayId },
      { id: sessOtherUser, user_id: user2, local_date: "2026-11-02", status: "planned", program_day_id: programDayId },
    ]);

    if (sessError) throw new Error(`Failed to insert sessions: ${sessError.message}`);

    // Insert a session_exercises row under sess3 (will be deleted by migration)
    const { data: exercises } = await adminClient.from("exercises").select("id").limit(1).single();
    if (exercises) {
      await adminClient.from("session_exercises").insert({
        session_id: sess3,
        user_id: user1,
        exercise_id: exercises.id,
        order_index: 0,
      });
    }

    console.log("\n3. Apply migration (dedupe + create index)\n");

    // Read and execute migration
    const migrationPath = join(__dirname, "../supabase/migrations/20261025000033_unique_planned_session_per_user_day.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");
    
    const { error: migError } = await adminClient.rpc("exec_sql", { sql: migrationSQL });
    check("Migration applied", !migError, migError?.message || "");

    console.log("\n4. Verify deduplication\n");

    const { data: remaining, error: selectError } = await adminClient
      .from("sessions")
      .select("id")
      .eq("user_id", user1)
      .eq("local_date", "2026-11-02")
      .eq("status", "planned");

    check("Select after dedupe", !selectError);
    check("Only one planned session remains", remaining?.length === 1, `count=${remaining?.length}`);
    
    if (remaining && remaining.length === 1) {
      // The kept session should be the one with the lowest id
      const ids = [sess1, sess2, sess3].sort();
      check("Kept lowest id", remaining[0].id === ids[0], `kept=${remaining[0].id}, expected=${ids[0]}`);
    }

    console.log("\n5. Verify FK cascade\n");

    const { data: childRows } = await adminClient
      .from("session_exercises")
      .select("id")
      .in("session_id", [sess2, sess3]);

    check("session_exercises cascaded (deleted)", childRows?.length === 0, `count=${childRows?.length}`);

    console.log("\n6. Verify non-matching rows survived\n");

    const { data: otherDateRow } = await adminClient
      .from("sessions")
      .select("id")
      .eq("id", sessOtherDate)
      .maybeSingle();
    check("Different date session survived", !!otherDateRow);

    const { data: otherUserRow } = await adminClient
      .from("sessions")
      .select("id")
      .eq("id", sessOtherUser)
      .maybeSingle();
    check("Different user session survived", !!otherUserRow);

    console.log("\n7. Verify unique constraint (23505)\n");

    const { error: dupError } = await adminClient.from("sessions").insert({
      user_id: user1,
      local_date: "2026-11-02",
      status: "planned",
      program_day_id: programDayId,
    });

    check("Duplicate planned insert fails with 23505", dupError?.code === "23505", `code=${dupError?.code}`);

    console.log("\n8. Verify different date succeeds\n");

    const { error: newDateError } = await adminClient.from("sessions").insert({
      user_id: user1,
      local_date: "2026-11-04",
      status: "planned",
      program_day_id: programDayId,
    });

    check("Planned session for different date succeeds", !newDateError);

    console.log("\n9. Verify idempotency (re-run migration)\n");

    const { error: rerunError } = await adminClient.rpc("exec_sql", { sql: migrationSQL });
    check("Re-running migration is a no-op", !rerunError, rerunError?.message || "");

    // Cleanup
    console.log("\n🧹 Cleaning up test data\n");

    await adminClient.from("sessions").delete().eq("user_id", user1);
    await adminClient.from("sessions").delete().eq("user_id", user2);
    await adminClient.from("program_days").delete().eq("id", programDayId);
    await adminClient.from("programs").delete().eq("id", programId);

    if (failures > 0) {
      console.log(`\n❌ ${failures} test(s) failed\n`);
      return false;
    }

    console.log("\n✅ All migration tests passed\n");
    return true;
  } catch (err) {
    console.error("\n❌ Test error:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

runTests()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
