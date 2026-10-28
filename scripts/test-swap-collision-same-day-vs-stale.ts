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
  { id: "pd-1", day_index: 1, day_type: "weights", label: "Upper", program_id: "p1", status: "active" },
  { id: "pd-2", day_index: 2, day_type: "weights", label: "Lower", program_id: "p1", status: "active" },
  { id: "pd-3", day_index: 3, day_type: "rest", label: null, program_id: "p1", status: "active" },
  { id: "pd-4", day_index: 4, day_type: "weights", label: "Upper", program_id: "p1", status: "active" },
  { id: "pd-5", day_index: 5, day_type: "weights", label: "Lower", program_id: "p1", status: "active" },
  { id: "pd-6", day_index: 6, day_type: "rest", label: null, program_id: "p1", status: "active" },
  { id: "pd-7", day_index: 7, day_type: "rest", label: null, program_id: "p1", status: "active" },
];

const PROGRAMS: Row[] = [
  { id: "p1", user_id: "u1", split_type: "upper_lower", status: "active" },
];

const PROFILES: Row[] = [
  { primary_track: "weights", has_all_equipment: true, timezone: "Asia/Kolkata", units: "metric" },
];

function createStubFetch(sessions: Row[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    // programs table
    if (url.includes("/programs?") && method === "GET") {
      let filtered = [...PROGRAMS];
      if (url.includes("status=eq.active")) {
        filtered = filtered.filter(p => p.status === "active");
      }
      const wantsSingle = init?.headers && (init.headers as Record<string, string>)["Accept"]?.includes("vnd.pgrst.object");
      return new Response(JSON.stringify(wantsSingle ? (filtered[0] ?? null) : filtered), {
        status: 200,
        headers: { "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json" },
      });
    }

    // profiles table
    if (url.includes("/profiles?") && method === "GET") {
      const wantsSingle = init?.headers && (init.headers as Record<string, string>)["Accept"]?.includes("vnd.pgrst.object");
      return new Response(JSON.stringify(wantsSingle ? (PROFILES[0] ?? null) : PROFILES), {
        status: 200,
        headers: { "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json" },
      });
    }

    // sessions table
    if (url.includes("/sessions?") && method === "GET") {
      let filtered = [...sessions];
      
      if (url.includes("user_id=eq.")) {
        const userId = url.match(/user_id=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(s => s.user_id === userId);
      }
      if (url.includes("id=eq.")) {
        const id = url.match(/id=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(s => s.id === id);
      }
      if (url.includes("status=in.(")) {
        const statuses = url.match(/status=in\.\(([^)]+)\)/)?.[1]?.split(",") ?? [];
        filtered = filtered.filter(s => statuses.includes(String(s.status)));
      }
      if (url.includes("actual_type=in.(")) {
        const types = url.match(/actual_type=in\.\(([^)]+)\)/)?.[1]?.split(",") ?? [];
        filtered = filtered.filter(s => types.includes(String(s.actual_type)));
      }
      if (url.includes("local_date=eq.")) {
        const date = url.match(/local_date=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(s => s.local_date === date);
      }
      
      // order
      if (url.includes("order=created_at.desc")) {
        filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      
      // limit
      if (url.includes("limit=1")) {
        filtered = filtered.slice(0, 1);
      }

      const wantsSingle = init?.headers && (init.headers as Record<string, string>)["Accept"]?.includes("vnd.pgrst.object");
      return new Response(JSON.stringify(wantsSingle ? (filtered[0] ?? null) : filtered), {
        status: 200,
        headers: { "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json" },
      });
    }

    // program_days table
    if (url.includes("/program_days?") && method === "GET") {
      let filtered = [...PROGRAM_DAYS];
      if (url.includes("program_id=eq.")) {
        const programId = url.match(/program_id=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(d => d.program_id === programId);
      }
      if (url.includes("status=eq.active")) {
        filtered = filtered.filter(d => d.status === "active");
      }
      if (url.includes("order=day_index")) {
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

  // ──────────────────────────────────────────────────────────────────────────
  // Mutant: remove the localDate check
  // ──────────────────────────────────────────────────────────────────────────
  console.log("MUTANT TEST: Without localDate check (day-plan.ts ~670), stale session would trigger collision");
  console.log("  Named failure: Case 2 (test-swap-collision-same-day-vs-stale) would serve Lower instead of Upper");
  console.log("  (Mutant verification: remove `if (!s || s.localDate !== today) return null;` from getTodayCompletedSession)\n");

  console.log("✓ All swap collision same-day vs stale tests passed\n");
}

main().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
