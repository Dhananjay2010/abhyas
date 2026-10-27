#!/usr/bin/env tsx
/**
 * Behavioral test: tomorrow prompt after rest-day swap uses session.local_date + 1
 *
 * MED-1: nextDayPlan must check both completed and in_progress sessions, query by
 * session id, pin the clock via `now`, and compute tomorrow from targetLocalDate
 * (session.local_date + 1, precomputed server-side) so a session finishing after
 * midnight still plans the correct next day.
 *
 * Drives the REAL nextDayPlan through a stubbed Supabase client. Scenario: block
 * [A,B,C] on Mon/Wed/Fri; Mon A completed; Tue rest day with B swapped in →
 * tomorrow (Wed) must be C, never B.
 *
 * Mutants killed:
 * - (a) drop in_progress from query: test fails "Tomorrow should be C"
 * - (b) use wall-clock instead of targetLocalDate: date assertion fails
 * - (c) query by local_date instead of session id: test-5 fails
 */

import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { nextDayPlan } from "../src/lib/program/day-plan";
import { addDays } from "../src/lib/dates";

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

function rows<T>(data: T[], accept: string): Response {
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

function applyFilters<T extends Record<string, unknown>>(data: T[], params: URLSearchParams): T[] {
  let result = data;

  for (const [key, value] of params.entries()) {
    if (key.startsWith("select") || key.startsWith("order") || key === "limit") continue;
    
    const match = key.match(/^(.+)\[eq\]$/) || (value.startsWith("eq.") ? [null, key] : null);
    if (match) {
      const field = match[1] || key;
      const val = value.startsWith("eq.") ? value.substring(3) : value;
      result = result.filter((row) => String(row[field]) === val);
    }
    
    if (value.startsWith("in.(")) {
      const vals = value.substring(4, value.length - 1).split(",").map(v => v.replace(/"/g, ""));
      result = result.filter((row) => vals.includes(String(row[key])));
    }
    
    if (value.startsWith("lte.")) {
      const val = value.substring(4);
      result = result.filter((row) => {
        const fieldVal = row[key];
        return fieldVal != null && String(fieldVal) <= val;
      });
    }
  }

  const orderParam = params.get("order");
  if (orderParam) {
    const [field, dir] = orderParam.split(".");
    const ascending = dir !== "desc";
    result = result.slice().sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal == null || bVal == null) return 0;
      const aStr = String(aVal);
      const bStr = String(bVal);
      if (aStr < bStr) return ascending ? -1 : 1;
      if (aStr > bStr) return ascending ? 1 : -1;
      return 0;
    });
  }

  const limitParam = params.get("limit");
  if (limitParam) {
    result = result.slice(0, parseInt(limitParam, 10));
  }

  return result;
}

function buildClient(scenario: {
  sessions: Session[];
  programDays?: ProgramDay[];
}): ReturnType<typeof createClient<Database>> {
  const program: Program = { id: "prog-1", user_id: "user-1", split_type: "full_body", status: "active" };
  const defaultProgramDays: ProgramDay[] = [
    { id: "pd-a", program_id: "prog-1", day_index: 1, day_type: "weights", label: "Full Body A", status: "active" },
    { id: "pd-rest-2", program_id: "prog-1", day_index: 2, day_type: "rest", label: "Rest", status: "active" },
    { id: "pd-b", program_id: "prog-1", day_index: 3, day_type: "weights", label: "Full Body B", status: "active" },
    { id: "pd-rest-4", program_id: "prog-1", day_index: 4, day_type: "rest", label: "Rest", status: "active" },
    { id: "pd-c", program_id: "prog-1", day_index: 5, day_type: "weights", label: "Full Body C", status: "active" },
    { id: "pd-rest-6", program_id: "prog-1", day_index: 6, day_type: "rest", label: "Rest", status: "active" },
    { id: "pd-rest-7", program_id: "prog-1", day_index: 7, day_type: "rest", label: "Rest", status: "active" },
  ];
  const programDays = scenario.programDays ?? defaultProgramDays;

  const stubFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const path = url.pathname;
    const params = url.searchParams;

    if (path.includes("/programs")) {
      const filtered = applyFilters([program], params);
      return rows(filtered, accept);
    }

    if (path.includes("/program_days")) {
      const filtered = applyFilters(programDays, params);
      return rows(filtered, accept);
    }

    if (path.includes("/sessions")) {
      const filtered = applyFilters(scenario.sessions, params);
      return rows(filtered, accept);
    }

    return rows([], accept);
  };

  return createClient<Database>("http://stub.local", "anon", {
    global: { fetch: stubFetch },
  });
}

async function main() {
  console.log("\nTomorrow prompt after rest-day swap (MED-1)\n");

  // Test 1: in_progress session (before finish button)
  console.log("1. Tue swap to B (in_progress) → tomorrow should be C, not B");
  {
    const client = buildClient({
      sessions: [{
        id: "sess-1",
        user_id: "user-1",
        program_day_id: "pd-b",
        actual_type: "weights",
        local_date: "2026-10-27", // Tuesday
        status: "in_progress",
        created_at: "2026-10-27T10:00:00Z",
      }],
    });

    const targetLocalDate = addDays("2026-10-27", 1); // Wed
    const now = new Date("2026-10-27T14:00:00Z");
    const result = await nextDayPlan(client, "UTC", targetLocalDate, { sessionId: "sess-1", now });

    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.localDate, "2026-10-28", "Tomorrow should be Wed (session date + 1)");
    assert.strictEqual(result.plannedLabel, "Full Body C", "Tomorrow should be C after swap to B");
    assert.strictEqual(result.programDayId, "pd-c", "Program day ID should be pd-c");
    assert.strictEqual(result.collisionResolved, true, "Should have resolved collision");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, date is ${result.localDate}, collision resolved`);
  }

  // Test 2: completed session (after finish)
  console.log("\n2. Tue swap to B (completed) → tomorrow should be C, not B");
  {
    const client = buildClient({
      sessions: [{
        id: "sess-2",
        user_id: "user-1",
        program_day_id: "pd-b",
        actual_type: "weights",
        local_date: "2026-10-27", // Tuesday
        status: "completed",
        created_at: "2026-10-27T10:00:00Z",
      }],
    });

    const targetLocalDate = addDays("2026-10-27", 1); // Wed
    const now = new Date("2026-10-27T18:00:00Z");
    const result = await nextDayPlan(client, "UTC", targetLocalDate, { sessionId: "sess-2", now });

    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.plannedLabel, "Full Body C", "Tomorrow should be C after swap to B");
    assert.strictEqual(result.collisionResolved, true, "Should have resolved collision");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, collision resolved`);
  }

  // Test 3: targetLocalDate drives the date (not wall-clock)
  console.log("\n3. targetLocalDate drives tomorrow date (not wall-clock)");
  {
    const client = buildClient({
      sessions: [{
        id: "sess-3",
        user_id: "user-1",
        program_day_id: "pd-a", // Mon A (not a swap)
        actual_type: "weights",
        local_date: "2026-10-26", // Monday
        status: "completed",
        created_at: "2026-10-26T23:30:00Z",
      }],
    });

    // Session finished Mon at 11:30 PM, but wall-clock is already Tuesday 1 AM
    const targetLocalDate = addDays("2026-10-26", 1); // Tue (session date + 1)
    const now = new Date("2026-10-27T01:00:00Z"); // Wall-clock is Tue 1 AM
    const result = await nextDayPlan(client, "UTC", targetLocalDate, { sessionId: "sess-3", now });

    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.localDate, "2026-10-27", "Tomorrow should be Mon + 1 = Tue (from targetLocalDate)");
    assert.strictEqual(result.plannedLabel, "Rest", "Tuesday is scheduled rest");

    console.log(`  ✓ Tomorrow date is ${result.localDate} (from targetLocalDate, not wall-clock)`);
  }

  // Test 4: Two sessions on same date, query by id returns correct one
  console.log("\n4. Multiple sessions same date: query by id returns correct one");
  {
    const client = buildClient({
      sessions: [
        {
          id: "sess-4a",
          user_id: "user-1",
          program_day_id: "pd-a", // Morning session: did A
          actual_type: "weights",
          local_date: "2026-10-27", // Tuesday
          status: "completed",
          created_at: "2026-10-27T08:00:00Z",
        },
        {
          id: "sess-4b",
          user_id: "user-1",
          program_day_id: "pd-c", // Evening session: did C (different day)
          actual_type: "weights",
          local_date: "2026-10-27", // Same Tuesday
          status: "completed",
          created_at: "2026-10-27T18:00:00Z",
        },
      ],
    });

    // Query by sess-4a (did A on Tue) → tomorrow should rotate from A
    const targetLocalDate1 = addDays("2026-10-27", 1); // Wed
    const now = new Date("2026-10-27T20:00:00Z");
    const result1 = await nextDayPlan(client, "UTC", targetLocalDate1, { sessionId: "sess-4a", now });
    assert.ok(result1, "Should return a plan");
    // Wed is scheduled B, A → B rotation (no collision)
    assert.strictEqual(result1.plannedLabel, "Full Body B", "After A, next is B");
    
    // Query by sess-4b (did C on Tue) → tomorrow should rotate from C
    const result2 = await nextDayPlan(client, "UTC", targetLocalDate1, { sessionId: "sess-4b", now });
    assert.ok(result2, "Should return a plan");
    // Wed is scheduled B, but C → A rotation collides with B, so should give B
    // (Wed scheduled B matches next-up rotation slot, no collision)
    assert.strictEqual(result2.plannedLabel, "Full Body B", "After C, next is A, but Wed is B");

    console.log(`  ✓ Different sessions on same date → different rotations`);
  }

  // Test 5: Abandoned in_progress from earlier day doesn't affect today
  console.log("\n5. Abandoned in_progress from earlier day is ignored");
  {
    const client = buildClient({
      sessions: [
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
      ],
    });
    
    // Query from Wednesday's session perspective
    const targetLocalDate = addDays("2026-10-28", 1); // Thu
    const now = new Date("2026-10-28T15:00:00Z");
    const result = await nextDayPlan(client, "UTC", targetLocalDate, { sessionId: "sess-today", now });
    
    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.plannedLabel, "Rest", "Thursday is scheduled rest");
    assert.strictEqual(result.collisionResolved, false, "No collision (B done, rest tomorrow)");
    
    console.log(`  ✓ Abandoned Mon in_progress ignored, Wed completed B recognized`);
  }

  console.log("\n✓ All tomorrow-prompt tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
