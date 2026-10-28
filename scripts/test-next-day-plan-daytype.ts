#!/usr/bin/env tsx
/**
 * Test: nextDayPlan dayType field
 * 
 * Regression test for dayType in NextDayPlan result. The runner's yoga test
 * hand-sets dayType, so a mutant that forces rest to 'weights' in nextDayPlanCore
 * survives. These tests assert the actual dayType from nextDayPlan/nextDayPlanCore.
 */

import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

type ProgramDay = {
  id: string;
  program_id: string;
  day_index: number;
  day_type: DayType;
  label: string | null;
  status: string;
};

type Session = {
  id: string;
  user_id: string;
  program_day_id: string | null;
  actual_type: string | null;
  local_date: string;
  status: string;
  created_at: string;
};

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
    if (key === "select" || key === "order" || key === "limit") continue;

    if (value.startsWith("eq.")) {
      const val = value.substring(3);
      result = result.filter((row) => String(row[key]) === val);
      continue;
    }

    if (value.startsWith("in.(")) {
      const vals = value.substring(4, value.length - 1).split(",").map(v => v.replace(/"/g, "").trim());
      result = result.filter((row) => {
        const rowVal = row[key];
        return rowVal != null && vals.includes(String(rowVal));
      });
      continue;
    }

    if (value.startsWith("lte.")) {
      const val = value.substring(4);
      result = result.filter((row) => {
        const fieldVal = row[key];
        return fieldVal != null && String(fieldVal) <= val;
      });
      continue;
    }
  }

  const orderParam = params.get("order");
  if (orderParam) {
    const parts = orderParam.split(",");
    for (const part of parts) {
      const [field, dir] = part.split(".");
      const ascending = dir !== "desc";
      result = result.slice().sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return ascending ? 1 : -1;
        if (bVal == null) return ascending ? -1 : 1;
        const aStr = String(aVal);
        const bStr = String(bVal);
        if (aStr < bStr) return ascending ? -1 : 1;
        if (aStr > bStr) return ascending ? 1 : -1;
        return 0;
      });
    }
  }

  const limitParam = params.get("limit");
  if (limitParam) {
    result = result.slice(0, parseInt(limitParam, 10));
  }

  return result;
}

function buildClient(scenario: {
  sessions: Session[];
  programDays: ProgramDay[];
  programs?: Array<{ id: string; user_id: string; split_type: string; status: string }>;
}): ReturnType<typeof createClient<Database>> {
  const stubFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const path = url.pathname;
    const params = url.searchParams;

    if (path.includes("/programs")) {
      const filtered = applyFilters(scenario.programs ?? [], params);
      return rows(filtered, accept);
    }

    if (path.includes("/program_days")) {
      const filtered = applyFilters(scenario.programDays, params);
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
  console.log("\nnextDayPlan dayType assertions\n");

  const { nextDayPlan } = await import("../src/lib/program/day-plan");

  const days3Full: ProgramDay[] = [
    { id: "A", program_id: "prog-1", day_index: 1, day_type: "weights", label: "Full Body A", status: "active" },
    { id: "rest-2", program_id: "prog-1", day_index: 2, day_type: "rest", label: null, status: "active" },
    { id: "B", program_id: "prog-1", day_index: 3, day_type: "weights", label: "Full Body B", status: "active" },
    { id: "rest-4", program_id: "prog-1", day_index: 4, day_type: "rest", label: null, status: "active" },
    { id: "C", program_id: "prog-1", day_index: 5, day_type: "weights", label: "Full Body C", status: "active" },
    { id: "yoga-6", program_id: "prog-1", day_index: 6, day_type: "yoga", label: "Yoga", status: "active" },
    { id: "rest-7", program_id: "prog-1", day_index: 7, day_type: "rest", label: null, status: "active" },
  ];

  {
    console.log("1. Tomorrow is scheduled rest → dayType === 'rest'");

    const client = buildClient({
      programs: [{ id: "prog-1", user_id: "u1", split_type: "full_body", status: "active" }],
      programDays: days3Full,
      sessions: [],
    });

    // Today is Fri (day 5, C), tomorrow is Sat (day 6, yoga), but let's test rest
    // Actually, let's use today = day 1 (A), tomorrow = day 2 (rest)
    const result = await nextDayPlan(client, "America/New_York", "2026-10-27");

    assert.ok(result, "Should return next day plan");
    assert.strictEqual(result.dayType, "rest", "Tomorrow (day 2) should have dayType 'rest'; forcing to 'weights' in nextDayPlanCore fails this");
    assert.strictEqual(result.plannedLabel, "Rest", "Tomorrow should be Rest");

    console.log("  ✓ Scheduled rest → dayType === 'rest'\n");
  }

  {
    console.log("2. Tomorrow is scheduled yoga → dayType === 'yoga'");

    const client = buildClient({
      programs: [{ id: "prog-1", user_id: "u1", split_type: "full_body", status: "active" }],
      programDays: days3Full,
      sessions: [
        { id: "s-fri-c", user_id: "u1", program_day_id: "C", actual_type: "weights", local_date: "2026-10-30", status: "completed", created_at: "2026-10-30T10:00:00Z" },
      ],
    });

    // Today is Fri (day 5, C), tomorrow is Sat (day 6, yoga)
    const result = await nextDayPlan(client, "America/New_York", "2026-10-31");

    assert.ok(result, "Should return next day plan");
    assert.strictEqual(result.dayType, "yoga", "Tomorrow (day 6) should have dayType 'yoga'; forcing to 'weights' fails this");
    assert.strictEqual(result.plannedLabel, "Yoga", "Tomorrow should be Yoga");

    console.log("  ✓ Scheduled yoga → dayType === 'yoga'\n");
  }

  {
    console.log("3. No scheduled day tomorrow (beyond cycle) → dayType === 'rest'");

    const days2Only: ProgramDay[] = [
      { id: "A", program_id: "prog-1", day_index: 1, day_type: "weights", label: "Full Body A", status: "active" },
      { id: "B", program_id: "prog-1", day_index: 2, day_type: "weights", label: "Full Body B", status: "active" },
    ];

    const client = buildClient({
      programs: [{ id: "prog-1", user_id: "u1", split_type: "full_body", status: "active" }],
      programDays: days2Only,
      sessions: [],
    });

    // Today is Wed (day 3, beyond cycle), tomorrow is Thu (day 4, beyond cycle)
    const result = await nextDayPlan(client, "America/New_York", "2026-10-29");

    assert.ok(result, "Should return next day plan");
    assert.strictEqual(result.dayType, "rest", "Tomorrow (beyond cycle) should default to dayType 'rest'");
    assert.strictEqual(result.plannedLabel, "Rest", "Tomorrow should be Rest");

    console.log("  ✓ No scheduled day → dayType === 'rest'\n");
  }

  {
    console.log("4. Tomorrow is scheduled rest (day 7) → dayType === 'rest'");

    const client = buildClient({
      programs: [{ id: "prog-1", user_id: "u1", split_type: "full_body", status: "active" }],
      programDays: days3Full,
      sessions: [
        { id: "s-sat-yoga", user_id: "u1", program_day_id: "yoga-6", actual_type: "yoga", local_date: "2026-10-31", status: "completed", created_at: "2026-10-31T10:00:00Z" },
      ],
    });

    // Today is Sat (day 6, yoga), tomorrow is Sun (day 7, rest)
    const result = await nextDayPlan(client, "America/New_York", "2026-11-01");

    assert.ok(result, "Should return next day plan");
    assert.strictEqual(result.dayType, "rest", "Tomorrow (day 7) should have dayType 'rest'");
    assert.strictEqual(result.plannedLabel, "Rest", "Tomorrow should be Rest");

    console.log("  ✓ Scheduled rest (day 7) → dayType === 'rest'\n");
  }

  console.log("✓ All nextDayPlan dayType tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
