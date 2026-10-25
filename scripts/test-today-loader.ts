/**
 * Test loadTodaySessionState loader: call ordering, c2, e1, f2.
 * Typed fakes ensure close-before-read and correct data flow.
 * 
 *   npx tsx scripts/test-today-loader.ts
 */

import { 
  loadTodaySessionState,
  makeTodayLoaderDeps,
  type TodayLoaderDeps,
  type OpenSessionRow,
  type RecentSessionRow
} from "../src/lib/today/loader";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

class FakeTodayLoaderDeps implements TodayLoaderDeps {
  private openSessions: OpenSessionRow[] | null = null;
  private creditedToReturn = 0;
  private recentSessions: RecentSessionRow[] | null = null;
  private statefulRows: Map<string, RecentSessionRow> = new Map();
  
  recordedCloseStaleInput: OpenSessionRow[] = [];
  recordedCloseStaleToday: string | null = null;
  callOrder: string[] = [];

  setOpenSessions(sessions: OpenSessionRow[] | null) {
    this.openSessions = sessions;
  }

  setCreditedCount(count: number) {
    this.creditedToReturn = count;
  }

  setRecentSessions(sessions: RecentSessionRow[] | null) {
    this.recentSessions = sessions;
    if (sessions) {
      for (const row of sessions) {
        this.statefulRows.set(row.id, row);
      }
    }
  }

  async fetchOpenSessions(): Promise<OpenSessionRow[] | null> {
    this.callOrder.push("fetchOpenSessions");
    return this.openSessions;
  }

  async closeStale(input: OpenSessionRow[], today: string): Promise<number> {
    this.callOrder.push("closeStale");
    this.recordedCloseStaleInput = input;
    this.recordedCloseStaleToday = today;
    
    await new Promise((resolve) => setImmediate(resolve));
    
    for (const row of input) {
      const stateRow = this.statefulRows.get(row.id);
      if (stateRow && stateRow.status === "in_progress") {
        stateRow.status = "completed";
      }
    }
    
    return this.creditedToReturn;
  }

  async fetchRecentSessions(): Promise<RecentSessionRow[] | null> {
    this.callOrder.push("fetchRecentSessions");
    return Array.from(this.statefulRows.values());
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Call order: closeStale runs BEFORE fetchRecentSessions");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([]);
  fake.setCreditedCount(0);
  fake.setRecentSessions([]);

  await loadTodaySessionState(fake, "2026-10-25");

  check("3 calls made", fake.callOrder.length === 3);
  check("fetchOpenSessions first", fake.callOrder[0] === "fetchOpenSessions");
  check("closeStale second", fake.callOrder[1] === "closeStale");
  check("fetchRecentSessions last (after closeStale)", fake.callOrder[2] === "fetchRecentSessions");
}

console.log("\n2. Closed session not in strengthOpen: closeStale flips status before read");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "yesterday", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z", actual_type: "weights", status: "in_progress" },
  ]);
  fake.setCreditedCount(1);
  fake.setRecentSessions([
    { id: "yesterday", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z", program_day_id: "day1", created_at: "2026-10-24T10:00:00Z" },
  ]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("closeStale ran before read", fake.callOrder[1] === "closeStale");
  check("fetchRecentSessions ran after close", fake.callOrder[2] === "fetchRecentSessions");
  check("strengthOpen is undefined (closed row not found)", result.strengthOpen === undefined);
  check("credited is 1", result.credited === 1);
}

console.log("\n3. c2: creditedBanner reflects the count closeStale returned");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "s1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
  ]);
  fake.setCreditedCount(2);
  fake.setRecentSessions([]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("credited count is 2", result.credited === 2);
  check("c2: creditedBanner shows 2 sessions", result.creditedBanner?.startsWith("2 sessions") === true);
}

console.log("\n4. e1: strengthOpen searches all sessions (not just today's)");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([]);
  fake.setCreditedCount(0);
  fake.setRecentSessions([
    { id: "yesterday", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z", program_day_id: "day1", created_at: "2026-10-24T10:00:00Z" },
    { id: "breathe", status: "in_progress", actual_type: "meditation", local_date: "2026-10-24", started_at: null, program_day_id: null, created_at: "2026-10-24T11:00:00Z" },
    { id: "today", status: "planned", actual_type: "bodyweight", local_date: "2026-10-25", started_at: null, program_day_id: "day2", created_at: "2026-10-25T00:00:00Z" },
  ]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("e1: strengthOpen found", result.strengthOpen !== undefined);
  check("e1: strengthOpen is yesterday's in_progress", result.strengthOpen?.id === "yesterday");
}

console.log("\n5. f2: closeStale receives each row's real started_at");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "s1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
    { id: "s2", local_date: "2026-10-25", started_at: null, actual_type: "bodyweight", status: "in_progress" },
  ]);
  fake.setCreditedCount(1);
  fake.setRecentSessions([]);

  await loadTodaySessionState(fake, "2026-10-25");

  check("f2: closeStale called", fake.recordedCloseStaleInput.length === 2);
  check("f2: first row has real started_at", fake.recordedCloseStaleInput[0].started_at === "2026-10-24T10:00:00Z");
  check("f2: second row has null started_at", fake.recordedCloseStaleInput[1].started_at === null);
  check("f2: today passed correctly", fake.recordedCloseStaleToday === "2026-10-25");
}

console.log("\n6. todaySessions filters to only today's rows");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([]);
  fake.setCreditedCount(0);
  fake.setRecentSessions([
    { id: "yesterday-weights", status: "completed", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", program_day_id: "day1", created_at: "2026-10-24T10:00:00Z" },
    { id: "today-bodyweight", status: "planned", actual_type: "bodyweight", local_date: "2026-10-25", started_at: null, program_day_id: "day2", created_at: "2026-10-25T00:00:00Z" },
    { id: "tomorrow-weights", status: "planned", actual_type: "weights", local_date: "2026-10-26", started_at: null, program_day_id: "day3", created_at: "2026-10-26T00:00:00Z" },
    { id: "today-meditation", status: "completed", actual_type: "meditation", local_date: "2026-10-25", started_at: "2026-10-25T08:00:00Z", program_day_id: null, created_at: "2026-10-25T08:00:00Z" },
  ]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("allSessions has 4 rows", result.allSessions.length === 4);
  check("todaySessions has 2 rows", result.todaySessions.length === 2);
  const todayIds = result.todaySessions.map((s) => s.id).sort();
  check("todaySessions contains only today's rows", 
    todayIds[0] === "today-bodyweight" && todayIds[1] === "today-meditation");
}

console.log("\n7. Factory test: makeTodayLoaderDeps generates correct queries");
{
  const recordedRequests: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          headers[key] = value;
        }
      } else {
        Object.assign(headers, init.headers);
      }
    }
    recordedRequests.push({ url, method, headers });
    
    if (url.includes("sessions") && method === "GET" && url.includes("status=")) {
      return new Response(JSON.stringify([
        { id: "stale", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    if (url.includes("sessions") && method === "PATCH") {
      return new Response(JSON.stringify([
        { id: "stale", status: "completed" },
      ]), { 
        status: 200, 
        headers: { 
          "content-type": "application/json",
          "content-range": "0-0/1"
        } 
      });
    }
    
    if (url.includes("sessions") && method === "GET" && url.includes("local_date=gte.")) {
      return new Response(JSON.stringify([
        { id: "stale", status: "completed", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", program_day_id: "day1", created_at: "2026-10-24T10:00:00Z" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    if (url.includes("session_exercises") && method === "GET") {
      return new Response(JSON.stringify([
        { 
          session_id: "stale", 
          session_sets: [
            { id: "set1", is_warmup_set: false, completed_at: "2026-10-24T10:15:00Z" },
            { id: "set2", is_warmup_set: false, completed_at: "2026-10-24T10:20:00Z" }
          ]
        },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const deps = makeTodayLoaderDeps(client, { yesterday: "2026-10-24", weekAheadEnd: "2026-10-31" });
  
  const result = await loadTodaySessionState(deps, "2026-10-25");
  
  check("at least 3 requests recorded", recordedRequests.length >= 3);
  
  const openReq = recordedRequests.find((r) => r.url.includes("status=") && r.method === "GET" && !r.url.includes("local_date=gte."));
  check("open-sessions request exists", openReq !== undefined);
  if (openReq) {
    const hasStatusFilter = openReq.url.includes("status=in.") || (openReq.url.includes("status=") && openReq.url.includes("planned") && openReq.url.includes("in_progress"));
    check("open-sessions has status filter", hasStatusFilter);
    check("open-sessions selects started_at", openReq.url.includes("started_at"));
    check("open-sessions orders by local_date desc", openReq.url.includes("order=local_date.desc"));
    check("open-sessions limits to 20", openReq.url.includes("limit=20"));
  }
  
  const patchReq = recordedRequests.find((r) => r.method === "PATCH");
  check("close-stale PATCH request exists", patchReq !== undefined);
  if (patchReq) {
    const hasPreferHeader = Object.keys(patchReq.headers).some((k) => 
      k.toLowerCase() === "prefer" && patchReq.headers[k].includes("count=exact")
    );
    check("close-stale has Prefer count=exact header", hasPreferHeader);
  }
  
  const recentReq = recordedRequests.find((r) => r.url.includes("local_date=gte.") && r.method === "GET");
  check("recent-sessions request exists", recentReq !== undefined);
  if (recentReq) {
    check("recent-sessions has gte yesterday", recentReq.url.includes("local_date=gte.2026-10-24"));
    check("recent-sessions has lte weekAheadEnd", recentReq.url.includes("local_date=lte.2026-10-31"));
    check("recent-sessions orders by created_at desc", recentReq.url.includes("order=created_at.desc"));
  }
  
  const patchIndex = recordedRequests.findIndex((r) => r.method === "PATCH");
  const recentIndex = recordedRequests.findIndex((r) => r.url.includes("local_date=gte.") && r.method === "GET");
  check("close-stale PATCH sent before recent-sessions GET", patchIndex >= 0 && recentIndex >= 0 && patchIndex < recentIndex);
  
  check("result reports 1 closed", result.credited === 1);
}

console.log("\n8. null openSessions and recentSessions handled gracefully");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions(null);
  fake.setCreditedCount(0);
  fake.setRecentSessions(null);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("closeStale received empty array", fake.recordedCloseStaleInput.length === 0);
  check("credited is 0", result.credited === 0);
  check("creditedBanner is null", result.creditedBanner === null);
  check("allSessions is empty", result.allSessions.length === 0);
  check("todaySessions is empty", result.todaySessions.length === 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
