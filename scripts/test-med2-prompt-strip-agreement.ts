#!/usr/bin/env tsx
/**
 * QA MED-2: Verify nextDayPlan (end-of-session prompt) and plannableDays
 * (week strip Next up) return consistent workout labels.
 *
 * Uses real @supabase/supabase-js createClient with a stubFetch that parses
 * PostgREST query params.
 * 
 *   npx tsx scripts/test-med2-prompt-strip-agreement.ts
 */

import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";
import { nextDayPlan } from "../src/lib/program/day-plan";
import type { Database } from "../src/lib/database.types";

type Row = Record<string, unknown>;

function getRowField(row: Row, field: string): string {
  if (field in row) {
    return String(row[field] ?? "");
  }
  return "";
}

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

    // programs table
    if (urlString.includes("/programs?") && method === "GET") {
      let filtered = [...PROGRAMS];
      const status = params.get("status");
      if (status === "eq.active") {
        filtered = filtered.filter(p => p.status === "active");
      }
      return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // profiles table
    if (urlString.includes("/profiles?") && method === "GET") {
      return new Response(JSON.stringify(PROFILES), { status: 200, headers: { "Content-Type": "application/json" } });
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
      if (statusParam?.startsWith("eq.")) {
        const status = statusParam.slice(3);
        filtered = filtered.filter(s => s.status === status);
      } else if (statusParam?.startsWith("in.(")) {
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
      } else if (localDateParam?.startsWith("lte.")) {
        const localDate = localDateParam.slice(4);
        filtered = filtered.filter(s => String(s.local_date) <= localDate);
      }
      
      const order = params.get("order");
      if (order) {
        const orders = order.split(",");
        filtered.sort((a, b) => {
          for (const o of orders) {
            const [field, dir] = o.split(".");
            const aVal = getRowField(a, field);
            const bVal = getRowField(b, field);
            const cmp = dir === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
      }
      
      const limit = params.get("limit");
      if (limit) filtered = filtered.slice(0, Number(limit));
      
      return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
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
      
      return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

async function main() {
  console.log("\nQA MED-2: Prompt and strip Next up agreement\n");

  const sessions: Row[] = [
    {
      id: "sess-mon",
      user_id: "u1",
      status: "in_progress",
      local_date: "2026-10-26",
      program_day_id: "pd-1",
      actual_type: "weights",
      is_deload: false,
      week_in_block: 1,
      warmup_completed: true,
      started_at: "2026-10-26T12:00:00Z",
      created_at: "2026-10-26T12:00:00Z",
      updated_at: "2026-10-26T12:00:00Z",
      completed_at: null,
      program_id: "p1",
    },
  ];

  const supabase = createClient<Database>("http://localhost:54321", "fake-key", {
    global: { fetch: createStubFetch(sessions) },
  });

  console.log("Scenario: Finished Upper on Mon Oct 26, planning Tue Oct 27");

  const promptResult = await nextDayPlan(
    supabase,
    "Asia/Kolkata",
    "2026-10-27",
    { sessionId: "sess-mon", now: new Date("2026-10-26T16:30:00Z") }
  );

  assert.ok(promptResult, "nextDayPlan should return result");
  console.log(`  Prompt label: ${promptResult.plannedLabel}`);

  const nextUpDay = promptResult.days.find(d => d.nextUp);
  assert.ok(nextUpDay, "Strip should have Next up badge");
  console.log(`  Strip label: ${nextUpDay.label}`);

  assert.strictEqual(promptResult.plannedLabel, nextUpDay.label, "Prompt and strip should agree");
  console.log(`\n  ✓ Both agree: ${promptResult.plannedLabel}\n`);

  console.log("✓ QA MED-2: Prompt and strip agree (Fixes MED-2)\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Case 2: Unlabeled training day gets "Training" as Next up badge
  // ──────────────────────────────────────────────────────────────────────────
  console.log("Unlabeled training day: Next up should fallback to 'Training'");

  const unlabeledDays: Row[] = [
    { id: "pd-1u", day_index: 1, day_type: "weights", label: null, program_id: "p2", status: "active", user_id: "u2", focus: null },
    { id: "pd-2u", day_index: 2, day_type: "weights", label: null, program_id: "p2", status: "active", user_id: "u2", focus: null },
    { id: "pd-3u", day_index: 3, day_type: "rest", label: null, program_id: "p2", status: "active", user_id: "u2", focus: null },
  ];

  const unlabeledSessions: Row[] = [
    {
      id: "sess-unlabeled",
      user_id: "u2",
      status: "in_progress",
      local_date: "2026-10-26",
      program_day_id: "pd-1u",
      actual_type: "weights",
      is_deload: false,
      week_in_block: 1,
      warmup_completed: true,
      started_at: "2026-10-26T12:00:00Z",
      created_at: "2026-10-26T12:00:00Z",
      updated_at: "2026-10-26T12:00:00Z",
      completed_at: null,
      program_id: "p2",
    },
  ];

  function createUnlabeledStub(sessions: Row[], days: Row[]): typeof fetch {
    return async (input: RequestInfo | URL): Promise<Response> => {
      const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsedUrl = new URL(urlString);
      const params = parsedUrl.searchParams;

      if (urlString.includes("/programs?")) {
        return new Response(JSON.stringify([{ id: "p2", user_id: "u2", split_type: "custom", status: "active" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlString.includes("/profiles?")) {
        return new Response(JSON.stringify([{ primary_track: "weights", has_all_equipment: true, timezone: "Asia/Kolkata", units: "metric" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlString.includes("/sessions?")) {
        let filtered = [...sessions];
        const userIdParam = params.get("user_id");
        if (userIdParam?.startsWith("eq.")) filtered = filtered.filter(s => s.user_id === userIdParam.slice(3));
        const idParam = params.get("id");
        if (idParam?.startsWith("eq.")) filtered = filtered.filter(s => s.id === idParam.slice(3));
        const statusParam = params.get("status");
        if (statusParam?.startsWith("eq.")) filtered = filtered.filter(s => s.status === statusParam.slice(3));
        else if (statusParam?.startsWith("in.(")) {
          const statuses = statusParam.slice(4, -1).split(",");
          filtered = filtered.filter(s => statuses.includes(String(s.status)));
        }
        const actualTypeParam = params.get("actual_type");
        if (actualTypeParam?.startsWith("in.(")) {
          const types = actualTypeParam.slice(4, -1).split(",");
          filtered = filtered.filter(s => types.includes(String(s.actual_type)));
        }
        return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (urlString.includes("/program_days?")) {
        let filtered = [...days];
        const programIdParam = params.get("program_id");
        if (programIdParam?.startsWith("eq.")) filtered = filtered.filter(d => d.program_id === programIdParam.slice(3));
        if (params.get("status") === "eq.active") filtered = filtered.filter(d => d.status === "active");
        const order = params.get("order");
        if (order?.startsWith("day_index")) filtered.sort((a, b) => Number(a.day_index) - Number(b.day_index));
        return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }

  const supabase2 = createClient<Database>("http://localhost:54321", "fake-key", {
    global: { fetch: createUnlabeledStub(unlabeledSessions, unlabeledDays) },
  });

  const unlabeledResult = await nextDayPlan(
    supabase2,
    "Asia/Kolkata",
    "2026-10-27",
    { sessionId: "sess-unlabeled", now: new Date("2026-10-26T16:30:00Z") }
  );

  assert.ok(unlabeledResult, "Should return result");
  console.log(`  Prompt label: ${unlabeledResult.plannedLabel}`);
  
  const unlabeledNextUp = unlabeledResult.days.find(d => d.nextUp);
  assert.ok(unlabeledNextUp, "Strip should have Next up badge");
  console.log(`  Strip label: ${unlabeledNextUp.label}`);
  
  assert.strictEqual(unlabeledNextUp.label, "Training", "Unlabeled day should show 'Training'");
  console.log(`\n  ✓ Unlabeled training day → Next up badge shows 'Training'\n`);

  console.log("✓ All MED-2 tests passed\n");
}

main().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
