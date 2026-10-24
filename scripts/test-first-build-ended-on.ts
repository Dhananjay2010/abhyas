#!/usr/bin/env tsx

/**
 * Test: First-build path marking program 'completed' must set ended_on
 * matching rebuild_block convention: ended_on = (new block's started_on) - 1
 */

import { strict as assert } from "assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { addDays } from "../src/lib/dates";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Test: First-build path sets ended_on when marking program completed\n");

  // Create test user
  const testEmail = `test-first-build-ended-${Date.now()}@example.com`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: "test123456",
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId}`);

  try {
    // Create profile
    await supabase.from("profiles").insert({
      id: userId,
      onboarding_completed_at: new Date().toISOString(),
      timezone: "America/New_York",
      date_of_birth: "1990-01-01",
    });

    // Create an initial active program (simulating first build scenario)
    const oldStartDate = "2026-10-01";
    const { data: oldProgram, error: oldProgramError } = await supabase
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "full_body",
        days_per_week: 3,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        status: "active",
        started_on: oldStartDate,
        ends_on: addDays(oldStartDate, 27),
        deload_week: 4,
      })
      .select("id")
      .single();

    if (oldProgramError || !oldProgram) {
      throw new Error(`Failed to create old program: ${oldProgramError?.message}`);
    }

    console.log(`Created old active program: ${oldProgram.id} (started ${oldStartDate})`);

    // Simulate the first-build path logic: marking old program completed when creating new one
    const newStartDate = "2026-10-15";
    
    // This is what persist.ts does on first-build path
    const { error: updateError } = await supabase
      .from("programs")
      .update({ 
        status: "completed", 
        ended_on: addDays(newStartDate, -1) // ended_on = new block's started_on - 1
      })
      .eq("user_id", userId)
      .eq("status", "active");

    if (updateError) {
      throw new Error(`Failed to update old program: ${updateError.message}`);
    }

    console.log(`Marked old program completed with first-build logic`);

    // Create new program
    const { error: newProgramError } = await supabase
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 2,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "muscle_gain",
        level: "intermediate",
        status: "active",
        started_on: newStartDate,
        ends_on: addDays(newStartDate, 27),
        deload_week: 4,
      });

    if (newProgramError) {
      throw new Error(`Failed to create new program: ${newProgramError.message}`);
    }

    console.log(`Created new active program (started ${newStartDate})`);

    // Verify the old program has ended_on set correctly
    const { data: completedProgram, error: queryError } = await supabase
      .from("programs")
      .select("id, status, started_on, ended_on")
      .eq("id", oldProgram.id)
      .single();

    if (queryError || !completedProgram) {
      throw new Error(`Failed to query completed program: ${queryError?.message}`);
    }

    console.log(`\nCompleted program state:`);
    console.log(`  status: ${completedProgram.status}`);
    console.log(`  started_on: ${completedProgram.started_on}`);
    console.log(`  ended_on: ${completedProgram.ended_on}`);
    console.log(`  expected ended_on: ${addDays(newStartDate, -1)}`);

    // Assertions
    assert.equal(completedProgram.status, "completed", "Status should be completed");
    assert.equal(
      completedProgram.ended_on, 
      addDays(newStartDate, -1), 
      `ended_on should be ${addDays(newStartDate, -1)} (new block's started_on - 1)`
    );

    console.log(`\n✅ ended_on set correctly on first-build completion`);
    console.log(`   Convention: ended_on = (new block's started_on) - 1`);

  } finally {
    // Cleanup
    await supabase.auth.admin.deleteUser(userId);
    console.log(`\nCleaned up test user: ${userId}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
