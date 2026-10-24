/**
 * End-to-end reproduction of yoga streak bug using real Supabase database.
 * 
 * This test simulates the exact production scenario:
 * 1. User completes a strength session (streak=1, days=1)
 * 2. User clicks "I did this" on a yoga video (should be streak=2, days=2)
 * 3. Progress page queries and computes streak (actual bug location)
 *
 * Run with: npx tsx scripts/test-yoga-streak-e2e.ts
 * Or in CI: database-seed-test job runs this after supabase start
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import { localDateString } from "../src/lib/dates";
import { resolveTimezoneWithProfile } from "../src/lib/timezone";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Test user from seed.sql
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

type DayType = Database["public"]["Enums"]["day_type"];

function check(label: string, pass: boolean, actual?: unknown, expected?: unknown): void {
  if (!pass) {
    console.error(`✗ FAIL: ${label}`);
    if (actual !== undefined && expected !== undefined) {
      console.error(`  Expected: ${JSON.stringify(expected)}`);
      console.error(`  Actual:   ${JSON.stringify(actual)}`);
    }
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  console.log("\n=== Yoga Streak Bug Reproduction (E2E with Real Supabase) ===\n");
  console.log(`Connecting to Supabase at ${SUPABASE_URL}...`);

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Auth as test user (from seed.sql: test@example.com / testpass123)
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: "test@example.com",
    password: "testpass123",
  });

  check("Test user authentication", !authErr && authData.user !== null, authErr?.message);

  // Get test user profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", TEST_USER_ID)
    .single();

  check("Test user profile exists", !profileErr && profile !== null, profileErr?.message);
  
  const timezone = resolveTimezoneWithProfile(profile?.timezone);
  const today = localDateString(timezone);
  console.log(`Today: ${today}, Timezone: ${timezone}\n`);

  // Clean up any test yoga sessions first
  await supabase
    .from("sessions")
    .delete()
    .eq("user_id", TEST_USER_ID)
    .eq("actual_type", "yoga");

  // Step 1: Verify initial state - seed.sql already created 1 completed strength session
  console.log("Step 1: Verify initial state (seed has 1 strength session)...");
  
  const { data: initialSessions } = await supabase
    .from("sessions")
    .select("local_date, status, actual_type")
    .eq("user_id", TEST_USER_ID)
    .eq("status", "completed");

  console.log(`Initial completed sessions: ${initialSessions?.length || 0}`);
  check("Seed created at least 1 completed session", (initialSessions?.length || 0) >= 1);

  // Step 2a: Check for same-day strength session (candidate a)
  console.log("\nStep 2a: Check if strength session exists on same day as yoga...");
  
  const strengthToday = initialSessions?.find(
    (s) => s.local_date === today && (s.actual_type === "weights" || s.actual_type === "bodyweight")
  );
  
  if (strengthToday) {
    console.log(`  ⚠️  Strength session already exists today (${today})`);
    console.log(`  This is candidate (a): strength and yoga on same day`);
    console.log(`  Days trained should still increment if they're counted separately\n`);
  } else {
    console.log(`  No strength session today - yoga will be on a different day\n`);
  }

  // Step 2b: Simulate marking a yoga video as done (the way markYogaVideoDone does it)
  console.log("Step 2b: Simulate user clicking 'I did this' on a yoga video...");
  
  // Get a yoga video
  const { data: yogaVideo } = await supabase
    .from("yoga_videos")
    .select("id, duration_minutes, playlist_id")
    .limit(1)
    .single();

  check("Yoga video exists in database", yogaVideo !== null);

  // Check if there's an existing session to reuse (candidate c)
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("id, status, planned_type, actual_type, local_date")
    .eq("user_id", TEST_USER_ID)
    .eq("local_date", today);

  const reuseableSession = existingSessions?.find(
    (c) => c.status !== "completed" && c.planned_type === "yoga"
  );

  if (reuseableSession) {
    console.log(`  Found reuseable yoga session: ${reuseableSession.id}`);
    console.log(`  This is candidate (c): session reuse logic`);
  }

  // Update yoga progress (as markYogaVideoDone does)
  await supabase.from("user_yoga_progress").upsert(
    {
      user_id: TEST_USER_ID,
      playlist_id: yogaVideo!.playlist_id,
      completed_video_ids: [yogaVideo!.id],
      last_completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,playlist_id" }
  );

  // Insert or update yoga session the same way markYogaVideoDone does
  const yogaPayload = {
    status: "completed" as const,
    actual_type: "yoga" as const,
    completed_at: new Date().toISOString(),
    duration_seconds: ((yogaVideo?.duration_minutes || 0) * 60) || null,
    yoga_video_id: yogaVideo?.id || null,
  };

  let yogaSessionId: string;
  if (reuseableSession) {
    const { error: updateErr } = await supabase
      .from("sessions")
      .update(yogaPayload)
      .eq("id", reuseableSession.id);
    check("Reused yoga session updated", !updateErr, updateErr?.message);
    yogaSessionId = reuseableSession.id;
  } else {
    const { error: insertErr, data: newSession } = await supabase
      .from("sessions")
      .insert({
        user_id: TEST_USER_ID,
        local_date: today,
        planned_type: "yoga",
        ...yogaPayload,
      })
      .select()
      .single();
    check("New yoga session created", !insertErr, insertErr?.message);
    yogaSessionId = newSession!.id;
  }

  console.log(`Created/updated yoga session: ${yogaSessionId}`);

  // Step 2c: Check timezone and completed_at (candidate b)
  console.log("\nStep 2c: Check timezone handling (candidate b)...");
  
  const { data: yogaSessionCheck } = await supabase
    .from("sessions")
    .select("local_date, completed_at, actual_type")
    .eq("id", yogaSessionId)
    .single();

  console.log(`  Yoga session local_date: ${yogaSessionCheck?.local_date}`);
  console.log(`  Yoga session completed_at: ${yogaSessionCheck?.completed_at}`);
  console.log(`  Computed today (from timezone): ${today}`);
  
  if (yogaSessionCheck?.local_date !== today) {
    console.log(`  ⚠️  MISMATCH: local_date (${yogaSessionCheck?.local_date}) != today (${today})`);
    console.log(`  This is candidate (b): timezone/local_date mismatch\n`);
  } else {
    console.log(`  ✓ local_date matches today\n`);
  }

  // Step 3: Query Progress page data EXACTLY as page.tsx does it
  console.log("Step 3: Query Progress page data (reproduce exact page.tsx logic)...");

  const [programsRes, sessionsRes, programDaysRes] = await Promise.all([
    supabase
      .from("programs")
      .select("id, started_on, ends_on, created_at")
      .eq("user_id", TEST_USER_ID)
      .order("started_on")
      .order("created_at"),
    
    supabase
      .from("sessions")
      .select("local_date, status, actual_type")
      .eq("user_id", TEST_USER_ID)
      .order("local_date", { ascending: false })
      .limit(500),
    
    supabase
      .from("program_days")
      .select("program_id, day_index, day_type")
      .eq("user_id", TEST_USER_ID),
  ]);

  const programs = (programsRes.data ?? []).map((p) => ({
    id: p.id,
    startedOn: p.started_on,
    endsOn: p.ends_on,
  }));

  const allProgramDays = programDaysRes.data;
  const dayTypesByProgram: Record<string, Record<number, DayType>> = {};
  for (const d of allProgramDays ?? []) {
    (dayTypesByProgram[d.program_id] ??= {})[d.day_index] = d.day_type;
  }

  console.log(`Programs: ${programs.length}`);
  console.log(`Sessions (raw query): ${sessionsRes.data?.length || 0}`);
  console.log(`Program days: ${allProgramDays?.length || 0}\n`);

  // Check candidate (d): query filters and limits
  console.log("Step 3d: Check query filters (candidate d)...");
  
  const allSessions = sessionsRes.data ?? [];
  console.log(`  Total sessions from query: ${allSessions.length}`);
  console.log(`  Query limit: 500`);
  
  if (allSessions.length >= 500) {
    console.log(`  ⚠️  Hit query limit! Older sessions may be excluded`);
  }
  
  const yogaInQuery = allSessions.filter((s) => s.actual_type === "yoga");
  console.log(`  Yoga sessions in raw query: ${yogaInQuery.length}`);
  
  for (const ys of yogaInQuery) {
    console.log(`    - ${ys.local_date}: status=${ys.status}, actual_type=${ys.actual_type}`);
  }

  // Filter and map sessions EXACTLY as page.tsx does
  const completedSessions = allSessions
    .filter((s) => s.status === "completed")
    .map((s) => ({ local_date: s.local_date, actual_type: s.actual_type }));

  console.log(`\n  After status='completed' filter: ${completedSessions.length} sessions`);
  
  const yogaCompleted = completedSessions.filter((s) => s.actual_type === "yoga");
  console.log(`  Yoga sessions after filter: ${yogaCompleted.length}`);
  
  if (yogaInQuery.length > 0 && yogaCompleted.length === 0) {
    console.log(`  ⚠️  BUG FOUND: Yoga sessions exist but filtered out by status!`);
    console.log(`  This means yoga sessions have status != 'completed'\n`);
  }

  console.log(`\n  Final completed sessions:`);
  for (const s of completedSessions) {
    console.log(`    ${s.local_date}: ${s.actual_type}`);
  }

  // Step 4: Compute streaks using buildDayRecords and computeStreaks (same as page.tsx)
  console.log("\nStep 4: Compute streaks using real Progress logic...");

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today,
  });

  const streaks = computeStreaks(dayRecords, today);

  console.log(`\nResults:`);
  console.log(`  Current streak: ${streaks.current}`);
  console.log(`  Days trained:   ${streaks.totalSessions}`);
  console.log(`  Longest streak: ${streaks.longest}\n`);

  // Step 5: Verify expectations
  const strengthSessionCount = completedSessions.filter(
    (s) => s.actual_type === "weights" || s.actual_type === "bodyweight"
  ).length;
  const yogaSessionCount = completedSessions.filter((s) => s.actual_type === "yoga").length;

  console.log(`Breakdown:`);
  console.log(`  Strength sessions: ${strengthSessionCount}`);
  console.log(`  Yoga sessions: ${yogaSessionCount}\n`);

  // The bug: Days trained should equal strength + yoga sessions
  // UNLESS they're on the same day (then days trained counts as 1 day, which is correct)
  const uniqueDates = new Set(completedSessions.map((s) => s.local_date));
  const expectedDaysTrained = uniqueDates.size;
  
  console.log(`Unique training dates: ${uniqueDates.size}`);
  console.log(`Expected days trained: ${expectedDaysTrained} (unique dates)`);
  
  // If strength and yoga are on the same day, days trained = 1 is CORRECT
  // But streak should still count both types
  const strengthDates = new Set(
    completedSessions
      .filter((s) => s.actual_type === "weights" || s.actual_type === "bodyweight")
      .map((s) => s.local_date)
  );
  const yogaDates = new Set(
    completedSessions.filter((s) => s.actual_type === "yoga").map((s) => s.local_date)
  );
  
  const sameDaySessions = [...strengthDates].some((d) => yogaDates.has(d));
  
  if (sameDaySessions) {
    console.log(`\n⚠️  Strength and yoga on SAME DAY detected`);
    console.log(`Days trained = ${uniqueDates.size} is CORRECT (counts unique dates)`);
    console.log(`But streak should still recognize both session types\n`);
  }
  
  check(
    "Days trained equals unique training dates",
    streaks.totalSessions === expectedDaysTrained,
    streaks.totalSessions,
    expectedDaysTrained
  );

  // Yoga sessions should contribute to streak even if on same day as strength
  const hasYoga = yogaSessionCount > 0;
  
  if (hasYoga && streaks.totalSessions < 1) {
    console.error(`\n✗ BUG: Yoga session exists but days trained = 0`);
    console.error(`  This means yoga is NOT being counted toward streak`);
    process.exit(1);
  }

  if (hasYoga) {
    check("Yoga sessions counted in days trained", streaks.totalSessions >= 1);
  }

  // Test case: yoga-only day after strength should increment streak
  console.log(`\nStep 6: Test yoga-only day after strength (streak progression)...`);
  
  // Create a yoga session on a different day (tomorrow)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  
  await supabase.from("sessions").insert({
    user_id: TEST_USER_ID,
    local_date: tomorrowStr,
    planned_type: "yoga",
    status: "completed",
    actual_type: "yoga",
    completed_at: new Date().toISOString(),
    duration_seconds: 960,
    yoga_video_id: yogaVideo?.id,
  });

  // Re-query and recompute
  const { data: sessionsRes2 } = await supabase
    .from("sessions")
    .select("local_date, status, actual_type")
    .eq("user_id", TEST_USER_ID)
    .order("local_date", { ascending: false })
    .limit(500);

  const completedSessions2 = (sessionsRes2 ?? [])
    .filter((s) => s.status === "completed")
    .map((s) => ({ local_date: s.local_date, actual_type: s.actual_type }));

  const dayRecords2 = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions: completedSessions2,
    today: tomorrowStr,
  });

  const streaks2 = computeStreaks(dayRecords2, tomorrowStr);

  console.log(`  After adding yoga tomorrow:`);
  console.log(`    Days trained: ${streaks2.totalSessions} (was ${streaks.totalSessions})`);
  console.log(`    Current streak: ${streaks2.current} (was ${streaks.current})`);

  check(
    "Adding yoga on new day increases days trained",
    streaks2.totalSessions > streaks.totalSessions,
    streaks2.totalSessions,
    `> ${streaks.totalSessions}`
  );

  console.log("\n=== SUCCESS: All yoga streak tests passed ===\n");
}

main().catch((err) => {
  console.error("\n✗ Test failed with error:", err);
  process.exit(1);
});
