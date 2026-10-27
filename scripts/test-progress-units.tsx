#!/usr/bin/env tsx
/**
 * Real render tests: Progress charts in the member's units (QA3 MED-1 on #153).
 *
 * Renders the real ProgressPage (one-point and >=2-point body weight, volume and
 * strength) and the real LineChart/BarChart value tables. Imperial members must
 * never see kg, and lb values go through the shared formatWeight (0.5 lb snap) /
 * formatVolumeLifted. Based on QA Bot 3's probe qa-bot3-units.tsx.
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
  const { render, cleanup, fireEvent } = await import("@testing-library/react");
  const { default: ProgressPage } = await import("../src/app/progress/page");
  const { LineChart, BarChart } = await import("../src/components/charts");

  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  const arias = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(" | ");
  const singlePoints = (html: string) => [...html.matchAll(/data-testid="single-point">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]));
  // Every "<n> lb" value must be a whole or half pound (formatWeight snaps to 0.5 lb).
  const unsnapped = (t: string) => (t.match(/\d[\d,]*\.\d+ ?lb/g) ?? []).filter((v) => !/\.5 ?lb$/.test(v));
  async function page(units: string, tables: Record<string, unknown[]>, rpc: Record<string, unknown>) {
    fake = { profile: { timezone: "UTC", onboarding_completed_at: "2026-01-01", units, primary_track: "weights" }, tables, rpc };
    return renderToStaticMarkup((await ProgressPage()) as React.ReactElement);
  }

  const one = {
    body_metrics: [{ recorded_on: "2026-10-20", weight_kg: 81.4 }],
    sessions: [{ id: "s1", local_date: "2026-10-20", status: "completed", actual_type: "weights", is_deload: false, duration_seconds: 3000 }],
    session_volume: [{ local_date: "2026-10-20", volume_kg: 2400, set_count: 12, duration_seconds: 3000 }],
    exercise_strength_history: [{ exercise_id: "e1", exercise_name: "Back Squat", local_date: "2026-10-20", best_e1rm: 116.67, top_weight_kg: 100 }],
  };
  const oneRpc = { progress_summary: { days_trained: 1, local_dates: ["2026-10-20"], total_volume_kg: 2400, session_count: 1 }, get_session_set_counts: [{ session_id: "s1", set_count: 12 }] };
  const two = {
    body_metrics: [{ recorded_on: "2026-10-20", weight_kg: 82.1 }, { recorded_on: "2026-10-13", weight_kg: 81.4 }],
    sessions: [
      { id: "s2", local_date: "2026-10-20", status: "completed", actual_type: "weights", is_deload: false, duration_seconds: 3000 },
      { id: "s1", local_date: "2026-10-13", status: "completed", actual_type: "weights", is_deload: false, duration_seconds: 3000 },
    ],
    session_volume: [
      { local_date: "2026-10-20", volume_kg: 3100, set_count: 12, duration_seconds: 3000 },
      { local_date: "2026-10-13", volume_kg: 2400, set_count: 12, duration_seconds: 3000 },
    ],
    exercise_strength_history: [
      { exercise_id: "e1", exercise_name: "Back Squat", local_date: "2026-10-20", best_e1rm: 120.33, top_weight_kg: 105 },
      { exercise_id: "e1", exercise_name: "Back Squat", local_date: "2026-10-13", best_e1rm: 116.67, top_weight_kg: 100 },
    ],
  };
  const twoRpc = { progress_summary: { days_trained: 2, local_dates: ["2026-10-13", "2026-10-20"], total_volume_kg: 5500, session_count: 2 }, get_session_set_counts: [{ session_id: "s1", set_count: 12 }, { session_id: "s2", set_count: 12 }] };

  console.log("\nU1: imperial member, one point each (81.4 kg, 2,400 kg, e1RM 116.67 kg)");
  {
    const html = await page("imperial", one, oneRpc);
    const sp = singlePoints(html);
    console.log("  single points:", JSON.stringify(sp));
    check("U1 three single-point blocks", sp.length === 3, String(sp.length));
    check("U1 body weight single point 179.5 lb", sp.some((t) => /179\.5 lb/.test(t)), JSON.stringify(sp));
    check("U1 volume single point 5,291 lb", sp.some((t) => /5,291 lb/.test(t)), JSON.stringify(sp));
    check("U1 strength single point snapped to 257 lb (not 257.21)", sp.some((t) => /\b257 lb/.test(t)) && !/257\.21/.test(html), JSON.stringify(sp));
    check("U1 single point shows its date (20 Oct)", sp.length > 0 && sp.every((t) => t.includes("20 Oct")), JSON.stringify(sp));
    check("U1 no kg value in page text", !/\d ?kg\b/.test(text(html)), (text(html).match(/[\d,.]+ ?kg\b/g) ?? []).join(","));
    check("U1 lb values snapped to 0.5", unsnapped(text(html)).length === 0, unsnapped(text(html)).join(","));
  }

  console.log("\nU2: imperial member, two points each");
  {
    const html = await page("imperial", two, twoRpc);
    const t = text(html); const a = arias(html);
    check("U2 body-weight readout 181 lb (82.1 kg)", /\b181 lb/.test(t), t.slice(0, 0));
    check("U2 volume readout 6,834 lb (3,100 kg)", /6,834 lb/.test(t));
    check("U2 strength readout 265.5 lb (120.33 kg)", /265\.5 lb/.test(t));
    check("U2 body-weight aria in lb", /Body weight\.[^|]*latest value 181 lb/.test(a), a);
    check("U2 volume aria in lb", /Volume per session\.[^|]*most recent 6,834 lb/.test(a), a);
    check("U2 strength aria in lb", /Back Squat \(est\. 1RM\)\.[^|]*latest value 265\.5 lb/.test(a), a);
    check("U2 no kg in text or aria", !/\d ?kg\b/.test(t) && !/\d ?kg\b/.test(a), ((t + " " + a).match(/[\d,.]+ ?kg\b/g) ?? []).join(","));
    check("U2 lb values snapped to 0.5", unsnapped(t + " " + a).length === 0, unsnapped(t + " " + a).join(","));
    const axis = [...html.matchAll(/<text[^>]*font-size="9"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    console.log("  axis labels:", JSON.stringify(axis));
    check("U2 axis labels in lb (weight 181 / 179.5, volume max 6,834)", axis.includes("181") && axis.includes("179.5") && axis.includes("6,834"), JSON.stringify(axis));
  }

  console.log("\nU3: metric member, same data stays in kg");
  {
    const html = await page("metric", two, twoRpc);
    const t = text(html);
    check("U3 body weight 82.1 kg", /82\.1 kg/.test(t));
    check("U3 volume 3,100 kg", /3,100 kg/.test(t));
    check("U3 strength 120.3 kg", /120\.3 kg/.test(t));
    check("U3 no lb", !/\d ?lb\b/.test(t + arias(html)));
  }

  console.log("\nU4: value tables (Show values) in the member's units");
  {
    const pts = [{ label: "13 Oct", value: 81.4 }, { label: "20 Oct", value: 82.1 }];
    const r = render(React.createElement(LineChart, { points: pts, unit: "kg", weightUnits: "imperial", title: "Body weight" }));
    const btn = Array.from(r.container.querySelectorAll("button")).find((b) => b.textContent === "Show values");
    if (btn) fireEvent.click(btn);
    const cells = Array.from(r.container.querySelectorAll("td")).map((td) => td.textContent ?? "");
    check("U4 weight table 181 lb / 179.5 lb", cells.some((c) => c.startsWith("181 lb")) && cells.some((c) => c.startsWith("179.5 lb")), JSON.stringify(cells));
    check("U4 weight table has no kg", !cells.some((c) => /kg/.test(c)));
    cleanup();
    const vr = render(React.createElement(BarChart, { points: [{ label: "13 Oct", value: 2400 }, { label: "20 Oct", value: 3100 }], unit: "kg", volumeUnits: "imperial", title: "Volume per session" }));
    const vbtn = Array.from(vr.container.querySelectorAll("button")).find((b) => b.textContent === "Show values");
    if (vbtn) fireEvent.click(vbtn);
    const vcells = Array.from(vr.container.querySelectorAll("td")).map((td) => td.textContent ?? "");
    check("U4 volume table 6,834 lb / 5,291 lb", vcells.some((c) => c.startsWith("6,834 lb")) && vcells.some((c) => c.startsWith("5,291 lb")), JSON.stringify(vcells));
    check("U4 volume table has no kg", !vcells.some((c) => /kg/.test(c)));
    cleanup();
  }

  console.log(failures ? `\n${failures} FAIL` : "\nAll progress units tests passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });