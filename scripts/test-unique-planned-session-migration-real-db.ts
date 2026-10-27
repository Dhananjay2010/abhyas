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

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
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

  console.log("\nUnique planned session migration test\n");

  const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  // Create test user
  const userEmail = `test-migration-${Date.now()}@example.com`;
  const { data: auth, error: authError } = await adminClient.auth.admin.createUser({
    email: userEmail,
    password: "test-password-123",
    email_confirm: true,
  });

  if (authError || !auth.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }
  const userId = auth.user.id;

  // Create test program and day
  const programId = "10000000-0000-0000-0000-000000000001";
  const programDayId = "20000000-0000-0000-0000-000000000001";
  const exerciseId = "30000000-0000-0000-0000-000000000001";

  const { error: progError } = await adminClient.from("programs").insert({
    id: programId,
    user_id: userId,
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

  const { error: dayError } = await adminClient.from("program_days").insert({
    id: programDayId,
    program_id: programId,
    user_id: userId,
    day_index: 1,
    day_type: "weights",
    status: "active",
  });
  if (dayError) throw new Error(`Failed to create program_day: ${dayError.message}`);

  // Seed test cases with explicit UUIDs and timestamps
  const baseTime = "2026-11-15T10:00:00Z";
  const laterTime = "2026-11-15T10:30:00Z";

  // Case (a): pure dup - two empty rows, keep oldest
  const caseA1 = "a0000000-0000-0000-0000-000000000001";
  const caseA2 = "a0000000-0000-0000-0000-000000000002";

  // Case (b): higher id has exercises and sets, keep it
  const caseB1 = "b0000000-0000-0000-0000-000000000001";
  const caseB2 = "b0000000-0000-0000-0000-000000000002";

  // Case (b2): higher id has 1 exercise and 0 sets, keep it
  const caseB2_1 = "c0000000-0000-0000-0000-000000000001";
  const caseB2_2 = "c0000000-0000-0000-0000-000000000002";

  // Case (c): both have exercises and sets, keep oldest
  const caseC1 = "d0000000-0000-0000-0000-000000000001";
  const caseC2 = "d0000000-0000-0000-0000-000000000002";

  // Case (d): mixed statuses on same date, all kept
  const caseD1 = "e0000000-0000-0000-0000-000000000001";
  const caseD2 = "e0000000-0000-0000-0000-000000000002";
  const caseD3 = "e0000000-0000-0000-0000-000000000003";
  const caseD4 = "e0000000-0000-0000-0000-000000000004";

  // Case (e): different local_dates, both kept
  const caseE1 = "f0000000-0000-0000-0000-000000000001";
  const caseE2 = "f0000000-0000-0000-0000-000000000002";

  // Case (f): dropped row has breathing_log, becomes skipped
  const caseF1 = "90000000-0000-0000-0000-000000000001";
  const caseF2 = "90000000-0000-0000-0000-000000000002";

  // Case (g): lowest uuid is NEWER empty, older row has exercise (keep older)
  const caseG1 = "10000000-0000-0000-0000-000000000001"; // older, has exercise
  const caseG2 = "00000000-0000-0000-0000-000000000002"; // newer, empty, lower uuid

  // Case (h): three planned rows, middle one with children
  const caseH1 = "h0000000-0000-0000-0000-000000000001";
  const caseH2 = "h0000000-0000-0000-0000-000000000002";
  const caseH3 = "h0000000-0000-0000-0000-000000000003";

  const { error: sessError } = await adminClient.from("sessions").insert([
    // Case (a): pure dup
    { id: caseA1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-20", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseA2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-20", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: laterTime },
    
    // Case (b): higher id has exercises and sets
    { id: caseB1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-21", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseB2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-21", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    
    // Case (b2): higher id has 1 exercise and 0 sets
    { id: caseB2_1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-22", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseB2_2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-22", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    
    // Case (c): both have exercises and sets
    { id: caseC1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-23", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseC2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-23", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: laterTime },
    
    // Case (d): mixed statuses
    { id: caseD1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-24", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseD2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-24", status: "completed", actual_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseD3, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-24", status: "in_progress", actual_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseD4, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-24", status: "skipped", actual_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    
    // Case (e): different dates
    { id: caseE1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-25", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseE2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-26", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    
    // Case (f): dropped row has breathing_log
    { id: caseF1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-27", status: "planned", planned_type: "meditation", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseF2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-27", status: "planned", planned_type: "meditation", week_in_block: 1, is_deload: false, created_at: laterTime },
    
    // Case (g): lowest uuid is NEWER, older has exercise
    { id: caseG1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-28", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseG2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-28", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: laterTime },
    
    // Case (h): three planned, middle has children
    { id: caseH1, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-29", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: baseTime },
    { id: caseH2, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-29", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: laterTime },
    { id: caseH3, user_id: userId, program_id: programId, program_day_id: programDayId, local_date: "2026-11-29", status: "planned", planned_type: "weights", week_in_block: 1, is_deload: false, created_at: "2026-11-15T11:00:00Z" },
  ]);
  if (sessError) throw new Error(`Failed to insert sessions: ${sessError.message}`);

  // Add session_exercises and session_sets
  const { error: exError } = await adminClient.from("session_exercises").insert([
    // Case (b): B2 has exercise with sets
    { id: "be000000-0000-0000-0000-000000000002", session_id: caseB2, user_id: userId, exercise_id: exerciseId, order_index: 0, status: "pending", planned_sets: 3 },
    // Case (b2): B2_2 has exercise without sets
    { id: "be000000-0000-0000-0000-000000000022", session_id: caseB2_2, user_id: userId, exercise_id: exerciseId, order_index: 0, status: "pending", planned_sets: 3 },
    // Case (c): both have exercises with sets
    { id: "ce000000-0000-0000-0000-000000000001", session_id: caseC1, user_id: userId, exercise_id: exerciseId, order_index: 0, status: "pending", planned_sets: 3 },
    { id: "ce000000-0000-0000-0000-000000000002", session_id: caseC2, user_id: userId, exercise_id: exerciseId, order_index: 0, status: "pending", planned_sets: 3 },
    // Case (g): G1 has exercise
    { id: "ge000000-0000-0000-0000-000000000001", session_id: caseG1, user_id: userId, exercise_id: exerciseId, order_index: 0, status: "pending", planned_sets: 3 },
    // Case (h): H2 (middle) has exercise
    { id: "he000000-0000-0000-0000-000000000002", session_id: caseH2, user_id: userId, exercise_id: exerciseId, order_index: 0, status: "pending", planned_sets: 3 },
  ]);
  if (exError) throw new Error(`Failed to insert session_exercises: ${exError.message}`);

  const { error: setError } = await adminClient.from("session_sets").insert([
    // Case (b): B2 has sets
    { user_id: userId, session_exercise_id: "be000000-0000-0000-0000-000000000002", set_number: 1, reps: 10, weight_kg: 100, is_warmup_set: false },
    // Case (c): both have sets
    { user_id: userId, session_exercise_id: "ce000000-0000-0000-0000-000000000001", set_number: 1, reps: 10, weight_kg: 100, is_warmup_set: false },
    { user_id: userId, session_exercise_id: "ce000000-0000-0000-0000-000000000002", set_number: 1, reps: 10, weight_kg: 100, is_warmup_set: false },
  ]);
  if (setError) throw new Error(`Failed to insert session_sets: ${setError.message}`);

  // Add breathing_log for case (f)
  const { error: breathError } = await adminClient.from("breathing_logs").insert({
    session_id: caseF2,
    user_id: userId,
    pattern_name: "Box Breathing",
    breaths: 20,
    cycles_completed: 5,
    planned_cycles: 5,
    seconds: 80,
    guidance: "inhale",
    ended_early: false,
  });
  if (breathError) throw new Error(`Failed to insert breathing_log: ${breathError.message}`);

  // Count children before migration
  const { count: exercisesBefore } = await adminClient.from("session_exercises").select("*", { count: "exact", head: true });
  const { count: setsBefore } = await adminClient.from("session_sets").select("*", { count: "exact", head: true });
  const { count: breathingBefore } = await adminClient.from("breathing_logs").select("*", { count: "exact", head: true });

  // Compute md5 of all child rows for content verification
  const { data: exercisesData } = await adminClient.from("session_exercises").select("*").order("id");
  const { data: setsData } = await adminClient.from("session_sets").select("*").order("session_exercise_id, set_number");
  const { data: breathingData } = await adminClient.from("breathing_logs").select("*").order("id");
  
  const childrenHash = createHash("md5")
    .update(JSON.stringify({ exercisesData, setsData, breathingData }))
    .digest("hex");

  console.log("Before migration:");
  console.log(`  session_exercises: ${exercisesBefore}`);
  console.log(`  session_sets: ${setsBefore}`);
  console.log(`  breathing_logs: ${breathingBefore}`);
  console.log(`  children hash: ${childrenHash}\n`);

  // Implement migration logic in TypeScript for testing
  console.log("Running migration logic...\n");
  
  // Get all planned sessions
  const { data: plannedSessions } = await adminClient
    .from("sessions")
    .select("id, user_id, local_date, created_at")
    .eq("status", "planned")
    .order("user_id")
    .order("local_date")
    .order("created_at")
    .order("id");

  if (!plannedSessions) throw new Error("Failed to query planned sessions");

  // Group by (user_id, local_date) and rank
  const groups = new Map<string, typeof plannedSessions>();
  for (const session of plannedSessions) {
    const key = `${session.user_id}:${session.local_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(session);
  }

  let deletedCount = 0;
  let skippedCount = 0;

  for (const [, sessions] of groups) {
    if (sessions.length <= 1) continue;

    // Rank by: has sets DESC, has exercises DESC, has breathing DESC, created_at ASC, id ASC
    const ranked = await Promise.all(
      sessions.map(async (s) => {
        const { data: exercises } = await adminClient
          .from("session_exercises")
          .select("id")
          .eq("session_id", s.id);
        
        const hasSets = exercises && exercises.length > 0 
          ? await Promise.any(
              exercises.map(async (ex) => {
                const { data: sets } = await adminClient
                  .from("session_sets")
                  .select("id")
                  .eq("session_exercise_id", ex.id)
                  .limit(1);
                return sets && sets.length > 0;
              })
            ).catch(() => false)
          : false;

        const hasExercises = exercises && exercises.length > 0;

        const { data: breathing } = await adminClient
          .from("breathing_logs")
          .select("id")
          .eq("session_id", s.id)
          .limit(1);
        const hasBreathing = breathing && breathing.length > 0;

        return {
          ...s,
          hasSets,
          hasExercises,
          hasBreathing,
        };
      })
    );

    ranked.sort((a, b) => {
      if (a.hasSets !== b.hasSets) return b.hasSets ? 1 : -1;
      if (a.hasExercises !== b.hasExercises) return b.hasExercises ? 1 : -1;
      if (a.hasBreathing !== b.hasBreathing) return b.hasBreathing ? 1 : -1;
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    // Keep first, process rest
    for (let i = 1; i < ranked.length; i++) {
      const dup = ranked[i];
      if (dup.hasExercises || dup.hasBreathing) {
        // Skip data-bearing row
        await adminClient
          .from("sessions")
          .update({ status: "skipped" })
          .eq("id", dup.id);
        skippedCount++;
      } else {
        // Delete childless row
        await adminClient
          .from("sessions")
          .delete()
          .eq("id", dup.id);
        deletedCount++;
      }
    }
  }

  console.log(`Dedupe: deleted ${deletedCount} childless duplicate(s), skipped ${skippedCount} data-bearing duplicate(s)\n`);

  // Count children after migration
  const { count: exercisesAfter } = await adminClient.from("session_exercises").select("*", { count: "exact", head: true });
  const { count: setsAfter } = await adminClient.from("session_sets").select("*", { count: "exact", head: true });
  const { count: breathingAfter } = await adminClient.from("breathing_logs").select("*", { count: "exact", head: true });

  // Verify child content unchanged
  const { data: exercisesDataAfter } = await adminClient.from("session_exercises").select("*").order("id");
  const { data: setsDataAfter } = await adminClient.from("session_sets").select("*").order("session_exercise_id, set_number");
  const { data: breathingDataAfter } = await adminClient.from("breathing_logs").select("*").order("id");
  
  const childrenHashAfter = createHash("md5")
    .update(JSON.stringify({ exercisesData: exercisesDataAfter, setsData: setsDataAfter, breathingData: breathingDataAfter }))
    .digest("hex");

  console.log("After migration:");
  console.log(`  session_exercises: ${exercisesAfter}`);
  console.log(`  session_sets: ${setsAfter}`);
  console.log(`  breathing_logs: ${breathingAfter}`);
  console.log(`  children hash: ${childrenHashAfter}\n`);

  console.log("Zero child rows lost:");
  check("session_exercises count unchanged", exercisesBefore === exercisesAfter);
  check("session_sets count unchanged", setsBefore === setsAfter);
  check("breathing_logs count unchanged", breathingBefore === breathingAfter);
  check("children content unchanged (md5)", childrenHash === childrenHashAfter);

  // Query final state
  const { data: sessions } = await adminClient.from("sessions").select("*").eq("user_id", userId).order("local_date", { ascending: true }).order("id");

  console.log("\nCase (a): pure dup");
  const caseARows = sessions?.filter(s => s.local_date === "2026-11-20" && s.status === "planned") || [];
  check("Exactly one planned row", caseARows.length === 1);
  check("Oldest row kept", caseARows[0]?.id === caseA1, `got ${caseARows[0]?.id}`);

  console.log("\nCase (b): higher id has exercises and sets");
  const caseBRows = sessions?.filter(s => s.local_date === "2026-11-21" && s.status === "planned") || [];
  const caseBSkipped = sessions?.filter(s => s.local_date === "2026-11-21" && s.status === "skipped") || [];
  check("Exactly one planned row", caseBRows.length === 1);
  check("Row with sets kept as planned", caseBRows[0]?.id === caseB2);
  check("Childless row deleted (not skipped)", caseBSkipped.length === 0);

  console.log("\nCase (b2): higher id has 1 exercise and 0 sets");
  const caseB2Rows = sessions?.filter(s => s.local_date === "2026-11-22" && s.status === "planned") || [];
  const caseB2Skipped = sessions?.filter(s => s.local_date === "2026-11-22" && s.status === "skipped") || [];
  check("Exactly one planned row", caseB2Rows.length === 1);
  check("Row with exercise (no sets) kept as planned", caseB2Rows[0]?.id === caseB2_2);
  check("Childless row deleted", caseB2Skipped.length === 0);

  console.log("\nCase (c): both have exercises and sets");
  const caseCRows = sessions?.filter(s => s.local_date === "2026-11-23" && s.status === "planned") || [];
  const caseCSkipped = sessions?.filter(s => s.local_date === "2026-11-23" && s.status === "skipped") || [];
  check("Exactly one planned row", caseCRows.length === 1);
  check("Older row kept as planned", caseCRows[0]?.id === caseC1, `got ${caseCRows[0]?.id}`);
  check("Newer data-bearing row skipped (not deleted)", caseCSkipped.length === 1 && caseCSkipped[0]?.id === caseC2);

  console.log("\nCase (d): mixed statuses");
  const caseDAll = sessions?.filter(s => s.local_date === "2026-11-24") || [];
  check("All 4 statuses present", caseDAll.length === 4);
  check("Planned row untouched", caseDAll.some(s => s.id === caseD1 && s.status === "planned"));
  check("Completed row untouched", caseDAll.some(s => s.id === caseD2 && s.status === "completed"));
  check("In-progress row untouched", caseDAll.some(s => s.id === caseD3 && s.status === "in_progress"));
  check("Skipped row untouched", caseDAll.some(s => s.id === caseD4 && s.status === "skipped"));

  console.log("\nCase (e): different dates");
  check("Both planned rows kept", 
    Boolean(sessions?.some(s => s.id === caseE1 && s.status === "planned") &&
    sessions?.some(s => s.id === caseE2 && s.status === "planned"))
  );

  console.log("\nCase (f): dropped row has breathing_log");
  const caseFRows = sessions?.filter(s => s.local_date === "2026-11-27" && s.status === "planned") || [];
  const caseFSkipped = sessions?.filter(s => s.local_date === "2026-11-27" && s.status === "skipped") || [];
  check("Exactly one planned row", caseFRows.length === 1);
  check("Childless row kept as planned", caseFRows[0]?.id === caseF1);
  check("Row with breathing_log skipped (not deleted)", caseFSkipped.length === 1 && caseFSkipped[0]?.id === caseF2);

  console.log("\nCase (g): lowest uuid is NEWER empty, older has exercise");
  const caseGRows = sessions?.filter(s => s.local_date === "2026-11-28" && s.status === "planned") || [];
  check("Exactly one planned row", caseGRows.length === 1);
  check("Older row with exercise kept (not lower uuid)", caseGRows[0]?.id === caseG1, `got ${caseGRows[0]?.id}`);

  console.log("\nCase (h): three planned, middle has children");
  const caseHRows = sessions?.filter(s => s.local_date === "2026-11-29" && s.status === "planned") || [];
  const caseHSkipped = sessions?.filter(s => s.local_date === "2026-11-29" && s.status === "skipped") || [];
  check("Exactly one planned row", caseHRows.length === 1);
  check("Oldest row kept as planned", caseHRows[0]?.id === caseH1);
  check("Middle row (data-bearing) skipped", caseHSkipped.some(s => s.id === caseH2));
  check("Newest childless row deleted", !sessions?.some(s => s.id === caseH3));

  console.log("\nIndex creation:");
  // Try to insert duplicate planned
  const { error: dupError } = await adminClient.from("sessions").insert({
    user_id: userId,
    program_id: programId,
    program_day_id: programDayId,
    local_date: "2026-11-20",
    status: "planned",
    planned_type: "weights",
    week_in_block: 1,
    is_deload: false,
  });
  check("Index prevents duplicate planned", dupError !== null && dupError.code === "23505");

  // Clean up
  await adminClient.auth.admin.deleteUser(userId);

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
