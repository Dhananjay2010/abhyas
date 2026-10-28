#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 4 & 6: History detail page wiring.
 * 
 * Tests that the detail page actually uses buildHistoryDetailView for Volume and Duration.
 * 
 * Mutants that must FAIL this test:
 * - Page stops calling buildHistoryDetailView and computes inline
 * - Page drops warm-up filter from volume calculation
 * - Page uses inline duration formatting instead of builder
 * 
 * Uses the same mock pattern as test-qa-low-b-page-call-site.ts
 * 
 *   npx tsx scripts/test-pr169-history-detail-wiring.ts
 */

import { createRequire } from "module";
import { JSDOM } from "jsdom";
import { isValidElement } from "react";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Node", "navigator", "MouseEvent", "Event", "getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { value: Reflect.get(dom.window, k) ?? dom.window, writable: true, configurable: true });
}
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
Reflect.set(globalThis, "self", dom.window);

type FakeData = { tables: Record<string, unknown[]>; single: Record<string, unknown>; rpc: Record<string, unknown> };
let fake: FakeData = { tables: {}, single: {}, rpc: {} };

type QueryResult = { data: unknown; error: null };

function chain(table: string) {
  const list: QueryResult = { data: fake.tables[table] ?? [], error: null };
  const one: QueryResult = { data: fake.single[table] ?? null, error: null };
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "lt", "gt", "is", "not", "range"]) c[m] = () => c;
  c.single = () => Promise.resolve(one);
  c.maybeSingle = () => Promise.resolve(one);
  c.then = (res: (v: QueryResult) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(list).then(res, rej);
  return c;
}

const fakeClient = {
  from: (t: string) => chain(t),
  rpc: (n: string) => Promise.resolve({ data: fake.rpc[n] ?? null, error: null }),
  auth: { getUser: async () => ({ data: { user: { id: "u1", created_at: "2026-01-01T00:00:00Z" } }, error: null }) },
};

// Module interception
const require = createRequire(import.meta.url);
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string, ...args: unknown[]): unknown {
  if (id === "next/navigation") return {
    useRouter: () => ({ push() {}, refresh() {}, replace() {}, prefetch() {}, back() {}, forward() {} }),
    redirect: (u: string) => { throw new Error("REDIRECT " + u); },
    notFound: () => { throw new Error("NOT_FOUND"); },
  };
  if (id === "next/cache") return { revalidatePath() {} };
  if (id === "../actions") return { updateSet: async () => ({}), deleteSet: async () => ({}), updateSessionDateTime: async () => ({}), deleteSession: async () => ({}) };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: fakeClient, user: { id: "u1" } }) };
  return orig.call(this, id, ...args);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: SessionDetailPage } = await import("../src/app/history/[id]/page");

  const sid = "33333333-3333-4333-8333-333333333333";

  console.log("\nPR #169 follow-up items 4 & 6: History detail page wiring\n");

  console.log("1. Page shows '<1 min' for 30s session via buildHistoryDetailView");
  fake = {
    tables: {
      session_exercises: [
        { 
          id: "se1", 
          order_index: 0, 
          status: "completed", 
          feel: null, 
          planned_sets: 1, 
          planned_reps_min: 10, 
          planned_reps_max: 10, 
          metric: "reps", 
          exercises: { name: "Push-up" }, 
          swapped_from_exercise_id: null 
        }
      ],
      session_sets: [
        { session_exercise_id: "se1", set_number: 1, reps: 10, weight_kg: "0", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-27T10:00:30Z", logged_at: null },
      ],
    },
    single: {
      profiles: { units: "metric", timezone: "UTC", created_at: "2026-01-01T00:00:00Z" },
      sessions: { 
        id: sid, 
        local_date: "2026-10-27", 
        status: "completed", 
        actual_type: "weights", 
        duration_seconds: null, // NULL - computed as 30s from started_at to last set
        is_deload: false, 
        week_in_block: 1, 
        notes: null, 
        started_at: "2026-10-27T10:00:00Z", 
        completed_at: "2026-10-27T10:00:30Z", 
        program_days: { label: "Quick" }, 
        breathing_patterns: null, 
        breathing_logs: [] 
      },
    },
    rpc: {},
  };

  const page1 = await SessionDetailPage({ params: Promise.resolve({ id: sid }) });
  if (!isValidElement(page1)) throw new Error("Page did not return a React element");
  const html1 = renderToStaticMarkup(page1);
  const d1 = new JSDOM(html1).window.document;
  
  const stats1 = [...d1.querySelectorAll("dt")].map((dt) => ({ 
    label: dt.textContent?.trim() ?? "", 
    value: dt.nextElementSibling?.textContent?.trim() ?? "" 
  }));
  
  const timeStat1 = stats1.find((s) => s.label === "Time");
  check("Time shows '<1 min' for 30s session", timeStat1?.value === "<1 min", timeStat1?.value ?? "missing");

  console.log("\n2. Page excludes warm-ups from volume via buildHistoryDetailView");
  fake = {
    tables: {
      session_exercises: [
        { 
          id: "se2", 
          order_index: 0, 
          status: "completed", 
          feel: null, 
          planned_sets: 3, 
          planned_reps_min: 8, 
          planned_reps_max: 10, 
          metric: "reps", 
          exercises: { name: "Squat" }, 
          swapped_from_exercise_id: null 
        }
      ],
      session_sets: [
        // Warm-up sets
        { session_exercise_id: "se2", set_number: 1, reps: 5, weight_kg: "20", duration_seconds: null, is_warmup_set: true, completed_at: "2026-10-27T10:05:00Z", logged_at: null },
        { session_exercise_id: "se2", set_number: 2, reps: 5, weight_kg: "40", duration_seconds: null, is_warmup_set: true, completed_at: "2026-10-27T10:08:00Z", logged_at: null },
        // Working sets
        { session_exercise_id: "se2", set_number: 3, reps: 10, weight_kg: "60", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-27T10:12:00Z", logged_at: null },
        { session_exercise_id: "se2", set_number: 4, reps: 10, weight_kg: "60", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-27T10:16:00Z", logged_at: null },
      ],
    },
    single: {
      profiles: { units: "metric", timezone: "UTC", created_at: "2026-01-01T00:00:00Z" },
      sessions: { 
        id: sid, 
        local_date: "2026-10-27", 
        status: "completed", 
        actual_type: "weights", 
        duration_seconds: null,
        is_deload: false, 
        week_in_block: 1, 
        notes: null, 
        started_at: "2026-10-27T10:00:00Z", 
        completed_at: "2026-10-27T10:16:00Z", 
        program_days: { label: "Legs" }, 
        breathing_patterns: null, 
        breathing_logs: [] 
      },
    },
    rpc: {},
  };

  const page2 = await SessionDetailPage({ params: Promise.resolve({ id: sid }) });
  if (!isValidElement(page2)) throw new Error("Page did not return a React element");
  const html2 = renderToStaticMarkup(page2);
  const d2 = new JSDOM(html2).window.document;
  
  const stats2 = [...d2.querySelectorAll("dt")].map((dt) => ({ 
    label: dt.textContent?.trim() ?? "", 
    value: dt.nextElementSibling?.textContent?.trim() ?? "" 
  }));
  
  const volumeStat = stats2.find((s) => s.label === "Volume");
  // Expected: (10 * 60) + (10 * 60) = 1200 kg (warm-ups excluded)
  // If warm-ups included: (5*20) + (5*40) + 1200 = 1500 kg
  check("Volume excludes warm-ups", volumeStat?.value === "1,200 kg", volumeStat?.value ?? "missing");

  console.log(failures ? `\n${failures} FAIL` : "\n✨ All detail page wiring tests passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
