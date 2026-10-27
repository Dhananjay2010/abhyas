#!/usr/bin/env tsx
/**
 * Real renders: weights shown to the member go through the shared
 * formatWeight in their unit (0.5 lb snap), not raw kg numbers.
 *
 * 1. Progress strength (e1RM) LineChart: headline, aria-label, axis and the
 *    "Show values" table, kg and lb (QA3 MED-2).
 * 2. The real ProgressPage passes the member's unit to the strength chart.
 * 3. The real History detail page set list, kg and lb (QA3 LOW-7).
 *
 * Run: npm run test:weight-display-units
 */
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "Node", "navigator", "MouseEvent", "Event", "getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.self = dom.window;

// Fake Supabase: every query resolves to fake.tables[table]; single/maybeSingle to fake.single[table]
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
  if (id === "./actions") return { logBodyWeight: async () => ({ ok: true }) };
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
  const { render, cleanup, fireEvent } = await import("@testing-library/react");
  const { LineChart } = await import("../src/components/charts");
  const { buildStrengthChartsFromDescendingRows } = await import("../src/lib/progress/strength-charts");
  const { formatWeight } = await import("../src/lib/units");

  // 50.00 kg then 54.58 kg (44.25×7). formatWeight: 54.5 kg / 120.5 lb (120.33 raw)
  const rows = [
    { exercise_id: "e1", exercise_name: "Bench", local_date: "2026-10-20", best_e1rm: 54.58, top_weight_kg: 44.25 },
    { exercise_id: "e1", exercise_name: "Bench", local_date: "2026-10-13", best_e1rm: 50, top_weight_kg: 42.5 },
  ];

  for (const [units, latest, older, raw] of [["metric", "54.5 kg", "50 kg", "54.58"], ["imperial", "120.5 lb", "110 lb", "120.33"]] as const) {
    console.log(`\n1. Strength e1RM LineChart, ${units}`);
    const [chart] = buildStrengthChartsFromDescendingRows(rows, (d) => d, units);
    const r = render(React.createElement(LineChart, { points: chart.points, unit: chart.unitLabel, weightUnits: chart.units, title: "Bench (est. 1RM)", height: 110 }));
    const html = r.container.innerHTML;
    check(`${units}: readout shows ${latest}`, r.container.querySelector("p.mt-1 span.font-semibold")?.textContent === latest,
      r.container.querySelector("p.mt-1 span.font-semibold")?.textContent ?? "missing");
    check(`${units}: aria-label uses ${latest}`, (r.container.querySelector("svg")?.getAttribute("aria-label") ?? "").includes(`latest value ${latest}`));
    check(`${units}: raw ${raw} never shown`, !html.includes(raw));
    const axis = [...r.container.querySelectorAll("svg text")].map((t) => t.textContent ?? "");
    // niceBounds([50, 54.58]) = [49.4504, 55.1296]
    const hi = formatWeight(55.1296, units, false, "0"), lo = formatWeight(49.4504, units, false, "0");
    check(`${units}: axis ticks via formatWeight (${hi} / ${lo})`, axis[0] === hi && axis[1] === lo, `axis=${JSON.stringify(axis.slice(0, 2))}`);
    fireEvent.click(r.getByText("Show values"));
    const cells = [...r.container.querySelectorAll("table td.text-right")].map((td) => td.textContent ?? "");
    check(`${units}: values table ${latest}, ${older}`, cells[0] === latest && cells[1] === older, JSON.stringify(cells));
    cleanup();
    const single = renderToStaticMarkup(React.createElement(LineChart, { points: chart.points.slice(1), unit: chart.unitLabel, weightUnits: chart.units, title: "t" }));
    check(`${units}: single-point headline ${latest}`, single.includes(`>${latest}<`), single.slice(0, 120));
  }

  console.log("\n2. Real ProgressPage passes the member's unit to the strength chart");
  const { default: ProgressPage } = await import("../src/app/progress/page");
  for (const [units, latest, raw] of [["metric", "54.5 kg", "54.58"], ["imperial", "120.5 lb", "120.33"]] as const) {
    fake = {
      tables: { exercise_strength_history: rows },
      single: { profiles: { timezone: "UTC", onboarding_completed_at: "2026-01-01", units, primary_track: "weights" } },
      rpc: { progress_summary: { days_trained: 2, local_dates: ["2026-10-13", "2026-10-20"], total_volume_kg: 0, session_count: 2 } },
    };
    const html = renderToStaticMarkup((await ProgressPage()) as React.ReactElement);
    check(`Progress ${units}: strength readout ${latest}`, html.includes(`>${latest}<`));
    check(`Progress ${units}: no raw ${raw}`, !html.includes(raw));
  }

  console.log("\n3. Real History detail page: set weights in the member's unit");
  const { default: SessionDetailPage } = await import("../src/app/history/[id]/page");
  const sid = "11111111-1111-4111-8111-111111111111";
  for (const [units, a, b] of [["metric", "Set 1", "8 reps · 44.25 kg"], ["imperial", "Set 1", "8 reps · 97.5 lb"]] as const) {
    fake = {
      tables: {
        session_exercises: [{ id: "se1", order_index: 0, status: "completed", feel: null, planned_sets: 2, planned_reps_min: 8, planned_reps_max: 10, metric: "reps", exercises: { name: "Bench" }, swapped_from_exercise_id: null }],
        session_sets: [
          { session_exercise_id: "se1", set_number: 1, reps: 8, weight_kg: "44.25", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-20T10:10:00Z" },
          { session_exercise_id: "se1", set_number: 2, reps: 5, weight_kg: "100.00", duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-20T10:15:00Z" },
        ],
      },
      single: {
        profiles: { units, timezone: "UTC", created_at: "2026-01-01T00:00:00Z" },
        sessions: { id: sid, local_date: "2026-10-20", status: "completed", actual_type: "weights", duration_seconds: 1800, is_deload: false, week_in_block: 1, notes: null, started_at: "2026-10-20T10:00:00Z", completed_at: "2026-10-20T10:30:00Z", program_days: { label: "Push" }, breathing_patterns: null, breathing_logs: [] },
      },
      rpc: {},
    };
    const html = renderToStaticMarkup((await SessionDetailPage({ params: Promise.resolve({ id: sid }) })) as React.ReactElement);
    const d = new JSDOM(html).window.document;
    const items = [...d.querySelectorAll("ol li ul li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim() ?? "");
    const heavy = units === "metric" ? "5 reps · 100 kg" : "5 reps · 220.5 lb";
    check(`History ${units}: ${a} shows "${b}"`, items[0] === `${a}${b}`, JSON.stringify(items));
    check(`History ${units}: Set 2 shows "${heavy}"`, items[1] === `Set 2${heavy}`, JSON.stringify(items));
    if (units === "imperial") check("History imperial: no kg in set list", !items.some((t) => t.includes("kg")), JSON.stringify(items));
  }

  console.log(failures ? `\n${failures} FAIL` : "\nAll weight display unit tests passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
