#!/usr/bin/env tsx
/**
 * Test L-4: Legacy row duration fallback consistency between list and detail.
 *
 * Validates that both the History list and detail pages compute duration from
 * timestamps when duration_seconds is NULL (legacy rows).
 *
 * Chain 341:
 *   npx tsx scripts/test-legacy-duration-fallback.ts
 */

import { buildHistoryListItems } from "../src/lib/history/build-history-list-items";
import { computeSessionDuration } from "../src/lib/history/compute-duration";
import type { RawSessionForList } from "../src/lib/history/build-history-list-items";
import type { RawSessionExercise } from "../src/lib/history/build-session-summaries";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// L-4: Legacy row with NULL duration shows computed duration, not "—"
console.log("\nL-4: Legacy duration fallback (legacy-duration)");
{
  const startedAt = "2025-01-10T08:00:00Z";
  const lastSetCompletedAt = "2025-01-10T08:08:00Z"; // 8 min later

  // Test computeSessionDuration directly (used by detail page)
  const detailDuration = computeSessionDuration(null, startedAt, lastSetCompletedAt);
  const expectedSeconds = 8 * 60;
  check("Detail page computes duration from timestamps", detailDuration === expectedSeconds, `got ${detailDuration}, expected ${expectedSeconds}`);

  // Test buildHistoryListItems (used by list page)
  const sessions: RawSessionForList[] = [
    {
      id: "session1",
      local_date: "2025-01-10",
      status: "completed",
      actual_type: "weights",
      duration_seconds: null, // Legacy row with no stored duration
      started_at: startedAt,
      completed_at: lastSetCompletedAt,
      is_deload: false,
      program_days: { label: "Day A" },
      breathing_logs: null,
      breathing_patterns: null,
    },
  ];

  const exercises: RawSessionExercise[] = [
    {
      id: "ex1",
      session_id: "session1",
      planned_sets: 3,
      order_index: 0,
    },
  ];

  const sets = [
    {
      session_exercise_id: "ex1",
      reps: 10,
      weight_kg: 100,
      duration_seconds: null,
      is_warmup_set: false,
      completed_at: lastSetCompletedAt,
    },
  ];

  const setCountsBySession = new Map([["session1", 1]]);
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

  check("Built 1 item", items.length === 1);
  const item = items[0];
  check("List page computes duration from timestamps", item.durationSeconds === expectedSeconds, `got ${item.durationSeconds}, expected ${expectedSeconds}`);
  check("List and detail match", detailDuration === item.durationSeconds);
}

if (failures > 0) {
  console.log(`\n❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("\n✨ All L-4 legacy duration fallback tests passed!");
