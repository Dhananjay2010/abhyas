#!/usr/bin/env tsx
/**
 * QA LOW B: Test the page's call site at src/app/history/[id]/page.tsx:117-120
 * 
 * This test renders the real SessionDetailPage with fake data to verify that
 * the page correctly calls buildSessionDuration with all sets, not just the
 * last set.
 * 
 * Mutants that should FAIL this test:
 * - `(sets ?? []).slice(-1)` at line 119
 * - `0 && buildSessionDuration(` at line 117
 * 
 * Run: npm run test:qa-low-b-page-call-site
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "Node", "navigator", "MouseEvent", "Event", "getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.self = dom.window;

// Fake Supabase client
let fake: { tables: Record<string, unknown[]>; single: Record<string, unknown>; rpc: Record<string, unknown> } = { tables: {}, single: {}, rpc: {} };
function chain(table: string) {
  const list = { data: fake.tables[table] ?? [], error: null };
  const one = { data: fake.single[table] ?? null, error: null };
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "lt", "gt", "is", "not", "range"]) c[m] = () => c;
  c.single = () => Promise.resolve(one);
  c.maybeSingle = () => Promise.resolve(one);
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(list).then(res, rej);
  return c;
}

const fakeClient = {
  from: (t: string) => chain(t),
  rpc: (n: string) => Promise.resolve({ data: fake.rpc[n] ?? null, error: null }),
  auth: { getUser: async () => ({ data: { user: { id: "u1", created_at: "2026-01-01T00:00:00Z" } }, error: null }) },
};

// Module interception
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") return {
    useRouter: () => ({ push() {}, refresh() {}, replace() {}, prefetch() {}, back() {}, forward() {} }),
    redirect: (u: string) => { throw new Error("REDIRECT " + u); },
    notFound: () => { throw new Error("NOT_FOUND"); },
  };
  if (id === "next/cache") return { revalidatePath() {} };
  if (id === "../actions") return { updateSet: async () => ({}), deleteSet: async () => ({}), updateSessionDateTime: async () => ({}), deleteSession: async () => ({}) };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: fakeClient, user: { id: "u1" } }) };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: SessionDetailPage } = await import("../src/app/history/[id]/page");

  const sid = "22222222-2222-4222-8222-222222222222";

  console.log("\nQA LOW B: Page call site duration rendering\n");

  console.log("1. Session with warm-ups and working sets, null duration_seconds");
  fake = {
    tables: {
      session_exercises: [
        { 
          id: "se1", 
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
        { session_exercise_id: "se1", set_number: 1, reps: 5, weight_kg: "20", duration_seconds: null, is_warmup_set: true, completed_at: "2026-10-27T10:05:00Z", logged_at: null },
        { session_exercise_id: "se1", set_number: 2, reps: 5, weight_kg: "40", duration_seconds: null, is_warmup_set: true, completed_at: "2026-10-27T10:08:00Z", logged_at: null },
        // Working sets
        { session_exercise_id: "se1", set_number: 3, reps: 10, weight_kg: "60", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-27T10:12:00Z", logged_at: null },
        { session_exercise_id: "se1", set_number: 4, reps: 10, weight_kg: "60", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-27T10:16:00Z", logged_at: null },
        { session_exercise_id: "se1", set_number: 5, reps: 10, weight_kg: "60", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-27T10:20:00Z", logged_at: null },
        // Final warm-up (cooldown)
        { session_exercise_id: "se1", set_number: 6, reps: 5, weight_kg: "20", duration_seconds: null, is_warmup_set: true, completed_at: "2026-10-27T10:23:00Z", logged_at: null },
      ],
    },
    single: {
      profiles: { units: "metric", timezone: "UTC", created_at: "2026-01-01T00:00:00Z" },
      sessions: { 
        id: sid, 
        local_date: "2026-10-27", 
        status: "completed", 
        actual_type: "weights", 
        duration_seconds: null, // NULL - page must compute from sets
        is_deload: false, 
        week_in_block: 1, 
        notes: null, 
        started_at: "2026-10-27T10:00:00Z", 
        completed_at: "2026-10-27T10:23:00Z", 
        program_days: { label: "Legs" }, 
        breathing_patterns: null, 
        breathing_logs: [] 
      },
    },
    rpc: {},
  };

  const html = renderToStaticMarkup((await SessionDetailPage({ params: Promise.resolve({ id: sid }) })) as React.ReactElement);
  const d = new JSDOM(html).window.document;
  
  // Find the duration stat
  const stats = [...d.querySelectorAll("dt")].map((dt) => ({ 
    label: dt.textContent?.trim() ?? "", 
    value: dt.nextElementSibling?.textContent?.trim() ?? "" 
  }));
  
  const timeStat = stats.find((s) => s.label === "Time");
  
  check("Time stat is present", !!timeStat, JSON.stringify(stats.map(s => s.label)));
  
  // Expected: started_at 10:00:00, last working set completed_at 10:20:00 = 20 minutes
  // (The final warm-up at 10:23:00 should be filtered out)
  check("Time is 20m (1200s from working sets only)", timeStat?.value === "20m", timeStat?.value ?? "missing");

  console.log("\n2. Critical: If page passed only last set (.slice(-1)), time would be —");
  // The last set is a warm-up at 10:23:00
  // If the page calls buildSessionDuration with only the last set, it gets filtered out
  // and the function returns null, which renders as "—"
  const expectedIfMutated = "—";
  check("Mutant would break: last set is warm-up", timeStat?.value === "20m", 
    `current=${timeStat?.value}, mutant would give ${expectedIfMutated}`);

  console.log("\n3. Sanity: Session with stored duration_seconds");
  const prevSession = fake.single.sessions as Record<string, unknown>;
  fake.single.sessions = { 
    ...prevSession, 
    duration_seconds: 1500 // 25 minutes stored
  };
  
  const html2 = renderToStaticMarkup((await SessionDetailPage({ params: Promise.resolve({ id: sid }) })) as React.ReactElement);
  const d2 = new JSDOM(html2).window.document;
  const stats2 = [...d2.querySelectorAll("dt")].map((dt) => ({ 
    label: dt.textContent?.trim() ?? "", 
    value: dt.nextElementSibling?.textContent?.trim() ?? "" 
  }));
  const timeStat2 = stats2.find((s) => s.label === "Time");
  
  check("Stored duration_seconds takes precedence", timeStat2?.value === "25m", timeStat2?.value ?? "missing");

  console.log(failures ? `\n${failures} FAIL` : "\n✨ All page call site tests passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
