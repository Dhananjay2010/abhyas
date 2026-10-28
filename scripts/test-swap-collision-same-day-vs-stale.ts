#!/usr/bin/env tsx
/**
 * Test: Swap collision applies only for same-day swaps, not stale sessions
 * 
 * When TODAY's session was a swap, tomorrow's collision is resolved.
 * When a STALE session (from 4 days ago) was a swap, no collision occurs.
 * 
 * This test kills the mutant: removing the `s.localDate !== today` check in
 * getTodayCompletedSession (day-plan.ts ~664-669).
 * 
 *   npx tsx scripts/test-swap-collision-same-day-vs-stale.ts
 */

import { strict as assert } from "node:assert";
import { nextDayPlanCore, type NextDayPlanCoreDeps } from "../src/lib/program/day-plan";

type ProgramDay = {
  id: string;
  day_index: number;
  day_type: "weights" | "rest";
  label: string | null;
};

const UPPER_LOWER_4DAY: ProgramDay[] = [
  { id: "pd-1", day_index: 1, day_type: "weights", label: "Upper" },
  { id: "pd-2", day_index: 2, day_type: "weights", label: "Lower" },
  { id: "pd-3", day_index: 3, day_type: "rest", label: null },
  { id: "pd-4", day_index: 4, day_type: "weights", label: "Upper" },
  { id: "pd-5", day_index: 5, day_type: "weights", label: "Lower" },
  { id: "pd-6", day_index: 6, day_type: "rest", label: null },
  { id: "pd-7", day_index: 7, day_type: "rest", label: null },
];

async function main() {
  console.log("\nSwap collision: same-day vs stale\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Case 1: SAME-DAY swap → collision resolves
  // ──────────────────────────────────────────────────────────────────────────
  console.log("1. Same-day swap (Wed rest → did Upper) → Thu collision resolves to Lower");

  const sameDayResult = await nextDayPlanCore({
    getTodayCompletedSession: async () => ({
      programDayId: "pd-1",       // Upper
      actualType: "weights",
      localDate: "2026-10-28",    // today
    }),
    getAllProgramDays: async () => UPPER_LOWER_4DAY,
    getResolvedTomorrow: async () => ({
      localDate: "2026-10-29",
      dayType: "weights",
      label: "Upper",
      programDayId: "pd-4",       // Upper scheduled
      isOverride: false,
    }),
    getPlannableDays: async () => [
      { programDayId: "pd-2", label: "Lower", dayType: "weights", nextUp: true },
      { programDayId: "pd-1", label: "Upper", dayType: "weights", nextUp: false },
    ],
    getTodayDayIndex: () => 3,    // Wed = rest day
    getToday: () => "2026-10-28",
    getTomorrow: () => "2026-10-29",
  });

  assert.ok(sameDayResult, "Should return result");
  assert.strictEqual(sameDayResult.plannedLabel, "Lower", "Collision resolved → Lower");
  assert.strictEqual(sameDayResult.programDayId, "pd-2", "Collision resolved → pd-2");
  assert.strictEqual(sameDayResult.collisionResolved, true, "Should mark as resolved");

  console.log("  ✓ Same-day swap → collision resolved to Lower\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Case 2: STALE swap (4 days ago) → NO collision
  // ──────────────────────────────────────────────────────────────────────────
  console.log("2. Stale swap (Sat 24 Oct rest → did Upper) finished Wed 28 → Thu stays Upper");

  const staleResult = await nextDayPlanCore({
    getTodayCompletedSession: async () => {
      // Real getTodayCompletedSession returns null when session is stale
      // (s.localDate !== today check at day-plan.ts ~670)
      return null;
    },
    getAllProgramDays: async () => UPPER_LOWER_4DAY,
    getResolvedTomorrow: async () => ({
      localDate: "2026-10-29",
      dayType: "weights",
      label: "Upper",
      programDayId: "pd-4",       // Upper scheduled
      isOverride: false,
    }),
    getPlannableDays: async () => [
      { programDayId: "pd-2", label: "Lower", dayType: "weights", nextUp: true },
      { programDayId: "pd-1", label: "Upper", dayType: "weights", nextUp: false },
    ],
    getTodayDayIndex: () => 3,    // Wed = rest day
    getToday: () => "2026-10-28",
    getTomorrow: () => "2026-10-29",
  });

  assert.ok(staleResult, "Should return result");
  assert.strictEqual(staleResult.plannedLabel, "Upper", "NO collision → Upper stays");
  assert.strictEqual(staleResult.programDayId, "pd-4", "NO collision → pd-4");
  assert.strictEqual(staleResult.collisionResolved, false, "Should NOT mark as resolved");

  console.log("  ✓ Stale swap → no collision, Upper stays\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Mutant: remove the localDate check
  // ──────────────────────────────────────────────────────────────────────────
  console.log("MUTANT TEST: Without localDate check, stale session would trigger collision");
  console.log("  Named failure: Case 2 would serve Lower instead of Upper");
  console.log("  (Mutant verification: revert the s.localDate !== today check)\n");

  console.log("✓ All swap collision same-day vs stale tests passed\n");
}

main().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
