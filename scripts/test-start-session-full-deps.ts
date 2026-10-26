#!/usr/bin/env tsx
/**
 * Test start-session-full-deps.ts: all real Supabase queries.
 * Uses a typed fake client that records every call to assert exact tables,
 * filters (including status='active', user_id scoping), and payloads.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

type Call = {
  method: string;
  table: string;
  params: Record<string, string>;
  body?: unknown;
  prefer?: string | null;
  select?: string;
  filters: Array<{ type: string; column: string; value: unknown }>;
  order?: Array<{ column: string; ascending: boolean }>;
  limit?: number;
  insert?: unknown;
  update?: unknown;
};

const calls: Call[] = [];

function recordCall(call: Call) {
  calls.push(call);
}

function resetCalls() {
  calls.length = 0;
}

function createFakeSupabase(responses: Record<string, unknown>) {
  const stubFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    const prefer = headers.get("prefer");
    const accept = headers.get("accept");
    
    // Parse table from pathname
    const table = url.pathname.replace("/rest/v1/", "").split("?")[0];
    
    // Get all query params
    const params = Object.fromEntries(url.searchParams);
    
    // Parse structured info for backward compat with old assertions
    const select = params.select;
    const filters: Array<{ type: string; column: string; value: unknown }> = [];
    const order: Array<{ column: string; ascending: boolean }> = [];
    let limit: number | undefined;
    
    // Parse filters from params
    for (const [key, value] of Object.entries(params)) {
      if (key === "select" || key === "order" || key === "limit") continue;
      
      if (value.startsWith("eq.")) {
        filters.push({ type: "eq", column: key, value: value.substring(3) });
      } else if (value.startsWith("in.(")) {
        const values = value.substring(4, value.length - 1).split(",");
        filters.push({ type: "in", column: key, value: values });
      }
    }
    
    // Parse order
    if (params.order) {
      const orders = params.order.split(",");
      for (const o of orders) {
        const parts = o.split(".");
        order.push({
          column: parts[0],
          ascending: parts[1] !== "desc",
        });
      }
    }
    
    // Parse limit
    if (params.limit) {
      limit = parseInt(params.limit, 10);
    }
    
    const currentCall: Call = {
      method,
      table,
      params,
      body,
      prefer,
      select,
      filters,
      order: order.length > 0 ? order : undefined,
      limit,
      insert: method === "POST" ? body : undefined,
      update: method === "PATCH" ? body : undefined,
    };
    
    recordCall(currentCall);
    
    // Determine response type
    const isSingle = accept === "application/vnd.pgrst.object+json";
    const isUpsert = prefer?.includes("resolution=");
    const key = `${table}:${isSingle ? "single" : isUpsert ? "upsert" : method === "POST" ? "insert" : method === "PATCH" ? "update" : "query"}`;
    
    const responseObj = responses[key] || { data: null, error: null };
    
    // Handle errors
    if (typeof responseObj === "object" && responseObj !== null && "error" in responseObj && responseObj.error) {
      const err = responseObj.error;
      if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
        return new Response(JSON.stringify(err), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(responseObj.error), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    
    // Return data
    const data = typeof responseObj === "object" && responseObj !== null && "data" in responseObj 
      ? responseObj.data 
      : null;
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
        "content-type": "application/json",
        "content-range": "0-0/1",
      },
    });
  };
  
  return createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });
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
    eq(calls[0].method, "GET", "Method: GET");
  });

  await test("fetchOpenSessions: correct table, select, filters, and ordering", async () => {
    const fakeClient = createFakeSupabase({
      "sessions:query": { data: [], error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.fetchOpenSessions();
    
    eq(calls.length, 1, "One call made");
    eq(calls[0].table, "sessions", "Table: sessions");
    eq(calls[0].select, "id,status,local_date,actual_type,started_at", "Select columns");
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
    eq(calls[0].select, "exercise_id,order_index,target_sets,target_reps_min,target_reps_max,rest_seconds,exercises!program_day_exercises_exercise_id_fkey(metric)", "Select with join");
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

  await test("BUG CATCH: status filter on program_days", async () => {
    resetCalls();
    const fakeClient = createFakeSupabase({
      "programs:query": { 
        data: [{ 
          id: "prog-1", 
          started_on: "2026-10-01", 
          deload_week: 4, 
          week_offset: 0,
          program_days: [{ id: "day-1", day_index: 0, day_type: "weights", status: "active" }]
        }], 
        error: null 
      },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    const result = await deps.loadProgram("prog-1", 0);
    if (!result.ok) throw new Error(`Load failed: ${result.error}`);
    
    const programsCalls = calls.filter(c => c.table === "programs");
    if (programsCalls.length === 0) {
      eq(true, false, "Should query programs");
    } else {
      const statusFilter = programsCalls[0].filters.find(f => f.column === "program_days.status");
      if (!statusFilter) {
        eq(true, false, "Missing status filter on program_days");
      } else {
        eq(statusFilter.value, "active", "Status filter should be 'active'");
      }
    }
  });

  await test("BUG CATCH: resume_session defaults to true", async () => {
    const fakeClient = createFakeSupabase({
      "user_settings:maybeSingle": { data: null, error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    const result = await deps.fetchResumeEnabled();
    
    eq(result, true, "Defaults to true when no setting");
  });

  await test("BUG CATCH: ensureSessionExercises is wired", async () => {
    const fakeClient = createFakeSupabase({
      "sessions:query": { data: [{ 
        program_day_id: "day-1", 
        actual_type: "weights", 
        is_deload: false,
        session_exercises: []
      }], error: null },
      "program_day_exercises:query": { data: [], error: null },
      "session_exercises:upsert": { data: [], error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    resetCalls();
    await deps.ensureSessionExercises("sess-1");
    
    const sessionsCall = calls.find(c => c.table === "sessions" && c.method === "GET");
    const programDayExercisesCall = calls.find(c => c.table === "program_day_exercises" && c.method === "GET");
    eq(sessionsCall !== undefined, true, "queries sessions with session_exercises embed");
    eq(programDayExercisesCall !== undefined, true, "queries program_day_exercises");
  });

  await test("BUG CATCH: started_at passthrough in updateSession", async () => {
    resetCalls();
    const fakeClient = createFakeSupabase({
      "sessions:update": { data: { id: "sess-1" }, error: null },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.updateSession("sess-1", "2026-10-26", {
      status: "in_progress",
      started_at: "2026-10-26T14:00:00Z",
    });
    
    const updateCall = calls.find(c => c.method === "PATCH" && c.update);
    if (!updateCall?.update) throw new Error("No update call");
    const payload = updateCall.update;
    if (typeof payload !== "object" || payload === null || !("started_at" in payload)) {
      throw new Error("update payload missing started_at");
    }
    eq(payload.started_at, "2026-10-26T14:00:00Z", "started_at passed through");
  });

  await test("BUG CATCH: day id returned from loadProgram", async () => {
    const fakeClient = createFakeSupabase({
      "programs:query": { 
        data: [{ 
          id: "prog-1",
          started_on: "2026-10-01",
          deload_week: 4,
          week_offset: 0,
          program_days: [{ id: "day-123", day_index: 0, day_type: "weights" }]
        }], 
        error: null 
      },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    const result = await deps.loadProgram("prog-1", 0);
    
    if (!result.ok) throw new Error("Load failed");
    eq(result.dayId, "day-123", "Day id returned");
  });

  await test("R2: updateSession 23505 re-read uses passed today local_date", async () => {
    resetCalls();
    const fakeClient = createFakeSupabase({
      "sessions:update": { 
        data: null, 
        error: { code: "23505", message: "duplicate" } 
      },
      "sessions:query": { 
        data: [{ id: "sess-other", created_at: "2026-10-26T10:00:00Z" }], 
        error: null 
      },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    await deps.updateSession("sess-1", "2026-10-26", { status: "in_progress" });
    
    const rereadCall = calls.filter(c => c.table === "sessions" && c.method === "GET")[0];
    if (!rereadCall) throw new Error("No 23505 re-read found");
    eq(rereadCall.params.local_date, "eq.2026-10-26", "23505 re-read filters by passed local_date");
  });

  await test("BUG CATCH: cross-date 23505 existingSessionId pass-through (h111)", async () => {
    const fakeClient = createFakeSupabase({
      "sessions:single": {
        data: null,
        error: {
          code: "23505",
          message: "duplicate key",
          details: "Key (user_id, local_date, status)=(user-123, 2026-10-25, in_progress) already exists.",
        },
      },
      "sessions:query": {
        data: [{ id: "sess-other-day", created_at: "2026-10-24T10:00:00Z", local_date: "2026-10-24" }],
        error: null,
      },
    });
    const deps = buildStartSessionFullDeps(fakeClient, USER_ID, NOW_MS);
    
    const result = await deps.insertSession({
      user_id: USER_ID,
      local_date: "2026-10-25",
      status: "in_progress",
      program_id: "prog-1",
      program_day_id: "day-1",
      week_in_block: 1,
      is_deload: false,
      planned_type: "weights",
      actual_type: "weights",
      started_at: "2026-10-25T10:00:00Z",
    });

    if (result.ok) throw new Error("Expected error for cross-date conflict");
    if (!("existingSessionId" in result)) {
      throw new Error(`Result does not have existingSessionId property: ${JSON.stringify(result)}`);
    }
    eq(result.existingSessionId, "sess-other-day", "existingSessionId passed through");
  });

  console.log(`\n${passed} tests passed, ${failed} tests failed`);
  if (failed > 0) process.exit(1);
})();
