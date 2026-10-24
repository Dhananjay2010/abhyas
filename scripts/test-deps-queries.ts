#!/usr/bin/env tsx
/**
 * Test g1-g4: each deps module query has the correct filters.
 *
 * g1: finish-session-deps updateSession has .eq("status", "in_progress")
 * g2: finish-exercise-deps updateExercise has .not("status", "in", "(completed,skipped)")
 * g3: abandon-session-deps updateSession has .eq("status", "in_progress")
 * g4: close-stale-deps loadSessions and loadExercises (not testing here, PR #111 owns it)
 *
 *   npx tsx scripts/test-deps-queries.ts
 */

import { makeFinishSessionDeps } from "../src/lib/session/finish-session-deps";
import { makeFinishExerciseDeps } from "../src/lib/session/finish-exercise-deps";
import { makeAbandonSessionDeps } from "../src/lib/session/abandon-session-deps";
import type { SupabaseClient } from "@supabase/supabase-js";

let passed = 0;
let failed = 0;


function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

type QueryCall = {
  table: string;
  method: string;
  args: unknown[];
};

function makeFakeSupabase() {
  const calls: QueryCall[] = [];
  let chainedTable: string | null = null;
  let selectFields: string | null = null;

  const chainMethods = {
    select(fields: string) {
      selectFields = fields;
      calls.push({ table: chainedTable!, method: "select", args: [fields] });
      return chainMethods;
    },
    eq(column: string, value: unknown) {
      calls.push({ table: chainedTable!, method: "eq", args: [column, value] });
      return chainMethods;
    },
    not(column: string, operator: string, value: string) {
      calls.push({ table: chainedTable!, method: "not", args: [column, operator, value] });
      return chainMethods;
    },
    update(patch: unknown, options?: unknown) {
      calls.push({ table: chainedTable!, method: "update", args: options ? [patch, options] : [patch] });
      return chainMethods;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
  };

  const supabase = {
    from(table: string) {
      chainedTable = table;
      calls.push({ table, method: "from", args: [table] });
      return chainMethods;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as unknown as SupabaseClient<any>, calls };
}

console.log("\nTesting deps module query filters\n");

// Test g1: finish-session-deps updateSession has .eq("status", "in_progress")
console.log("g1. finish-session-deps updateSession filters by status=in_progress");
{
  const { supabase, calls } = makeFakeSupabase();
  const deps = makeFinishSessionDeps(supabase);

  (async () => {
    await deps.updateSession("session-1", {
      status: "completed",
      completed_at: "2026-10-24T15:00:00Z",
      duration_seconds: 3600,
    });

    const updateCall = calls.find((c) => c.method === "update");
    assertTrue(updateCall !== undefined, "update() called");

    const eqStatusCall = calls.find(
      (c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "in_progress"
    );
    assertTrue(eqStatusCall !== undefined, "finish-session-deps updateSession has .eq('status', 'in_progress')");
  })();
}

// Test g2: finish-exercise-deps updateExercise has .not("status", "in", "(completed,skipped)")
console.log("\ng2. finish-exercise-deps updateExercise filters by status not in (completed,skipped)");
{
  const { supabase, calls } = makeFakeSupabase();
  const deps = makeFinishExerciseDeps(supabase, async () => null);

  (async () => {
    await deps.updateExercise("exercise-1", {
      status: "completed",
      feel: "hard",
      completed_at: "2026-10-24T15:05:00Z",
    });

    const updateCall = calls.find((c) => c.method === "update");
    assertTrue(updateCall !== undefined, "update() called");

    const notStatusCall = calls.find(
      (c) =>
        c.method === "not" &&
        c.args[0] === "status" &&
        c.args[1] === "in" &&
        c.args[2] === "(completed,skipped)"
    );
    assertTrue(notStatusCall !== undefined, "finish-exercise-deps updateExercise has .not('status', 'in', '(completed,skipped)')");
  })();
}

// Test g3: abandon-session-deps updateSession has .eq("status", "in_progress")
console.log("\ng3. abandon-session-deps updateSession filters by status=in_progress");
{
  const { supabase, calls } = makeFakeSupabase();
  const deps = makeAbandonSessionDeps(supabase);

  (async () => {
    await deps.updateSession("session-2", {
      status: "skipped",
      completed_at: null,
      duration_seconds: 120,
    });

    const updateCall = calls.find((c) => c.method === "update");
    assertTrue(updateCall !== undefined, "update() called");

    const eqStatusCall = calls.find(
      (c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "in_progress"
    );
    assertTrue(eqStatusCall !== undefined, "abandon-session-deps updateSession has .eq('status', 'in_progress')");
  })();
}

// Give async tests time to complete
setTimeout(() => {
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All deps-queries tests passed!");
}, 100);
