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
import { nextDayPlan, plannableDays } from "../src/lib/program/day-plan";
import type { Database } from "../src/lib/database.types";

type Tables = Database["public"]["Tables"];
type Session = Tables["sessions"]["Row"];
type ProgramDay = Tables["program_days"]["Row"];
type Program = Tables["programs"]["Row"];
type Profile = Omit<Tables["profiles"]["Row"], "id" | "user_id" | "created_at" | "updated_at">;

const PROGRAM_DAYS: ProgramDay[] = [
  { id: "pd-1", day_index: 1, day_type: "weights", label: "Upper", program_id: "p1", status: "active", created_at: "", updated_at: "" },
  { id: "pd-2", day_index: 2, day_type: "weights", label: "Lower", program_id: "p1", status: "active", created_at: "", updated_at: "" },
  { id: "pd-3", day_index: 3, day_type: "rest", label: null, program_id: "p1", status: "active", created_at: "", updated_at: "" },
  { id: "pd-4", day_index: 4, day_type: "weights", label: "Upper", program_id: "p1", status: "active", created_at: "", updated_at: "" },
  { id: "pd-5", day_index: 5, day_type: "weights", label: "Lower", program_id: "p1", status: "active", created_at: "", updated_at: "" },
  { id: "pd-6", day_index: 6, day_type: "rest", label: null, program_id: "p1", status: "active", created_at: "", updated_at: "" },
  { id: "pd-7", day_index: 7, day_type: "rest", label: null, program_id: "p1", status: "active", created_at: "", updated_at: "" },
];

const PROGRAMS: Program[] = [
  { id: "p1", user_id: "u1", split_type: "upper_lower", status: "active", name: "Test", created_at: "", updated_at: "", current_block: 1 },
];

const PROFILES: Profile[] = [
  { primary_track: "weights", has_all_equipment: true, timezone: "Asia/Kolkata", units: "metric" },
];

function createStubFetch(sessions: Session[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("/programs?") && method === "GET") {
      let filtered = [...PROGRAMS];
      if (url.includes("status=eq.active")) {
        filtered = filtered.filter(p => p.status === "active");
      }
      return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("/profiles?") && method === "GET") {
      return new Response(JSON.stringify(PROFILES), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("/sessions?") && method === "GET") {
      let filtered = [...sessions];
      
      if (url.includes("user_id=eq.")) {
        const userId = url.match(/user_id=eq\.([^&]+)/)?.[1];
        if (userId) filtered = filtered.filter(s => s.user_id === userId);
      }
      if (url.includes("id=eq.")) {
        const id = url.match(/id=eq\.([^&]+)/)?.[1];
        if (id) filtered = filtered.filter(s => s.id === id);
      }
      if (url.includes("status=in.(")) {
        const statuses = url.match(/status=in\.\(([^)]+)\)/)?.[1]?.split(",") ?? [];
        filtered = filtered.filter(s => statuses.includes(s.status));
      }
      if (url.includes("actual_type=in.(")) {
        const types = url.match(/actual_type=in\.\(([^)]+)\)/)?.[1]?.split(",") ?? [];
        filtered = filtered.filter(s => s.actual_type && types.includes(s.actual_type));
      }
      if (url.includes("local_date=eq.")) {
        const date = url.match(/local_date=eq\.([^&]+)/)?.[1];
        if (date) filtered = filtered.filter(s => s.local_date === date);
      }
      if (url.includes("order=created_at.desc")) {
        filtered.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      }
      if (url.includes("limit=1")) {
        filtered = filtered.slice(0, 1);
      }
      
      return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("/program_days?") && method === "GET") {
      let filtered = [...PROGRAM_DAYS];
      if (url.includes("program_id=eq.")) {
        const programId = url.match(/program_id=eq\.([^&]+)/)?.[1];
        if (programId) filtered = filtered.filter(d => d.program_id === programId);
      }
      if (url.includes("status=eq.active")) {
        filtered = filtered.filter(d => d.status === "active");
      }
      if (url.includes("order=day_index")) {
        filtered.sort((a, b) => (a.day_index ?? 0) - (b.day_index ?? 0));
      }
      return new Response(JSON.stringify(filtered), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

async function main() {
  console.log("\nQA MED-2: Prompt and strip Next up agreement\n");

  const sessions: Session[] = [
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
      exercises_completed: 0,
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

  const stripResult = await plannableDays(supabase, "p1", {
    afterDate: "2026-10-26",
    userId: "u1",
    justDone: {
      programDayId: "pd-1",
      actualType: "weights",
      localDate: "2026-10-26",
    },
  });

  const nextUpDay = stripResult.find(d => d.nextUp);
  assert.ok(nextUpDay, "Strip should have Next up badge");
  console.log(`  Strip label: ${nextUpDay.label}`);

  assert.strictEqual(promptResult.plannedLabel, nextUpDay.label, "Prompt and strip should agree");
  console.log(`\n  ✓ Both agree: ${promptResult.plannedLabel}\n`);

  console.log("✓ QA MED-2: Prompt and strip agree (Fixes MED-2)\n");
}

main().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
