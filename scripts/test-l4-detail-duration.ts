#!/usr/bin/env tsx
/**
 * Test L-4 detail page: Duration computed from chronologically latest set.
 *
 * On a multi-exercise session (e.g. 5/5/2/2 Full Body), the detail page must
 * use the chronologically latest set completion time, not the highest set_number.
 *
 * Sets are ordered by set_number as the database query returns them (not by time),
 * ensuring the function correctly finds the latest chronologically.
 *
 * Verifies that the detail page and list page show the same duration.
 *
 * Chain: L-4 detail page duration verification
 *   npx tsx scripts/test-l4-detail-duration.ts
 */

import { buildHistoryListItems } from "../src/lib/history/build-history-list-items";
import { computeDetailDuration } from "../src/lib/history/compute-detail-duration";
import type { RawSessionForList } from "../src/lib/history/build-history-list-items";
import type { RawSessionExercise } from "../src/lib/history/build-session-summaries";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nL-4: Detail page duration with 5/5/2/2 set pattern (l4-detail-duration)");

// Session with 4 exercises, set counts: 5, 5, 2, 2
// User completed exercises in order: Squat (5 sets), Bench (5 sets), Row (2 sets), OHP (2 sets)
// OHP set 2 (the LAST chronologically) was completed at 08:17:00
// But the database query `ORDER BY set_number` returns sets grouped by set number first,
// so Bench set 5 and Squat set 5 (completed earlier) appear AFTER OHP set 2 in the result
const session = {
  id: "session1",
  local_date: "2025-01-10",
  status: "completed" as const,
  actual_type: "weights" as const,
  duration_seconds: null, // NULL - must compute from sets
  started_at: "2025-01-10T08:00:00Z",
  completed_at: "2025-01-10T08:17:00Z",
  is_deload: false,
  program_days: { label: "Full Body" },
  breathing_logs: null,
  breathing_patterns: null,
};

const sessions: RawSessionForList[] = [session];

const exercises: RawSessionExercise[] = [
  { id: "ex1", session_id: "session1", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
  { id: "ex2", session_id: "session1", exercise_id: "bench", status: "completed", metric: "reps", planned_sets: 5 },
  { id: "ex3", session_id: "session1", exercise_id: "row", status: "completed", metric: "reps", planned_sets: 2 },
  { id: "ex4", session_id: "session1", exercise_id: "ohp", status: "completed", metric: "reps", planned_sets: 2 },
];

// Sets ORDERED BY set_number (as database returns them), NOT by completion time
// Critical: The database orders ALL sets by set_number globally, so:
// - All set 1s come first (across all exercises)
// - All set 2s come next
// - etc.
// The LAST element in this array is Bench set 5 (completed at 08:10)
// But OHP set 2 (completed at 08:17) is the LATEST chronologically and appears earlier in the array
const setsOrderedBySetNumber = [
  // Set number 1: all exercises
  { session_exercise_id: "ex1", set_number: 1, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:01:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 1, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:06:00Z", logged_at: null },
  { session_exercise_id: "ex3", set_number: 1, reps: 10, weight_kg: 70, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:11:00Z", logged_at: null },
  { session_exercise_id: "ex4", set_number: 1, reps: 10, weight_kg: 50, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:16:00Z", logged_at: null },
  // Set number 2: all exercises
  { session_exercise_id: "ex1", set_number: 2, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:02:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 2, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:07:00Z", logged_at: null },
  { session_exercise_id: "ex3", set_number: 2, reps: 10, weight_kg: 70, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:12:00Z", logged_at: null },
  // OHP set 2 is the LATEST chronologically (08:17) but appears here, NOT at the end
  { session_exercise_id: "ex4", set_number: 2, reps: 10, weight_kg: 50, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:17:00Z", logged_at: null },
  // Set number 3: only ex1, ex2
  { session_exercise_id: "ex1", set_number: 3, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:03:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 3, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:08:00Z", logged_at: null },
  // Set number 4: only ex1, ex2
  { session_exercise_id: "ex1", set_number: 4, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:04:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 4, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:09:00Z", logged_at: null },
  // Set number 5: only ex1, ex2 (LAST in array, completed at 08:10, NOT the latest)
  { session_exercise_id: "ex1", set_number: 5, reps: 10, weight_kg: 100, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:05:00Z", logged_at: null },
  { session_exercise_id: "ex2", set_number: 5, reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false, completed_at: "2025-01-10T08:10:00Z", logged_at: null },
];

// Verify assumption: last element is NOT the latest chronologically
const lastElement = setsOrderedBySetNumber[setsOrderedBySetNumber.length - 1];
check("Test data setup: last element completed at 08:10", lastElement.completed_at === "2025-01-10T08:10:00Z", `got ${lastElement.completed_at}`);
check("Test data setup: OHP set 2 completed at 08:17 (latest)", 
  setsOrderedBySetNumber.some(s => s.completed_at === "2025-01-10T08:17:00Z"),
  "OHP set 2 should be in the array"
);

// Test 1: Detail page computation (from the extracted function)
const detailDuration = computeDetailDuration(
  { duration_seconds: session.duration_seconds, started_at: session.started_at },
  setsOrderedBySetNumber
);
check("Detail duration computed", detailDuration !== null, `got ${detailDuration}`);
check("Detail duration is 17 min (1020s)", detailDuration === 1020, `got ${detailDuration}s = ${detailDuration ? Math.round(detailDuration / 60) : null} min`);

// Test 2: List page logic (through buildHistoryListItems)
const setCountsBySession = new Map([["session1", 14]]);
const sessionsWithPRs = new Set<string>();
const pickTopSet = () => 100;

const items = buildHistoryListItems(
  sessions,
  exercises,
  setsOrderedBySetNumber,
  [],
  setCountsBySession,
  sessionsWithPRs,
  pickTopSet
);

check("Built 1 list item", items.length === 1);
const item = items[0];
check("List duration is 17 min (1020s)", item.durationSeconds === 1020, `got ${item.durationSeconds}s = ${item.durationSeconds ? Math.round(item.durationSeconds / 60) : null} min`);

// Test 3: List and detail agree
check("List and detail show same duration", item.durationSeconds === detailDuration, `list: ${item.durationSeconds}, detail: ${detailDuration}`);

if (failures > 0) {
  console.log(`\n❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("\n✨ All L-4 detail page duration tests passed!");
