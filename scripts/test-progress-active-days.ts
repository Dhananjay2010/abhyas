#!/usr/bin/env tsx

/**
 * Test: Progress page must filter program_days to status='active' only,
 * and order by day_index deterministically.
 * 
 * Behavioural test: Seeds DB, calls real data-loading query, verifies filtering.
 */

import { strict as assert } from "assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { loadProgramDays } from "../src/lib/progress/load-program-days";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Test: Progress page program_days query filters active and orders by day_index\n");

  // Create test user
  const testEmail = `test-progress-active-${Date.now()}@example.com`;
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
        split_type: "full_body",
        days_per_week: 3,
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

    // Create program_days: one active at day_index 1, one superseded at day_index 2
    const { error: daysError } = await supabase.from("program_days").insert([
      {
        program_id: program.id,
        user_id: userId,
        day_index: 1,
        day_type: "weights",
        label: "Lower",
        status: "active",
      },
      {
        program_id: program.id,
        user_id: userId,
        day_index: 2,
        day_type: "weights",
        label: "Upper",
        status: "superseded",
      },
    ]);

    if (daysError) {
      throw new Error(`Failed to create program_days: ${daysError.message}`);
    }

    console.log(`Created program_days: day 1 (active), day 2 (superseded)`);

    // Call real data-loading function used by progress page
    const { data: allDays } = await loadProgramDays(supabase);
    const activeDays = allDays?.filter((d) => d.program_id === program.id);

    console.log(`\nReal query returned: ${activeDays?.length || 0} rows`);
    activeDays?.forEach((d) => {
      console.log(`  day_index=${d.day_index}, day_type=${d.day_type}`);
    });

    // Assert only active day is returned
    assert.equal(activeDays?.length, 1, "Only 1 active day");
    assert.equal(activeDays?.[0].day_index, 1, "Active day is day_index 1");
    assert.equal(activeDays?.[0].day_type, "weights", "Active day is weights");

    // Test ordering with multiple active days
    await supabase.from("program_days").insert([
      {
        program_id: program.id,
        user_id: userId,
        day_index: 3,
        day_type: "weights",
        label: "Full",
        status: "active",
      },
    ]);

    const { data: allDaysAfter } = await loadProgramDays(supabase);
    const multipleActive = allDaysAfter?.filter((d) => d.program_id === program.id);

    console.log(`\nMultiple active days: ${multipleActive?.map((d) => d.day_index).join(", ")}`);

    assert.equal(multipleActive?.length, 2, "2 active days");
    assert.equal(multipleActive?.[0].day_index, 1, "First is day_index 1");
    assert.equal(multipleActive?.[1].day_index, 3, "Second is day_index 3");

    console.log("\n✅ All tests passed!");
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
