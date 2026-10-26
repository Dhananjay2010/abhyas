#!/usr/bin/env tsx
/**
 * Test: Exercise history PR detection with real getExerciseHistory
 *
 * Tests the per-session PR detection logic in getExerciseHistory with a fake
 * SupabaseClient. Verifies that:
 * - Identical repeats don't fire false PRs (strict > not >=)
 * - Tiny improvements (40.01 vs 40.00) are correctly detected
 * - reps=1 special case works
 *
 * Run: npm run test:exercise-history-pr-detection
 */

import { getExerciseHistory } from "../src/lib/exercise-history/queries";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type HistoryRow = {
  session_exercise_id: string;
  session_id: string;
  local_date: string;
  metric: string;
  completed_at: string;
};

type SetRow = {
  session_exercise_id: string;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
};

/* eslint-disable @typescript-eslint/no-unused-vars */
function createFakeClient(historyRows: HistoryRow[], setRows: SetRow[]): SupabaseClient<Database> {
  type HistorySelectChain = {
    eq: (col: string, val: unknown) => HistorySelectChain | HistoryCountChain;
    order: (col: string, opts?: unknown) => HistorySelectChain;
    range: (start: number, end: number) => Promise<{ data: typeof historyRows; error: null }>;
    limit: (n: number) => Promise<{ data: typeof historyRows; error: null }>;
    maybeSingle: () => Promise<{ data: typeof historyRows[number] | null; error: null }>;
  };
  
  type HistoryCountChain = {
    eq: (col: string, val: unknown) => Promise<{ count: number; error: null }>;
  };
  
  type SetOrderChain = {
    order: (col: string, opts?: unknown) => SetOrderChain;
    range: (start: number, end: number) => Promise<{ data: typeof setRows; error: null }>;
  };

  const client = {
    from: (table: string) => {
      if (table === "exercise_history") {
        return {
          select: (columns: string, options?: unknown) => {
            const isCountQuery = (options as { count?: string; head?: boolean } | undefined)?.count === "exact" 
                              && (options as { count?: string; head?: boolean } | undefined)?.head === true;
            
            const selectChain: HistorySelectChain = {
              eq: function(_col: string, _val: unknown) {
                if (isCountQuery) {
                  const countChain: HistoryCountChain = {
                    eq: function(_col2: string, _val2: unknown) {
                      return Promise.resolve({ count: historyRows.length, error: null });
                    },
                  };
                  return countChain;
                }
                return selectChain;
              },
              order: function(_col: string, _opts?: unknown) {
                return selectChain;
              },
              range: function(_start: number, _end: number) {
                return Promise.resolve({ data: historyRows, error: null });
              },
              limit: function(n: number) {
                return Promise.resolve({ data: historyRows.slice(0, n), error: null });
              },
              maybeSingle: function() {
                return Promise.resolve({ data: historyRows[0] || null, error: null });
              },
            };
            
            return selectChain;
          },
        };
      } else if (table === "session_sets") {
        return {
          select: (_columns: string) => {
            return {
              in: (_col: string, vals: unknown[]) => {
                return {
                  eq: (_col: string, _val: unknown) => {
                    const orderChain: SetOrderChain = {
                      order: function(_col: string, _opts?: unknown) {
                        return orderChain;
                      },
                      range: function(_start: number, _end: number) {
                        const filtered = setRows.filter(s =>
                          (vals as string[]).includes(s.session_exercise_id)
                        );
                        return Promise.resolve({ data: filtered, error: null });
                      },
                    };
                    return orderChain;
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  return client;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

console.log("\nTest: Exercise history PR detection (strict > not >=)\n");

async function main() {
  const userId = "test-user";
  const exerciseId = "test-exercise";

  console.log("Case (a): Session A 40×10, then B 40×10 → B has NO PRs");
  {
    const historyRows: HistoryRow[] = [
      {
        session_exercise_id: "se-1",
        session_id: "s-1",
        local_date: "2026-10-01",
        metric: "reps",
        completed_at: "2026-10-01T10:00:00Z",
      },
      {
        session_exercise_id: "se-2",
        session_id: "s-2",
        local_date: "2026-10-02",
        metric: "reps",
        completed_at: "2026-10-02T10:00:00Z",
      },
    ];

    const setRows: SetRow[] = [
      // Session A: 3×10@40kg
      { session_exercise_id: "se-1", reps: 10, weight_kg: 40, duration_seconds: null },
      { session_exercise_id: "se-1", reps: 10, weight_kg: 40, duration_seconds: null },
      { session_exercise_id: "se-1", reps: 10, weight_kg: 40, duration_seconds: null },
      // Session B: identical 3×10@40kg
      { session_exercise_id: "se-2", reps: 10, weight_kg: 40, duration_seconds: null },
      { session_exercise_id: "se-2", reps: 10, weight_kg: 40, duration_seconds: null },
      { session_exercise_id: "se-2", reps: 10, weight_kg: 40, duration_seconds: null },
    ];

    const client = createFakeClient(historyRows, setRows);
    const history = await getExerciseHistory(client, userId, exerciseId, { limit: 10, offset: 0 });

    const sessionB = history.sessions.find(s => s.sessionId === "s-2");
    check("Case (a): Session B exists", !!sessionB);
    check("Case (a): Session B has NO best_e1rm PR", !(sessionB?.prs.some(pr => pr.type === "best_e1rm") ?? false), 
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
    check("Case (a): Session B has NO heaviest_weight PR", !(sessionB?.prs.some(pr => pr.type === "heaviest_weight") ?? false),
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
  }

  console.log("\nCase (b): A 40×10, then B 40.01×10 → B HAS both PRs");
  {
    const historyRows: HistoryRow[] = [
      {
        session_exercise_id: "se-1",
        session_id: "s-1",
        local_date: "2026-10-01",
        metric: "reps",
        completed_at: "2026-10-01T10:00:00Z",
      },
      {
        session_exercise_id: "se-2",
        session_id: "s-2",
        local_date: "2026-10-02",
        metric: "reps",
        completed_at: "2026-10-02T10:00:00Z",
      },
    ];

    const setRows: SetRow[] = [
      // Session A: 3×10@40kg
      { session_exercise_id: "se-1", reps: 10, weight_kg: 40, duration_seconds: null },
      { session_exercise_id: "se-1", reps: 10, weight_kg: 40, duration_seconds: null },
      { session_exercise_id: "se-1", reps: 10, weight_kg: 40, duration_seconds: null },
      // Session B: 3×10@40.01kg
      { session_exercise_id: "se-2", reps: 10, weight_kg: 40.01, duration_seconds: null },
      { session_exercise_id: "se-2", reps: 10, weight_kg: 40.01, duration_seconds: null },
      { session_exercise_id: "se-2", reps: 10, weight_kg: 40.01, duration_seconds: null },
    ];

    const client = createFakeClient(historyRows, setRows);
    const history = await getExerciseHistory(client, userId, exerciseId, { limit: 10, offset: 0 });

    const sessionB = history.sessions.find(s => s.sessionId === "s-2");
    check("Case (b): Session B exists", !!sessionB);
    check("Case (b): Session B HAS best_e1rm PR", sessionB?.prs.some(pr => pr.type === "best_e1rm") ?? false,
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
    check("Case (b): Session B HAS heaviest_weight PR", sessionB?.prs.some(pr => pr.type === "heaviest_weight") ?? false,
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
  }

  console.log("\nCase (c): A 100×1, then B 100×1 → no PR (reps=1 path)");
  {
    const historyRows: HistoryRow[] = [
      {
        session_exercise_id: "se-1",
        session_id: "s-1",
        local_date: "2026-10-01",
        metric: "reps",
        completed_at: "2026-10-01T10:00:00Z",
      },
      {
        session_exercise_id: "se-2",
        session_id: "s-2",
        local_date: "2026-10-02",
        metric: "reps",
        completed_at: "2026-10-02T10:00:00Z",
      },
    ];

    const setRows: SetRow[] = [
      // Session A: 1×1@100kg
      { session_exercise_id: "se-1", reps: 1, weight_kg: 100, duration_seconds: null },
      // Session B: identical 1×1@100kg
      { session_exercise_id: "se-2", reps: 1, weight_kg: 100, duration_seconds: null },
    ];

    const client = createFakeClient(historyRows, setRows);
    const history = await getExerciseHistory(client, userId, exerciseId, { limit: 10, offset: 0 });

    const sessionB = history.sessions.find(s => s.sessionId === "s-2");
    check("Case (c): Session B exists", !!sessionB);
    check("Case (c): Session B has NO best_e1rm PR", !(sessionB?.prs.some(pr => pr.type === "best_e1rm") ?? false),
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
    check("Case (c): Session B has NO heaviest_weight PR", !(sessionB?.prs.some(pr => pr.type === "heaviest_weight") ?? false),
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
  }

  console.log("\nCase (d): A 60×10, then B 60.02×10 → B HAS e1RM PR (MED-1: 0.1 kg rounding would miss)");
  {
    // 60×10: e1RM = 60 * 40 / 30 = 80.00
    // 60.02×10: e1RM = 60.02 * 40 / 30 = 80.0266... → 80.03
    // With 0.1 kg rounding: both round to 80.0, so no PR (WRONG)
    // With 2 dp rounding: 80.00 vs 80.03, so PR (CORRECT)
    const historyRows: HistoryRow[] = [
      {
        session_exercise_id: "se-1",
        session_id: "s-1",
        local_date: "2026-10-01",
        metric: "reps",
        completed_at: "2026-10-01T10:00:00Z",
      },
      {
        session_exercise_id: "se-2",
        session_id: "s-2",
        local_date: "2026-10-02",
        metric: "reps",
        completed_at: "2026-10-02T10:00:00Z",
      },
    ];

    const setRows: SetRow[] = [
      // Session A: 3×10@60kg
      { session_exercise_id: "se-1", reps: 10, weight_kg: 60, duration_seconds: null },
      { session_exercise_id: "se-1", reps: 10, weight_kg: 60, duration_seconds: null },
      { session_exercise_id: "se-1", reps: 10, weight_kg: 60, duration_seconds: null },
      // Session B: 3×10@60.02kg (tiny improvement)
      { session_exercise_id: "se-2", reps: 10, weight_kg: 60.02, duration_seconds: null },
      { session_exercise_id: "se-2", reps: 10, weight_kg: 60.02, duration_seconds: null },
      { session_exercise_id: "se-2", reps: 10, weight_kg: 60.02, duration_seconds: null },
    ];

    const client = createFakeClient(historyRows, setRows);
    const history = await getExerciseHistory(client, userId, exerciseId, { limit: 10, offset: 0 });

    const sessionB = history.sessions.find(s => s.sessionId === "s-2");
    check("Case (d): Session B exists", !!sessionB);
    check("Case (d): Session B HAS best_e1rm PR", sessionB?.prs.some(pr => pr.type === "best_e1rm") ?? false,
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
    // Weight also improved (60.02 > 60.00)
    check("Case (d): Session B HAS heaviest_weight PR", sessionB?.prs.some(pr => pr.type === "heaviest_weight") ?? false,
      `found ${sessionB?.prs.map(pr => pr.type).join(", ") || "none"}`);
  }

  if (failures === 0) {
    console.log("\n✓ All PR detection tests passed");
    process.exit(0);
  } else {
    console.log(`\n✗ ${failures} test(s) failed`);
    process.exit(1);
  }
}

main();
