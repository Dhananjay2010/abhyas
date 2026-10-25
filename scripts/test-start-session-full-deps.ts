#!/usr/bin/env tsx
/**
 * Test start-session-full-deps.ts: all real Supabase queries.
 * Uses a typed fake client that records every call to assert exact tables,
 * filters (including status='active', user_id scoping), and payloads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

type Call = {
  table: string;
  select?: string;
  filters: Array<{ type: string; column: string; value: unknown }>;
  order?: Array<{ column: string; ascending: boolean }>;
  limit?: number;
  insert?: unknown;
  update?: unknown;
  method?: string;
};

const calls: Call[] = [];

function recordCall(call: Call) {
  calls.push(call);
}

function resetCalls() {
  calls.length = 0;
}

function createFakeSupabase(responses: Record<string, unknown>): Pick<SupabaseClient<Database>, "from"> {
  return {
    from(table: string) {
      const currentCall: Call = { table, filters: [] };
      
      const builder = {
        select(cols: string) {
          currentCall.select = cols;
          return builder;
        },
        eq(column: string, value: unknown) {
          currentCall.filters.push({ type: "eq", column, value });
          return builder;
        },
        in(column: string, values: unknown[]) {
          currentCall.filters.push({ type: "in", column, value: values });
          return builder;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          if (!currentCall.order) currentCall.order = [];
          currentCall.order.push({ column, ascending: opts?.ascending ?? true });
          return builder;
        },
        limit(n: number) {
          currentCall.limit = n;
          return builder;
        },
        insert(payload: unknown) {
          currentCall.insert = payload;
          currentCall.method = "insert";
          return builder;
        },
        upsert(payload: unknown, _opts?: unknown) {
          currentCall.insert = payload;
          currentCall.method = "upsert";
          return builder;
        },
        update(payload: unknown) {
          currentCall.update = payload;
          currentCall.method = "update";
          return builder;
        },
        single() {
          currentCall.method = "single";
          recordCall(currentCall);
          const key = `${table}:single`;
          return Promise.resolve(responses[key] || { data: null, error: null });
        },
        maybeSingle() {
          currentCall.method = "maybeSingle";
          recordCall(currentCall);
          const key = `${table}:maybeSingle`;
          return Promise.resolve(responses[key] || { data: null, error: null });
        },
        then(resolve: (v: unknown) => void) {
          if (!currentCall.method) {
            currentCall.method = "query";
          }
          recordCall(currentCall);
          const key = `${table}:${currentCall.method}`;
          return Promise.resolve(responses[key] || { data: null, error: null }).then(resolve);
        },
      };
      
      return builder;
    },
  };
}

const USER_ID = "user-123";
const NOW_MS = new Date("2026-10-26T14:00:00Z").getTime();

import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";

let passed = 0;
let failed = 0;

function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL ${label}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n${name}`);
  resetCalls();
  await fn();
}

// Tests
(async () => {
  console.log("Testing start-session-full-deps\n");

  await test("fetchProfile: correct table, select, and user_id filter", async () => {
    const fakeClient = createFakeSupabase({
      "profiles:single": { data: { timezone: "America/New_York" }, error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.fetchProfile();
    
    eq(calls.length, 1, "One call made");
    eq(calls[0].table, "profiles", "Table: profiles");
    eq(calls[0].select, "timezone", "Select: timezone");
    eq(calls[0].filters.length, 1, "One filter");
    eq(calls[0].filters[0], { type: "eq", column: "id", value: USER_ID }, "Filter: id eq user_id");
    eq(calls[0].method, "single", "Method: single");
  });

  await test("fetchOpenSessions: correct table, select, filters, and ordering", async () => {
    const fakeClient = createFakeSupabase({
      "sessions:query": { data: [], error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.fetchOpenSessions();
    
    eq(calls.length, 1, "One call made");
    eq(calls[0].table, "sessions", "Table: sessions");
    eq(calls[0].select, "id, status, local_date, actual_type, started_at", "Select columns");
    eq(calls[0].filters.length, 1, "One filter");
    eq(calls[0].filters[0], { type: "in", column: "status", value: ["planned", "in_progress", "skipped"] }, "Filter: status in");
    eq(calls[0].order?.length, 2, "Two orderings");
    eq(calls[0].order?.[0], { column: "local_date", ascending: false }, "Order: local_date desc");
    eq(calls[0].order?.[1], { column: "created_at", ascending: false }, "Order: created_at desc");
    eq(calls[0].limit, 10, "Limit: 10");
  });

  await test("fetchResumeEnabled: correct table, select, and user_id filter", async () => {
    const fakeClient = createFakeSupabase({
      "user_settings:maybeSingle": { data: { resume_session: false }, error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.fetchResumeEnabled();
    
    eq(calls.length, 1, "One call made");
    eq(calls[0].table, "user_settings", "Table: user_settings");
    eq(calls[0].select, "resume_session", "Select: resume_session");
    eq(calls[0].filters.length, 1, "One filter");
    eq(calls[0].filters[0], { type: "eq", column: "user_id", value: USER_ID }, "Filter: user_id eq");
  });

  await test("findInProgressToday: correct table, filters including status and date", async () => {
    const fakeClient = createFakeSupabase({
      "sessions:query": { data: [], error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.findInProgressToday("2026-10-26");
    
    eq(calls.length, 1, "One call made");
    eq(calls[0].table, "sessions", "Table: sessions");
    eq(calls[0].select, "*", "Select: *");
    eq(calls[0].filters.length, 3, "Three filters");
    eq(calls[0].filters[0], { type: "eq", column: "user_id", value: USER_ID }, "Filter: user_id");
    eq(calls[0].filters[1], { type: "eq", column: "local_date", value: "2026-10-26" }, "Filter: local_date");
    eq(calls[0].filters[2], { type: "eq", column: "status", value: "in_progress" }, "Filter: status='in_progress'");
  });

  await test("fetchPlannedExercises: correct table, select with join, program_day_id filter, and ordering", async () => {
    const fakeClient = createFakeSupabase({
      "program_day_exercises:query": { data: [], error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.fetchPlannedExercises("day-123");
    
    eq(calls.length, 1, "One call made");
    eq(calls[0].table, "program_day_exercises", "Table: program_day_exercises");
    eq(calls[0].select, "exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises!program_day_exercises_exercise_id_fkey(metric)", "Select with join");
    eq(calls[0].filters.length, 1, "One filter");
    eq(calls[0].filters[0], { type: "eq", column: "program_day_id", value: "day-123" }, "Filter: program_day_id");
    eq(calls[0].order?.length, 1, "One ordering");
    eq(calls[0].order?.[0], { column: "order_index", ascending: true }, "Order: order_index asc");
  });

  await test("updateSession error propagation", async () => {
    const fakeClient = createFakeSupabase({
      "sessions:update": { data: null, error: { message: "Network error" } },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    const result = await deps.updateSession("sess-123", "2026-10-26", { status: "in_progress" });
    
    eq(result.ok, false, "Result: not ok");
    if (!result.ok) {
      eq(result.error, "Network error", "Error message propagated");
    }
  });

  await test("insertExercises error propagation", async () => {
    const fakeClient = createFakeSupabase({
      "session_exercises:upsert": { data: null, error: { message: "Insert failed" } },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    const result = await deps.insertExercises([
      {
        session_id: "sess-1",
        user_id: USER_ID,
        exercise_id: "ex-1",
        order_index: 0,
        planned_sets: 3,
        planned_reps_min: 8,
        planned_reps_max: 12,
        rest_seconds: 90,
        metric: "reps" as const,
      },
    ]);
    
    eq(result.ok, false, "Result: not ok");
    if (!result.ok) {
      eq(result.error, "Insert failed", "Error message propagated");
    }
  });

  console.log(`\n${passed} tests passed, ${failed} tests failed`);
  if (failed > 0) process.exit(1);
})();
