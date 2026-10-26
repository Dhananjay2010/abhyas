/**
 * Real database test: unique index on (user_id, local_date) WHERE status='planned'
 *
 * Verifies:
 * 1. Can insert multiple sessions with different statuses on same date
 * 2. Cannot insert duplicate planned sessions for same user+date
 * 3. Deleting a session cascades to session_exercises
 *
 * Run: REAL_DB=1 npm run test:unique-planned-session-migration-real-db
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { Database } from "../src/lib/database.types";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

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

  console.log("\nUnique planned session index test\n");

  const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  try {
    // Create test users
    const user1Email = `test-migration-${Date.now()}-1@example.com`;
    const user2Email = `test-migration-${Date.now()}-2@example.com`;

    const { data: auth1, error: authError } = await adminClient.auth.admin.createUser({
      email: user1Email,
      password: "test-password-123",
      email_confirm: true,
    });

    if (authError || !auth1.user) {
      throw new Error(`Failed to create test user: ${authError?.message}`);
    }
    const user1 = auth1.user.id;

    const { data: auth2, error: authError2 } = await adminClient.auth.admin.createUser({
      email: user2Email,
      password: "test-password-456",
      email_confirm: true,
    });

    if (authError2 || !auth2.user) {
      throw new Error(`Failed to create test user 2: ${authError2?.message}`);
    }
    const user2 = auth2.user.id;

    // Create test program
    const programId = randomUUID();
    const { error: progError } = await adminClient.from("programs").insert({
      id: programId,
      user_id: user1,
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      split_type: "upper_lower",
      days_per_week: 3,
      deload_week: 4,
      started_on: "2026-11-01",
      ends_on: "2026-12-19",
      block_number: 1,
      week_offset: 0,
      status: "active",
    });

    if (progError) throw new Error(`Failed to create program: ${progError.message}`);

    // Create test program_day
    const programDayId = randomUUID();
    const { error: dayError } = await adminClient.from("program_days").insert({
      id: programDayId,
      program_id: programId,
      user_id: user1,
      day_index: 1,
      day_type: "weights",
      status: "active",
    });

    if (dayError) throw new Error(`Failed to create program_day: ${dayError.message}`);

    console.log("1. Can insert planned session\n");

    const sess1 = randomUUID();
    const { error: sess1Error } = await adminClient.from("sessions").insert({
      id: sess1,
      user_id: user1,
      program_id: programId,
      program_day_id: programDayId,
      local_date: "2026-11-02",
      status: "planned",
      planned_type: "weights",
      week_in_block: 1,
      is_deload: false,
    });

    check("First planned session inserted", !sess1Error, sess1Error?.message || "");

    console.log("\n2. Cannot insert duplicate planned session (same user+date)\n");

    const sess2 = randomUUID();
    const { error: sess2Error } = await adminClient.from("sessions").insert({
      id: sess2,
      user_id: user1,
      program_id: programId,
      program_day_id: programDayId,
      local_date: "2026-11-02",
      status: "planned",
      planned_type: "weights",
      week_in_block: 1,
      is_deload: false,
    });

    check("Duplicate planned session rejected", !!sess2Error && sess2Error.code === "23505");

    console.log("\n3. Can insert completed session on same date\n");

    const sess3 = randomUUID();
    const { error: sess3Error } = await adminClient.from("sessions").insert({
      id: sess3,
      user_id: user1,
      program_id: programId,
      program_day_id: programDayId,
      local_date: "2026-11-02",
      status: "completed",
      actual_type: "weights",
      week_in_block: 1,
      is_deload: false,
    });

    check("Completed session inserted (different status)", !sess3Error, sess3Error?.message || "");

    console.log("\n4. Can insert in_progress session on same date\n");

    const sess4 = randomUUID();
    const { error: sess4Error } = await adminClient.from("sessions").insert({
      id: sess4,
      user_id: user1,
      program_id: programId,
      program_day_id: programDayId,
      local_date: "2026-11-02",
      status: "in_progress",
      planned_type: "weights",
      week_in_block: 1,
      is_deload: false,
      started_at: new Date().toISOString(),
    });

    check("In-progress session inserted (different status)", !sess4Error, sess4Error?.message || "");

    console.log("\n5. Can insert planned session for different user on same date\n");

    const sess5 = randomUUID();
    const { error: sess5Error } = await adminClient.from("sessions").insert({
      id: sess5,
      user_id: user2,
      local_date: "2026-11-02",
      status: "planned",
      planned_type: "weights",
      week_in_block: 1,
      is_deload: false,
    });

    check("Planned session for user2 inserted (different user)", !sess5Error, sess5Error?.message || "");

    console.log("\n6. Can insert planned session for same user on different date\n");

    const sess6 = randomUUID();
    const { error: sess6Error } = await adminClient.from("sessions").insert({
      id: sess6,
      user_id: user1,
      program_id: programId,
      program_day_id: programDayId,
      local_date: "2026-11-03",
      status: "planned",
      planned_type: "weights",
      week_in_block: 1,
      is_deload: false,
    });

    check("Planned session on 11-03 inserted (different date)", !sess6Error, sess6Error?.message || "");

    console.log("\n7. Deleting session cascades to session_exercises\n");

    // Add a session_exercises row
    const { data: exercises } = await adminClient.from("exercises").select("id").limit(1).single();
    if (!exercises) throw new Error("No exercises found");

    const sessExId = randomUUID();
    const { error: sessExError } = await adminClient.from("session_exercises").insert({
      id: sessExId,
      session_id: sess1,
      user_id: user1,
      exercise_id: exercises.id,
      order_index: 0,
    });

    check("Session exercise inserted", !sessExError, sessExError?.message || "");

    // Delete the session
    const { error: deleteError } = await adminClient.from("sessions").delete().eq("id", sess1);
    check("Session deleted", !deleteError, deleteError?.message || "");

    // Verify cascade
    const { data: orphanedEx } = await adminClient
      .from("session_exercises")
      .select("id")
      .eq("id", sessExId)
      .maybeSingle();

    check("Session exercise cascaded (deleted)", !orphanedEx);

    // Cleanup
    await adminClient.auth.admin.deleteUser(user1);
    await adminClient.auth.admin.deleteUser(user2);

    if (failures > 0) {
      console.log(`\n✗ ${failures} check(s) failed`);
      process.exit(1);
    }

    console.log("\n✓ All unique planned session index tests passed");
  } catch (e) {
    console.error(`\n❌ Test error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
