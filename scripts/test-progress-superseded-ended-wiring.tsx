#!/usr/bin/env tsx
/**
 * MED-2(a) wiring test: render the REAL Progress page (src/app/progress/page.tsx)
 * for a member whose ENDED block was marked 'superseded' (so the page's
 * `.neq("status", "superseded")` programs query drops it) while it still holds
 * completed weights sessions, plus a newer active block that starts after it.
 *
 * The page must pass `effectiveStart = progressStartDate(...)` into
 * buildDayRecords; without it the superseded block's sessions vanish from
 * Days trained and the best streak. Harness pattern copied from
 * scripts/test-progress-empty-state.ts (fake client + module stubs), with the
 * fake honouring eq/neq filters so the superseded exclusion is real.
 *
 * Mutant M-A in scripts/test-rebuild-rollover-mutants.sh removes
 * `effectiveStart` from the page's buildDayRecords call; this test must then
 * fail by assertion ("❌ FAIL").
 *
 *   npx tsx scripts/test-progress-superseded-ended-wiring.tsx
 */

// ---- pin the clock: 2026-10-27 (a Tuesday) 10:00 UTC --------------------
const FIXED_NOW = Date.UTC(2026, 9, 27, 10, 0, 0);
{
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(FIXED_NOW);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else super(...(args as [any]));
    }
    static now() { return FIXED_NOW; }
  }
  (globalThis as unknown as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
}

import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/progress", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window","document","HTMLElement","Node","navigator","MouseEvent","Event","getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true; g.self = dom.window; (dom.window as unknown as Record<string, unknown>).requestIdleCallback ??= (cb: () => void) => setTimeout(cb, 0); g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

type Row = Record<string, unknown>;
let fake: { tables: Record<string, Row[]>; rpc: Record<string, unknown>; profile: Row } = { tables: {}, rpc: {}, profile: {} };

/** Chain that applies eq/neq filters to the table rows, like PostgREST would. */
function chain(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const c: Record<string, unknown> = {};
  for (const m of ["select","order","limit","in","gte","lte"]) c[m] = () => c;
  c.eq = (col: string, val: unknown) => { if (table !== "profiles") filters.push((r) => !(col in r) || r[col] === val); return c; };
  c.neq = (col: string, val: unknown) => { filters.push((r) => r[col] !== val); return c; };
  const result = () => table === "profiles"
    ? { data: fake.profile, error: null }
    : { data: (fake.tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
  c.single = () => Promise.resolve(result());
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
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
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

/** Pull the rendered value of a StatTile by its label. */
function tile(html: string, label: string): string | null {
  const re = new RegExp(`<p[^>]*>${label}</p><p[^>]*>([^<]*)</p>`);
  return html.match(re)?.[1] ?? null;
}

(async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { localDateString } = await import("../src/lib/dates");
  const { default: ProgressPage } = await import("../src/app/progress/page");

  check("clock pinned: today (UTC) is 2026-10-27", localDateString("UTC") === "2026-10-27", localDateString("UTC"));

  const profile = { timezone: "UTC", onboarding_completed_at: "2026-01-01", units: "kg", primary_track: "weights" };
  // Mon/Wed/Fri weights, everything else rest (ISO weekday 1..7).
  const schedule = (programId: string, status: string) =>
    [1, 2, 3, 4, 5, 6, 7].map((d) => ({ program_id: programId, day_index: d, status, day_type: d === 1 || d === 3 || d === 5 ? "weights" : "rest" }));

  // Completed weights sessions. Block A (ended 2026-10-11): Mon 5, Wed 7, Fri 9 Oct.
  // Block B (active from Mon 12 Oct): 12, 14, 16, then Mon 19 MISSED, then 21, 23, 26.
  const dates = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-21", "2026-10-23", "2026-10-26"];
  const sessions = dates.map((d, i) => ({ id: `s${i}`, local_date: d, status: "completed", actual_type: "weights", is_deload: false, duration_seconds: 3000 }))
    .sort((a, b) => b.local_date.localeCompare(a.local_date));
  const setCounts = sessions.map((s) => ({ session_id: s.id, set_count: 9 }));

  function fixture(blockAStatus: "superseded" | "completed") {
    return {
      profile,
      tables: {
        programs: [
          { id: "pA", status: blockAStatus, started_on: "2026-09-28", ends_on: "2026-10-25", ended_on: "2026-10-11", created_at: "2026-09-28T00:00:00Z" },
          { id: "pB", status: "active", started_on: "2026-10-12", ends_on: "2026-11-08", ended_on: null, created_at: "2026-10-12T00:00:00Z" },
        ],
        program_days: [...schedule("pA", blockAStatus === "superseded" ? "superseded" : "active"), ...schedule("pB", "active")],
        sessions,
      },
      rpc: {
        progress_summary: { days_trained: 9, local_dates: dates, total_volume_kg: 0, session_count: 9 },
        get_session_set_counts: setCounts,
      },
    };
  }

  console.log("\nW1: ended block 'superseded' with 3 completed weights sessions, newer active block after it");
  fake = fixture("superseded");
  // Sanity: the fake really drops the superseded block, as the real query would.
  const visible = (await (fakeClient.from("programs") as unknown as { neq: (c: string, v: string) => PromiseLike<{ data: Row[] }> }).neq("status", "superseded")).data;
  check("fixture: programs query (.neq superseded) returns only pB", visible.length === 1 && visible[0].id === "pB", JSON.stringify(visible.map((p) => p.id)));
  const html = renderToStaticMarkup((await ProgressPage()) as ReactElement);
  const days = tile(html, "Days trained"), best = tile(html, "Best streak"), cur = tile(html, "Streak");
  check("Days trained renders exactly 9 (3 in superseded block + 6 in active block)", days === "9", `got ${days}`);
  check("Best streak renders exactly 6 (5,7,9,12,14,16 Oct; broken by missed Mon 19)", best === "6", `got ${best}`);
  check("Current streak renders exactly 3 (21, 23, 26 Oct; today Tue rest)", cur === "3", `got ${cur}`);
  check("empty state not shown", !html.includes("No progress data yet"));

  console.log("\nW2: control - same history with the ended block correctly 'completed'");
  fake = fixture("completed");
  const html2 = renderToStaticMarkup((await ProgressPage()) as ReactElement);
  const d2 = tile(html2, "Days trained"), b2 = tile(html2, "Best streak"), c2 = tile(html2, "Streak");
  check("completed-block control: Days trained 9", d2 === "9", `got ${d2}`);
  check("completed-block control: Best streak 6", b2 === "6", `got ${b2}`);
  check("completed-block control: Streak 3", c2 === "3", `got ${c2}`);
  check("superseded and completed render identical stats", days === d2 && best === b2 && cur === c2, `${days}/${best}/${cur} vs ${d2}/${b2}/${c2}`);

  console.log(failures ? `\n❌ ${failures} FAIL` : "\n✅ All superseded-ended Progress wiring checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
