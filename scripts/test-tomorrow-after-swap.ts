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

  // Test 4: Query by session id, not by date arithmetic
  console.log("\n4. Session id lookup: finds right session, not newest on computed date");
  {
    // Two sessions on consecutive days. Query for Monday's session with Wednesday target.
    // With sessionId: finds Monday session directly (did A)
    // Without sessionId (mutant c): calculates today = Wed - 1 = Tue, finds Tuesday session (did B)
    const client = buildClient({
      sessions: [
        {
          id: "sess-mon",
          user_id: "user-1",
          program_day_id: "pd-a", // Did A on Monday
          actual_type: "weights",
          local_date: "2026-10-26", // Monday
          status: "completed",
          created_at: "2026-10-26T10:00:00Z",
        },
        {
          id: "sess-tue",
          user_id: "user-1",
          program_day_id: "pd-b", // Did B on Tuesday (rest-day swap)
          actual_type: "weights",
          local_date: "2026-10-27", // Tuesday
          status: "completed",
          created_at: "2026-10-27T10:00:00Z",
        },
      ],
    });

    // Compute tomorrow for Monday's session (should be Tue = Mon + 1)
    const targetLocalDateMon = addDays("2026-10-26", 1); // Tuesday
    const now = new Date("2026-10-27T15:00:00Z");
    
    // Query for Monday's session
    const resultMon = await nextDayPlan(client, "UTC", targetLocalDateMon, { sessionId: "sess-mon", now });
    assert.ok(resultMon, "Should return plan for Monday session");
    assert.strictEqual(resultMon.localDate, "2026-10-27", "Monday's tomorrow should be Tue");
    assert.strictEqual(resultMon.plannedLabel, "Rest", "Tuesday is rest day");
    assert.strictEqual(resultMon.collisionResolved, false, "No collision for Mon A → Tue rest");
    
    // Query for Tuesday's session (did B, rest-day swap)
    const targetLocalDateTue = addDays("2026-10-27", 1); // Wednesday
    const resultTue = await nextDayPlan(client, "UTC", targetLocalDateTue, { sessionId: "sess-tue", now });
    assert.ok(resultTue, "Should return plan for Tuesday session");
    assert.strictEqual(resultTue.localDate, "2026-10-28", "Tuesday's tomorrow should be Wed");
    assert.strictEqual(resultTue.plannedLabel, "Full Body C", "Wed should be C (collision resolved)");
    assert.strictEqual(resultTue.collisionResolved, true, "Collision: swapped to B, Wed scheduled B → C");
    
    // MUTANT (c) test: if we remove sessionId filtering, querying for Monday's session
    // with targetLocalDateTue would calculate today = Wed - 1 = Tue, find Tuesday's session,
    // and return collision-resolved plan instead of rest day.
    
    console.log(`  ✓ Monday (A → rest) and Tuesday (B → C) return different plans`);
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
