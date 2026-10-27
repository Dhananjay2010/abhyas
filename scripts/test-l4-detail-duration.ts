#!/usr/bin/env tsx
/**
 * Test L-4 detail page: Duration computed from chronologically latest set.
 *
 * On a multi-exercise session (e.g. 5/5/2/2 Full Body), the detail page must
 * use the chronologically latest set completion time, not the highest set_number.
 *
 * Verifies that the detail page and list page show the same duration.
 *
 * Chain: L-4 detail page duration verification
 *   npx tsx scripts/test-l4-detail-duration.ts
 */

import { buildHistoryListItems } from "../src/lib/history/build-history-list-items";
import { findLatestSetCompletion } from "../src/lib/history/find-latest-set-completion";
import { computeSessionDuration } from "../src/lib/history/compute-duration";
import type { RawSessionForList } from "../src/lib/history/build-history-list-items";
import type { RawSessionExercise } from "../src/lib/history/build-session-summaries";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nL-4: Detail page duration with 5/5/2/2 set pattern (l4-detail-duration)");

// Session with 4 exercises, set counts: 5, 5, 2, 2
// The 5th set of exercise 1 is completed at 08:05:00
// But the 2nd set of exercise 4 is completed at 08:17:00 (latest chronologically)
const sessions: RawSessionForList[] = [
  {
    id: "session1",
    local_date: "2025-01-10",
    status: "completed",
    actual_type: "weights",
    duration_seconds: null, // NULL - must compute from sets
    started_at: "2025-01-10T08:00:00Z",
    completed_at: "2025-01-10T08:17:00Z",
    is_deload: false,
    program_days: { label: "Full Body" },
    breathing_logs: null,
    breathing_patterns: null,
  },
];

const exercises: RawSessionExercise[] = [
  { id: "ex1", session_id: "session1", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
  { id: "ex2", session_id: "session1", exercise_id: "bench", status: "completed", metric: "reps", planned_sets: 5 },
  { id: "ex3", session_id: "session1", exercise_id: "row", status: "completed", metric: "reps", planned_sets: 2 },
  { id: "ex4", session_id: "session1", exercise_id: "ohp", status: "completed", metric: "reps", planned_sets: 2 },
];

// Sets with set_number 1-5 for ex1, 1-5 for ex2, 1-2 for ex3, 1-2 for ex4
// But chronologically: ex4's set 2 is the last completed (08:17:00)
const sets = [
  // Squat - 5 sets completed 08:01 - 08:05
  { session_exercise_id: "ex1", set_number: 1, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:01:00Z", logged_at: null },
  { session_exercise_id: "ex1", set_number: 2, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:02:00Z", logged_at: null },
  { session_exercise_id: "ex1", set_number: 3, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:03:00Z", logged_at: null },
  { session_exercise_id: "ex1", set_number: 4, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:04:00Z", logged_at: null },
  { session_exercise_id: "ex1", set_number: 5, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:05:00Z", logged_at: null },
  // Bench - 5 sets completed 08:06 - 08:10
  { session_exercise_id: "ex2", set_number: 1, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:06:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 2, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:07:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 3, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:08:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 4, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:09:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 5, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:10:00Z", logged_at: null },
  // Row - 2 sets completed 08:11 - 08:12
  { session_exercise_id: "ex3", set_number: 1, reps: 10, weight_kg: 70, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:11:00Z", logged_at: null },
  { session_exercise_id: "ex3", set_number: 2, reps: 10, weight_kg: 70, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:12:00Z", logged_at: null },
  // OHP - 2 sets completed 08:16 - 08:17 (LATEST CHRONOLOGICALLY)
  { session_exercise_id: "ex4", set_number: 1, reps: 10, weight_kg: 50, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:16:00Z", logged_at: null },
  { session_exercise_id: "ex4", set_number: 2, reps: 10, weight_kg: 50, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:17:00Z", logged_at: null },
];

// Test 1: findLatestSetCompletion helper
const latestSet = findLatestSetCompletion(sets);
check("Latest set is OHP set 2", latestSet === "2025-01-10T08:17:00Z", `got ${latestSet}`);

// Test 2: Detail page logic (direct call to helper + computeSessionDuration)
const detailDuration = computeSessionDuration(
  sessions[0].duration_seconds,
  sessions[0].started_at,
  latestSet
);
check("Detail duration computed", detailDuration !== null, `got ${detailDuration}`);
check("Detail duration is 17 min (1020s)", detailDuration === 1020, `got ${detailDuration}s = ${detailDuration ? Math.round(detailDuration / 60) : null} min`);

// Test 3: List page logic (through buildHistoryListItems)
const setCountsBySession = new Map([["session1", 14]]);
const sessionsWithPRs = new Set<string>();
const pickTopSet = () => 100;

const items = buildHistoryListItems(
  sessions,
  exercises,
  sets,
  [],
  setCountsBySession,
  sessionsWithPRs,
  pickTopSet
);

check("Built 1 list item", items.length === 1);
const item = items[0];
check("List duration is 17 min (1020s)", item.durationSeconds === 1020, `got ${item.durationSeconds}s = ${item.durationSeconds ? Math.round(item.durationSeconds / 60) : null} min`);

// Test 4: List and detail agree
check("List and detail show same duration", item.durationSeconds === detailDuration, `list: ${item.durationSeconds}, detail: ${detailDuration}`);

if (failures > 0) {
  console.log(`\n❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("\n✨ All L-4 detail page duration tests passed!");
