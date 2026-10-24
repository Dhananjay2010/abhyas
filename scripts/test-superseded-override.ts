#!/usr/bin/env tsx

/**
 * Test: Planned override pointing to a superseded program_day
 * should resolve gracefully - either show the superseded day's label,
 * or resolve to the active day with the same day_index.
 */

import { strict as assert } from "assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { resolveDay } from "../src/lib/program/day-plan";

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
  console.log("Test: Planned override pointing to superseded program_day\n");

  // Create test user
  const testEmail = `test-superseded-override-${Date.now()}@example.com`;
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
    });

    // Create program
    const { data: program, error: programError } = await supabase
      .from("programs")
      .insert({
        user_id: userId,
        block_number: 1,
        split_type: "upper_lower",
        days_per_week: 4,
        primary_track: "weights",
        goal: "strength",
        level: "intermediate",
        status: "active",
        started_on: "2026-01-01",
        ends_on: "2026-01-28",
        deload_week: 4,
      })
      .select("id")
      .single();

    if (programError || !program) {
      throw new Error(`Failed to create program: ${programError?.message}`);
    }

    console.log(`Created program: ${program.id}`);

    // Create a program_day that will be superseded
    const { data: oldDay, error: oldDayError } = await supabase
      .from("program_days")
      .insert({
        program_id: program.id,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Old Upper",
        status: "superseded",
      })
      .select("id")
      .single();

    if (oldDayError || !oldDay) {
      throw new Error(`Failed to create superseded day: ${oldDayError?.message}`);
    }

    console.log(`Created superseded program_day: ${oldDay.id} (Old Upper)`);

    // Create a new active day with the same day_index
    const { data: newDay, error: newDayError } = await supabase
      .from("program_days")
      .insert({
        program_id: program.id,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "New Upper",
        status: "active",
      })
      .select("id")
      .single();

    if (newDayError || !newDay) {
      throw new Error(`Failed to create active day: ${newDayError?.message}`);
    }

    console.log(`Created active program_day: ${newDay.id} (New Upper)`);

    // Create a planned session that points to the superseded day
    const testDate = "2026-10-26";
    const { error: sessionError } = await supabase.from("sessions").insert({
      user_id: userId,
      local_date: testDate,
      status: "planned",
      actual_type: "weights",
      program_day_id: oldDay.id,
    });

    if (sessionError) {
      throw new Error(`Failed to create planned session: ${sessionError.message}`);
    }

    console.log(`Created planned session for ${testDate} pointing to superseded day`);

    // Test: resolveDay should handle this gracefully
    const resolved = await resolveDay(supabase, program.id, testDate);

    console.log(`\nResolved day:`);
    console.log(`  dayType: ${resolved?.dayType}`);
    console.log(`  label: ${resolved?.label}`);
    console.log(`  programDayId: ${resolved?.programDayId}`);
    console.log(`  isOverride: ${resolved?.isOverride}`);

    // Assertions:
    // 1. Should be an override
    assert(resolved?.isOverride, "Should be marked as override");
    
    // 2. Should have correct dayType
    assert.equal(resolved?.dayType, "weights", "dayType should be weights");
    
    // 3. Label should be either "Old Upper" or "New Upper" (not "Today")
    assert(
      resolved?.label === "Old Upper" || resolved?.label === "New Upper",
      `Label should be Old Upper or New Upper, got: ${resolved?.label}`
    );
    
    // 4. programDayId should be either old or new day (resolved to active)
    const isProgramDayValid = 
      resolved?.programDayId === oldDay.id || 
      resolved?.programDayId === newDay.id;
    assert(isProgramDayValid, `programDayId should be old or new day, got: ${resolved?.programDayId}`);

    console.log(`\n✅ Superseded override resolved correctly`);
    console.log(`   Label preserved: ${resolved?.label}`);
    console.log(`   Program day resolved to: ${resolved?.programDayId === newDay.id ? "active" : "superseded"}`);

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
