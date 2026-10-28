#!/usr/bin/env tsx
/**
 * Test: Swap collision applies only for same-day swaps, not stale sessions
 * 
 * When TODAY's session was a swap, tomorrow's collision is resolved.
 * When a STALE session (from 4 days ago) was a swap, no collision occurs.
 * 
 * This test kills the mutant: removing the `s.localDate !== today` check in
 * getTodayCompletedSession (day-plan.ts ~670).
 * 
 *   npx tsx scripts/test-swap-collision-same-day-vs-stale.ts
 */

import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";
import { nextDayPlan } from "../src/lib/program/day-plan";
import type { Database } from "../src/lib/database.types";

type Row = Record<string, unknown>;

const PROGRAM_DAYS: Row[] = [
  { id: "pd-1", day_index: 1, day_type: "weights", label: "Upper", program_id: "p1", status: "active", user_id: "u1", focus: null },
  { id: "pd-2", day_index: 2, day_type: "weights", label: "Lower", program_id: "p1", status: "active", user_id: "u1", focus: null },
  { id: "pd-3", day_index: 3, day_type: "rest", label: null, program_id: "p1", status: "active", user_id: "u1", focus: null },
  { id: "pd-4", day_index: 4, day_type: "weights", label: "Upper", program_id: "p1", status: "active", user_id: "u1", focus: null },
  { id: "pd-5", day_index: 5, day_type: "weights", label: "Lower", program_id: "p1", status: "active", user_id: "u1", focus: null },
  { id: "pd-6", day_index: 6, day_type: "rest", label: null, program_id: "p1", status: "active", user_id: "u1", focus: null },
  { id: "pd-7", day_index: 7, day_type: "rest", label: null, program_id: "p1", status: "active", user_id: "u1", focus: null },
];

const PROGRAMS: Row[] = [
  { id: "p1", user_id: "u1", split_type: "upper_lower", status: "active" },
];

const PROFILES: Row[] = [
  { primary_track: "weights", has_all_equipment: true, timezone: "Asia/Kolkata", units: "metric" },
];

function createStubFetch(sessions: Row[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const parsedUrl = new URL(urlString);
    const params = parsedUrl.searchParams;
    const headers = new Headers(init?.headers);
    const wantsSingle = headers.get("Accept")?.includes("vnd.pgrst.object") ?? false;

    // programs table
    if (urlString.includes("/programs?") && method === "GET") {
      let filtered = [...PROGRAMS];
      const status = params.get("status");
      if (status === "eq.active") {
        filtered = filtered.filter(p => p.status === "active");
      }
      return new Response(JSON.stringify(wantsSingle ? (filtered[0] ?? null) : filtered), {
        status: 200,
        headers: { "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json" },
      });
    }

    // profiles table
    if (urlString.includes("/profiles?") && method === "GET") {
      return new Response(JSON.stringify(wantsSingle ? (PROFILES[0] ?? null) : PROFILES), {
        status: 200,
        headers: { "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json" },
      });
    }

    // sessions table
    if (urlString.includes("/sessions?") && method === "GET") {
      let filtered = [...sessions];
      
      const userIdParam = params.get("user_id");
      if (userIdParam?.startsWith("eq.")) {
        const userId = userIdParam.slice(3);
        filtered = filtered.filter(s => s.user_id === userId);
      }
      
      const idParam = params.get("id");
      if (idParam?.startsWith("eq.")) {
        const id = idParam.slice(3);
        filtered = filtered.filter(s => s.id === id);
      }
      
      const statusParam = params.get("status");
      if (statusParam?.startsWith("in.(")) {
        const statuses = statusParam.slice(4, -1).split(",");
        filtered = filtered.filter(s => statuses.includes(String(s.status)));
      }
      
      const actualTypeParam = params.get("actual_type");
      if (actualTypeParam?.startsWith("in.(")) {
        const types = actualTypeParam.slice(4, -1).split(",");
        filtered = filtered.filter(s => types.includes(String(s.actual_type)));
      }
      
      const localDateParam = params.get("local_date");
      if (localDateParam?.startsWith("eq.")) {
        const localDate = localDateParam.slice(3);
        filtered = filtered.filter(s => s.local_date === localDate);
      }
      
      const order = params.get("order");
      if (order === "created_at.desc") {
        filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      
      const limit = params.get("limit");
      if (limit) filtered = filtered.slice(0, Number(limit));

      return new Response(JSON.stringify(wantsSingle ? (filtered[0] ?? null) : filtered), {
        status: 200,
        headers: { "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json" },
      });
    }

    // program_days table
    if (urlString.includes("/program_days?") && method === "GET") {
      let filtered = [...PROGRAM_DAYS];
      
      const programIdParam = params.get("program_id");
      if (programIdParam?.startsWith("eq.")) {
        const programId = programIdParam.slice(3);
        filtered = filtered.filter(d => d.program_id === programId);
      }
      
      const status = params.get("status");
      if (status === "eq.active") {
        filtered = filtered.filter(d => d.status === "active");
      }
      
      const order = params.get("order");
      if (order?.startsWith("day_index")) {
        filtered.sort((a, b) => Number(a.day_index) - Number(b.day_index));
      }
      
      return new Response(JSON.stringify(filtered), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

async function main() {
  console.log("\nSwap collision: same-day vs stale\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Case 1: SAME-DAY swap → collision resolves
  // ──────────────────────────────────────────────────────────────────────────
  console.log("1. Same-day swap (Wed rest → did Upper) → Thu collision resolves to Lower");

  const sameDaySessions: Row[] = [
    {
      id: "sess-wed",
      user_id: "u1",
      status: "in_progress",
      local_date: "2026-10-28",  // today (Wed)
      program_day_id: "pd-1",    // Upper (swap from rest)
      actual_type: "weights",
      is_deload: false,
      week_in_block: 1,
      warmup_completed: true,
      started_at: "2026-10-28T12:00:00Z",
      created_at: "2026-10-28T12:00:00Z",
    },
  ];

  const supabase1 = createClient<Database>("http://localhost:54321", "fake-key", {
    global: { fetch: createStubFetch(sameDaySessions) },
  });

  const sameDayResult = await nextDayPlan(
    supabase1,
    "Asia/Kolkata",
    "2026-10-29",  // targetLocalDate (tomorrow Thu)
    { sessionId: "sess-wed", now: new Date("2026-10-28T16:30:00Z") }
  );

  assert.ok(sameDayResult, "Should return result");
  assert.strictEqual(sameDayResult.plannedLabel, "Lower", "Collision resolved → Lower");
  assert.strictEqual(sameDayResult.programDayId, "pd-2", "Collision resolved → pd-2");
  assert.strictEqual(sameDayResult.collisionResolved, true, "Should mark as resolved");

  console.log("  ✓ Same-day swap → collision resolved to Lower\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Case 2: STALE swap (4 days ago) → NO collision
  // ──────────────────────────────────────────────────────────────────────────
  console.log("2. Stale swap (Sat 24 Oct rest → did Upper) finished Wed 28 → Thu stays Upper");

  const staleSessions: Row[] = [
    {
      id: "sess-sat-stale",
      user_id: "u1",
      status: "in_progress",
      local_date: "2026-10-24",  // stale (4 days ago)
      program_day_id: "pd-1",    // Upper (swap from rest)
      actual_type: "weights",
      is_deload: false,
      week_in_block: 1,
      warmup_completed: true,
      started_at: "2026-10-24T12:00:00Z",
      created_at: "2026-10-24T12:00:00Z",
    },
  ];

  const supabase2 = createClient<Database>("http://localhost:54321", "fake-key", {
    global: { fetch: createStubFetch(staleSessions) },
  });

  const staleResult = await nextDayPlan(
    supabase2,
    "Asia/Kolkata",
    "2026-10-29",  // targetLocalDate (tomorrow Thu from Wed)
    { sessionId: "sess-sat-stale", now: new Date("2026-10-28T16:30:00Z") }
  );

  assert.ok(staleResult, "Should return result");
  assert.strictEqual(staleResult.plannedLabel, "Upper", "NO collision → Upper stays");
  assert.strictEqual(staleResult.programDayId, "pd-4", "NO collision → pd-4");
  assert.strictEqual(staleResult.collisionResolved, false, "Should NOT mark as resolved");

  console.log("  ✓ Stale swap → no collision, Upper stays\n");

  console.log("✓ All swap collision same-day vs stale tests passed\n");
}

main().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
