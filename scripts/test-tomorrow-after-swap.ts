#!/usr/bin/env tsx
/**
 * Behavioral test: tomorrow prompt after rest-day swap uses session.local_date
 *
 * MED-1: nextDayPlan must check both completed and in_progress sessions, and
 * compute tomorrow from sessionLocalDate (not wall-clock) so a session finishing
 * after midnight still plans the correct next day.
 *
 * Drives the REAL nextDayPlan through a stubbed Supabase client (same pattern
 * as test-create-block-anchoring). Scenario: block [A,B,C] on Mon/Wed/Fri;
 * Mon A completed; Tue rest day with B swapped in → tomorrow (Wed) must be C.
 *
 * Mutants killed:
 * - (a) drop in_progress from query: test fails "Tomorrow should be C"
 * - (b) use wall-clock instead of sessionLocalDate: date assertion fails
 */

import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { nextDayPlan } from "../src/lib/program/day-plan";

type DayType = Database["public"]["Enums"]["day_type"];

type Program = { id: string; user_id: string; split_type: string; status: string };
type ProgramDay = { id: string; program_id: string; day_index: number; day_type: DayType; label: string | null; status: string };
type Session = { id: string; user_id: string; program_day_id: string; actual_type: string | null; local_date: string; status: string; created_at: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rows(data: unknown[], accept: string): Response {
  if (accept.includes("vnd.pgrst.object")) {
    if (data.length === 0) {
      return json(null, 200);
    }
    if (data.length !== 1) {
      return json(
        { code: "PGRST116", message: "JSON object requested, multiple rows returned" },
        406
      );
    }
    return json(data[0]);
  }
  return json(data);
}

function applyFilters(data: unknown[], params: URLSearchParams): unknown[] {
  let result = data;

  // Apply eq filters
  for (const [key, value] of params.entries()) {
    if (key.startsWith("select") || key.startsWith("order") || key === "limit") continue;
    
    const match = key.match(/^(.+)\[eq\]$/) || (value.startsWith("eq.") ? [null, key] : null);
    if (match) {
      const field = match[1] || key;
      const val = value.startsWith("eq.") ? value.substring(3) : value;
      result = result.filter((row: unknown) => {
        const r = row as Record<string, unknown>;
        return String(r[field]) === val;
      });
    }
    
    // in filter
    if (value.startsWith("in.(")) {
      const vals = value.substring(4, value.length - 1).split(",").map(v => v.replace(/"/g, ""));
      result = result.filter((row: unknown) => {
        const r = row as Record<string, unknown>;
        return vals.includes(String(r[key]));
      });
    }
    
    // lte filter
    if (value.startsWith("lte.")) {
      const val = value.substring(4);
      result = result.filter((row: unknown) => {
        const r = row as Record<string, unknown>;
        const fieldVal = r[key];
        return fieldVal != null && String(fieldVal) <= val;
      });
    }
  }

  // Apply order
  const orderParam = params.get("order");
  if (orderParam) {
    const [field, dir] = orderParam.split(".");
    const ascending = dir !== "desc";
    result = result.slice().sort((a: unknown, b: unknown) => {
      const aRow = a as Record<string, unknown>;
      const bRow = b as Record<string, unknown>;
      const aVal = aRow[field];
      const bVal = bRow[field];
      if (aVal == null || bVal == null) return 0;
      const aStr = String(aVal);
      const bStr = String(bVal);
      if (aStr < bStr) return ascending ? -1 : 1;
      if (aStr > bStr) return ascending ? 1 : -1;
      return 0;
    });
  }

  // Apply limit
  const limitParam = params.get("limit");
  if (limitParam) {
    result = result.slice(0, parseInt(limitParam, 10));
  }

  return result;
}

function buildClient(scenario: {
  sessionStatus: "completed" | "in_progress";
  todaySessionProgramDayId: string;
  todayLocalDate: string;
}): { client: ReturnType<typeof createClient<Database>>; callLog: string[] } {
  const callLog: string[] = [];

  const program: Program = { id: "prog-1", user_id: "user-1", split_type: "full_body", status: "active" };
  const programDays: ProgramDay[] = [
    { id: "pd-a", program_id: "prog-1", day_index: 1, day_type: "weights", label: "Full Body A", status: "active" },
    { id: "pd-rest-2", program_id: "prog-1", day_index: 2, day_type: "rest", label: "Rest", status: "active" },
    { id: "pd-b", program_id: "prog-1", day_index: 3, day_type: "weights", label: "Full Body B", status: "active" },
    { id: "pd-rest-4", program_id: "prog-1", day_index: 4, day_type: "rest", label: "Rest", status: "active" },
    { id: "pd-c", program_id: "prog-1", day_index: 5, day_type: "weights", label: "Full Body C", status: "active" },
    { id: "pd-rest-6", program_id: "prog-1", day_index: 6, day_type: "rest", label: "Rest", status: "active" },
    { id: "pd-rest-7", program_id: "prog-1", day_index: 7, day_type: "rest", label: "Rest", status: "active" },
  ];

  const sessions: Session[] = [
    {
      id: "sess-1",
      user_id: "user-1",
      program_day_id: scenario.todaySessionProgramDayId,
      actual_type: "weights",
      local_date: scenario.todayLocalDate,
      status: scenario.sessionStatus,
      created_at: "2026-10-28T10:00:00Z",
    },
  ];

  const stubFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const path = url.pathname;
    const params = url.searchParams;

    const logEntry = `${method} ${path}?${params.toString()} [Accept: ${accept.includes("object") ? "object" : "array"}]`;
    callLog.push(logEntry);

    // Programs table
    if (path.includes("/programs")) {
      const filtered = applyFilters([program], params);
      return rows(filtered, accept);
    }

    // Program days table
    if (path.includes("/program_days")) {
      const filtered = applyFilters(programDays, params);
      return rows(filtered, accept);
    }

    // Sessions table
    if (path.includes("/sessions")) {
      const filtered = applyFilters(sessions, params);
      return rows(filtered, accept);
    }

    // Default: empty result
    return rows([], accept);
  };

  const client = createClient<Database>("http://stub.local", "anon", {
    global: { fetch: stubFetch },
  });

  return { client, callLog };
}

async function main() {
  console.log("\nTomorrow prompt after rest-day swap (MED-1)\n");

  // Test 1: in_progress session (before finish button)
  console.log("1. Tue swap to B (in_progress) → tomorrow should be C, not B");
  {
    const { client } = buildClient({
      sessionStatus: "in_progress",
      todaySessionProgramDayId: "pd-b",
      todayLocalDate: "2026-10-27", // Tuesday (day 2 = rest)
    });

    const result = await nextDayPlan(client, "UTC", {
      sessionLocalDate: "2026-10-27", // Tuesday
    });

    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.localDate, "2026-10-28", "Tomorrow should be Wed (session date + 1)");
    assert.strictEqual(
      result.plannedLabel,
      "Full Body C",
      "Tomorrow should be Full Body C after swap to B"
    );
    assert.strictEqual(result.collisionResolved, true, "Should have resolved collision");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, date is ${result.localDate}, collision resolved`);
  }

  // Test 2: completed session (after finish)
  console.log("\n2. Tue swap to B (completed) → tomorrow should be C, not B");
  {
    const { client } = buildClient({
      sessionStatus: "completed",
      todaySessionProgramDayId: "pd-b",
      todayLocalDate: "2026-10-27", // Tuesday
    });

    const result = await nextDayPlan(client, "UTC", {
      sessionLocalDate: "2026-10-27", // Tuesday
    });

    assert.ok(result, "Should return a plan");
    assert.strictEqual(
      result.plannedLabel,
      "Full Body C",
      "Tomorrow should be Full Body C after swap to B"
    );
    assert.strictEqual(result.collisionResolved, true, "Should have resolved collision");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, collision resolved`);
  }

  // Test 3: sessionLocalDate drives the date (not wall-clock)
  console.log("\n3. sessionLocalDate drives tomorrow date (not wall-clock)");
  {
    const { client } = buildClient({
      sessionStatus: "completed",
      todaySessionProgramDayId: "pd-a", // Mon A (not a swap)
      todayLocalDate: "2026-10-26", // Monday
    });

    const result = await nextDayPlan(client, "UTC", {
      sessionLocalDate: "2026-10-26", // Monday
    });

    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.localDate, "2026-10-27", "Tomorrow should be Mon + 1 = Tue");
    assert.strictEqual(result.plannedLabel, "Rest", "Tuesday is scheduled rest");

    console.log(`  ✓ Tomorrow date is ${result.localDate} (Mon + 1)`);
  }

  console.log("\n✓ All tomorrow-prompt tests passed\n");
  
  // Test 4: abandoned in_progress session from earlier day is NOT treated as done
  console.log("4. Abandoned in_progress from earlier day doesn't affect today");
  {
    const programAbandoned: Program = { id: "prog-1", user_id: "user-1", split_type: "full_body", status: "active" };
    const programDaysAbandoned: ProgramDay[] = [
      { id: "pd-a", program_id: "prog-1", day_index: 1, day_type: "weights", label: "Full Body A", status: "active" },
      { id: "pd-rest-2", program_id: "prog-1", day_index: 2, day_type: "rest", label: "Rest", status: "active" },
      { id: "pd-b", program_id: "prog-1", day_index: 3, day_type: "weights", label: "Full Body B", status: "active" },
    ];
    
    // Two sessions: one abandoned on Monday (in_progress), one completed on Wednesday
    const sessionsAbandoned: Session[] = [
      {
        id: "sess-old",
        user_id: "user-1",
        program_day_id: "pd-a",
        actual_type: "weights",
        local_date: "2026-10-26", // Monday (abandoned)
        status: "in_progress",
        created_at: "2026-10-26T10:00:00Z",
      },
      {
        id: "sess-today",
        user_id: "user-1",
        program_day_id: "pd-b",
        actual_type: "weights",
        local_date: "2026-10-28", // Wednesday (completed)
        status: "completed",
        created_at: "2026-10-28T10:00:00Z",
      },
    ];
    
    const stubFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const accept = new Headers(init?.headers).get("accept") ?? "";
      const path = url.pathname;
      const params = url.searchParams;

      if (path.includes("/programs")) {
        const filtered = applyFilters([programAbandoned], params);
        return rows(filtered, accept);
      }

      if (path.includes("/program_days")) {
        const filtered = applyFilters(programDaysAbandoned, params);
        return rows(filtered, accept);
      }

      if (path.includes("/sessions")) {
        const filtered = applyFilters(sessionsAbandoned, params);
        return rows(filtered, accept);
      }

      return rows([], accept);
    };
    
    const client = createClient<Database>("http://stub.local", "anon", {
      global: { fetch: stubFetch },
    });
    
    // Query from Wednesday's perspective - should see Wed's B, not Monday's abandoned A
    const result = await nextDayPlan(client, "UTC", {
      sessionLocalDate: "2026-10-28", // Wednesday
    });
    
    assert.ok(result, "Should return a plan");
    // Tomorrow (Thu) is day 4 = rest, so no collision
    assert.strictEqual(result.plannedLabel, "Rest", "Thursday is scheduled rest");
    assert.strictEqual(result.collisionResolved, false, "No collision (B done, rest tomorrow)");
    
    console.log(`  ✓ Abandoned Mon in_progress ignored, Wed completed B recognized`);
  }
  
  console.log("\n✓ All tests including abandoned-session guard passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
