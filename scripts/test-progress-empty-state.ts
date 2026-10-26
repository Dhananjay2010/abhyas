#!/usr/bin/env tsx
/**
 * Real render tests for Progress page empty state (Task G11).
 * 
 * Tests using the real ProgressPage server component.
 */

import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/progress", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window","document","HTMLElement","Node","navigator","MouseEvent","Event","getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true; g.self = dom.window; (dom.window as unknown as Record<string, unknown>).requestIdleCallback ??= (cb: () => void) => setTimeout(cb, 0); g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

// fake supabase state per scenario
let fake: { tables: Record<string, unknown[]>; rpc: Record<string, unknown>; profile: Record<string, unknown>; errors?: Record<string, unknown> } = { tables: {}, rpc: {}, profile: {} };
function chain(table: string) {
  const result = table === "profiles" ? { data: fake.profile, error: null } : fake.errors?.[table] ? { data: null, error: fake.errors[table] } : { data: fake.tables[table] ?? [], error: null };
  const c: Record<string, unknown> = {};
  for (const m of ["select","eq","neq","order","limit","in","gte","lte"]) c[m] = () => c;
  c.single = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return c;
}
const fakeClient = { from: (t: string) => chain(t), rpc: (n: string) => Promise.resolve({ data: fake.rpc[n] ?? null, error: null }) };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") return {
    useRouter: () => ({ push() {}, refresh() {}, replace() {}, prefetch() {}, back() {}, forward() {} }),
    redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  };
  if (id === "next/cache") return { revalidatePath() {} };
  if (id === "./actions") return { logBodyWeight: async () => ({ ok: true }) };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: fakeClient, user: { id: "u1" } }) };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`); }

(async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: ProgressPage } = await import("../src/app/progress/page");
  
  async function renderProgress(label: string) {
    const el = await ProgressPage();
    const html = renderToStaticMarkup(el as React.ReactElement);
    console.log(`\n${label}`);
    return html;
  }
  
  const strengthProfile = { timezone: "UTC", onboarding_completed_at: "2026-01-01", units: "kg", primary_track: "weights" };
  const emptyRpc = { progress_summary: { days_trained: 0, local_dates: [], total_volume_kg: 0, session_count: 0 }, get_session_set_counts: [] };

  fake = { profile: strengthProfile, tables: {}, rpc: emptyRpc };
  {
    const html = await renderProgress("P1: brand-new strength member, no data");
    check("empty state shown", html.includes("No progress data yet"));
    check("CTA /today", html.includes('href="/today"'));
    check("no stat tiles", !html.includes("Best streak"));
    check("Log weight control available", html.includes("Body weight"), "LogWeight hidden");
  }

  fake = { profile: strengthProfile, tables: { body_metrics: [{ recorded_on: "2026-10-20", weight_kg: 81.4 }] }, rpc: emptyRpc };
  {
    const html = await renderProgress("P2: strength member, 1 body-weight entry, no sessions");
    check("empty state shown (no session data)", html.includes("No progress data yet"));
    check("zero stat tiles NOT shown", !html.includes("Best streak"), "shows zero tiles");
    check("single body-weight value shown (81.4)", html.includes("81.4"), "value not rendered");
    check("weigh-in hint copy", /Log another weigh-in to see a trend/.test(html));
    check("no <svg> in single-point", !html.match(/<p[^>]*81\.4[\s\S]{0,100}<svg/), "svg rendered for 1 point");
  }

  const yogaProfile = { ...strengthProfile, primary_track: "yoga" };
  fake = { profile: yogaProfile, tables: { body_metrics: [{ recorded_on: "2026-10-20", weight_kg: 60 }, { recorded_on: "2026-10-13", weight_kg: 61 }] }, rpc: emptyRpc };
  {
    const html = await renderProgress("P3: yoga member, 2 body-weight entries, no sessions");
    check("body-weight chart visible", html.includes("Body weight"), "empty state hides chart");
    check("CTA shown (no sessions)", html.includes('href="/today"'));
  }

  fake = {
    profile: strengthProfile,
    tables: {
      sessions: [{ id: "s1", local_date: "2026-10-20", status: "completed", actual_type: "weights", is_deload: false, duration_seconds: 3000 }],
      session_volume: [{ local_date: "2026-10-20", volume_kg: 2400, set_count: 12, duration_seconds: 3000 }],
      exercise_strength_history: [{ exercise_id: "e1", exercise_name: "Back Squat", local_date: "2026-10-20", best_e1rm: 116.67, top_weight_kg: 100 }],
    },
    rpc: { progress_summary: { days_trained: 1, local_dates: ["2026-10-20"], total_volume_kg: 2400, session_count: 1 }, get_session_set_counts: [{ session_id: "s1", set_count: 12 }] },
  };
  {
    const html = await renderProgress("P4: strength member, exactly one session");
    check("single-point strength value (116.67)", /116\.(67|7)/.test(html), "only text");
    check("single volume value (2,400)", /2,?400/.test(html), "only text");
    check("no <svg> in strength single-point", !html.match(/>116\.6[\s\S]{0,100}<svg/), "svg for 1 point");
  }

  fake = { profile: strengthProfile, tables: {}, rpc: emptyRpc, errors: { body_metrics: { message: "boom" } } };
  {
    const html = await renderProgress("P5: new strength member, body_metrics query fails");
    check("real LogWeight button rendered", html.includes("Log today&#x27;s weight") || html.includes("Log today's weight"), "LogWeight missing");
    check("empty state suppressed on weight error", !html.includes("No progress data yet"));
    check("load-error banner shown", html.includes("Couldn&#x27;t load") || html.includes("Couldn't load"), "error hidden behind zero tiles");
    check("does not claim 'Log your weight below' on error", !html.includes("Log your weight below to start tracking"), "error masked as empty");
  }
  for (const t of ["session_volume", "exercise_strength_history", "sessions"]) {
    fake = { profile: strengthProfile, tables: {}, rpc: emptyRpc, errors: { [t]: { message: "boom" } } };
    const html = await renderProgress(`P6: new strength member, ${t} query fails`);
    check(`${t} error: empty state suppressed`, !html.includes("No progress data yet"));
    check(`${t} error: banner shown`, html.includes("Couldn&#x27;t load") || html.includes("Couldn't load"), "error hidden");
  }

  console.log("\n5. Charts with 1 point render SinglePoint");
  {
    const { LineChart, BarChart } = await import("../src/components/charts");
    const onePoint = [{ label: "20 Oct", value: 81.4 }];
    const lineHtml = renderToStaticMarkup(React.createElement(LineChart, { points: onePoint, unit: "kg", title: "Test" }));
    check("LineChart 1 point: has data-testid", lineHtml.includes('data-testid="single-point"'));
    check("LineChart 1 point: shows value", lineHtml.includes("81.4"));
    check("LineChart 1 point: no <svg>", !lineHtml.includes("<svg"));
    check("LineChart 1 point: shows default hint", lineHtml.includes("Log another session to see a trend"));
    
    const barHtml = renderToStaticMarkup(React.createElement(BarChart, { points: onePoint, unit: "kg", title: "Test" }));
    check("BarChart 1 point: has data-testid", barHtml.includes('data-testid="single-point"'));
    check("BarChart 1 point: no <svg>", !barHtml.includes("<svg"));
    check("BarChart 1 point: shows default hint", barHtml.includes("Log another session to see a trend"));
  }

  console.log("\n6. Charts with 2 points render <svg>");
  {
    const { LineChart, BarChart } = await import("../src/components/charts");
    const twoPoints = [{ label: "20 Oct", value: 81.4 }, { label: "21 Oct", value: 82.0 }];
    const lineHtml = renderToStaticMarkup(React.createElement(LineChart, { points: twoPoints, unit: "kg", title: "Test" }));
    check("LineChart 2 points: renders <svg>", lineHtml.includes("<svg"));
    check("LineChart 2 points: no data-testid", !lineHtml.includes('data-testid="single-point"'));
    
    const barHtml = renderToStaticMarkup(React.createElement(BarChart, { points: twoPoints, unit: "kg", title: "Test" }));
    check("BarChart 2 points: renders <svg>", barHtml.includes("<svg"));
  }

  console.log(failures ? `\n${failures} FAIL` : "\nAll progress tests passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
