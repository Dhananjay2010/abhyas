#!/usr/bin/env tsx
/**
 * QA1 MED-1 / MED-B, LOW-1, LOW-2 (PR #166 r5): end-to-end through the REAL
 * session page server component and the REAL SessionRunner + DayPlanPrompt.
 *
 * The page runs against a fake Supabase client that honours eq/in/lte/gte,
 * order and limit, so the real nextDayPlan / plannableDays / resolveDay /
 * planTargetDate decide what the summary offers. The props the page hands to
 * SessionRunner are then rendered by the real runner, the session is finished
 * through the real cool-down button, and the summary prompt is driven in the
 * DOM.
 *
 *   Surface 1 (rest list, "Train anyway"):
 *     N1  QA1's 4-day repro: Upper Mon done, Lower Tue finished, Wed rest ->
 *         "Upper [Next up]" first; Lower neither first nor badged.
 *     N2  3-day: Full Body A finished Mon, Tue rest -> B is Next up, not A.
 *   Surface 2 (summary "Swap the day"):
 *     N3  4-day: Upper finished Mon -> Tue Lower; the swap list has
 *         "Lower [Next up]" first and Upper unbadged.
 *   N4  LOW-2: a Tue session finished 00:20 IST Wed plans Wed: the copy says
 *       "Today", never "Tomorrow".
 *   N5  LOW-1: the confirmation stays on screen; Today is refreshed only after
 *       SESSION_CONFIRM_MS, through refreshAfterSession (not planDay).
 *   N6  planTargetLabel / planPromptHeading units (weekday for today+2).
 *   N7  QA3 X2: the page's MED-4 date check uses the profile timezone (LA),
 *       not UTC or the server's zone.
 *   N5 also pins that the runner sends the day it showed (QA3 LOW-1).
 *   N8  a free session (no program day) does not move Next up.
 *
 *   npx tsx scripts/test-next-up-after-session-wiring.tsx
 */
import "./helpers/setup-jsdom";

export {};

let NOW = Date.UTC(2026, 9, 27, 16, 30, 0);
{
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(NOW);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else super(...(args as [any]));
    }
    static now() { return NOW; }
  }
  (globalThis as unknown as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
}

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const SESSION_ID = "11111111-2222-4333-8444-555555555555";

// Fixture state, set per case.
let PROGRAM_DAYS: Row[] = [];
let SESSIONS: Row[] = [];
let PROFILE_TZ = "Asia/Kolkata";

/** 4-day upper/lower: Mon Upper, Tue Lower, Thu Upper, Fri Lower (ISO day_index). */
function fourDay(): Row[] {
  const lab: Record<number, string> = { 1: "Upper", 2: "Lower", 4: "Upper", 5: "Lower" };
  return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    id: `pd-${d}`, day_index: d, day_type: lab[d] ? "weights" : "rest", label: lab[d] ?? null,
    program_id: "p1", status: "active",
  }));
}
/** 3-day full body: Mon A, Wed B, Fri C. */
function threeDay(): Row[] {
  const lab: Record<number, string> = { 1: "Full Body A", 3: "Full Body B", 5: "Full Body C" };
  return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    id: `pd-${d}`, day_index: d, day_type: lab[d] ? "weights" : "rest", label: lab[d] ?? null,
    program_id: "p1", status: "active",
  }));
}
function sessionRow(over: Row): Row {
  return {
    id: SESSION_ID, user_id: "u1", status: "in_progress", local_date: "2026-10-27",
    program_day_id: null, actual_type: "weights", is_deload: false, week_in_block: 1,
    warmup_completed: true, started_at: new Date(NOW - 3600_000).toISOString(),
    created_at: new Date(NOW - 3600_000).toISOString(), session_exercises: [], ...over,
  };
}

function reply(table: string, filters: Filter[], orders: Array<[string, boolean]>, limit: number | null, single: boolean) {
  let rows: Row[];
  switch (table) {
    case "sessions": rows = SESSIONS; break;
    case "program_days": rows = PROGRAM_DAYS; break;
    case "programs": return { data: { id: "p1", user_id: "u1", split_type: "upper_lower" }, error: null };
    case "profiles": return { data: { primary_track: "weights", has_all_equipment: true, timezone: PROFILE_TZ, units: "metric" }, error: null };
    case "user_settings": return { data: {}, error: null };
    default: return { data: single ? null : [], error: null };
  }
  let hit = rows.filter((r) => filters.every((f) => f(r)));
  if (orders.length) {
    hit = [...hit].sort((a, b) => {
      for (const [col, asc] of orders) {
        const x = String(a[col] ?? ""), y = String(b[col] ?? "");
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
  }
  if (limit !== null) hit = hit.slice(0, limit);
  return { data: single ? (hit[0] ?? null) : hit, error: null };
}

/** PostgREST-ish chain honouring eq/in/lte/gte/order/limit. */
function chain(table: string) {
  const filters: Filter[] = [];
  const orders: Array<[string, boolean]> = [];
  let limit: number | null = null;
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (col: string, v: unknown) => { filters.push((r) => !(col in r) || r[col] === v); return c; };
  c.in = (col: string, v: unknown[]) => { filters.push((r) => !(col in r) || v.includes(r[col])); return c; };
  c.lte = (col: string, v: string) => { filters.push((r) => !(col in r) || String(r[col]) <= v); return c; };
  c.gte = (col: string, v: string) => { filters.push((r) => !(col in r) || String(r[col]) >= v); return c; };
  c.order = (col: string, o?: { ascending?: boolean }) => { orders.push([col, o?.ascending !== false]); return c; };
  c.limit = (n: number) => { limit = n; return c; };
  c.single = () => Promise.resolve(reply(table, filters, orders, limit, true));
  c.maybeSingle = () => Promise.resolve(reply(table, filters, orders, limit, true));
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(reply(table, filters, orders, limit, false)).then(res, rej);
  return c;
}
const fakeClient = { from: (t: string) => chain(t) };

function RunnerStub() { return null; }
const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") return {
    redirect: (u: string) => { throw new Error("REDIRECT " + u); },
    notFound: () => { throw new Error("NOT_FOUND"); },
    useRouter: () => router,
    usePathname: () => "/session/x",
    useSearchParams: () => new URLSearchParams(),
  };
  if (id === "next/cache") return { revalidatePath() {}, revalidateTag() {}, unstable_cache: (f: unknown) => f };
  if (id === "next/headers") return { headers: async () => new Map(), cookies: async () => ({ get() {}, getAll: () => [], set() {} }) };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: fakeClient, user: { id: "u1" } }), getSessionUser: async () => ({ id: "u1" }), requireUser: async () => ({ supabase: fakeClient, user: { id: "u1" } }) };
  // Only the page's own import is stubbed (to read its props); the test
  // renders the real runner through its full path below.
  if (id === "./session-runner") return { SessionRunner: RunnerStub };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: SessionPage } = await import("../src/app/session/[id]/page");
  const { SessionRunner } = await import("../src/app/session/[id]/session-runner");
  const { SESSION_CONFIRM_MS } = await import("../src/components/day-plan-prompt");
  const { planTargetLabel, planPromptHeading } = await import("../src/lib/session/resolve-plan-target-date");
  type RunnerProps = React.ComponentProps<typeof SessionRunner>;

  async function flush() {
    for (let i = 0; i < 5; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    }
  }
  const btn = (c: HTMLElement, re: RegExp) =>
    [...c.querySelectorAll("button")].find((b) => re.test(b.textContent?.trim() ?? ""));
  async function click(c: HTMLElement, re: RegExp) {
    const b = btn(c, re);
    check(`button present: ${re}`, !!b);
    if (b) await act(async () => { b.click(); });
    await flush();
  }
  /** The day buttons the prompt lists, as "Label" or "Label [Next up]", in order. */
  function dayList(c: HTMLElement, labels: string[]): string[] {
    return [...c.querySelectorAll("button")]
      .map((b) => b.textContent?.trim() ?? "")
      .filter((t) => labels.some((l) => t === l || t.startsWith(l)) && !/^(Keep|Swap|Train|Rest|Change)/.test(t))
      .map((t) => t.replace(/\s*Next up\s*$/, " [Next up]"));
  }

  /** Real page -> real runner -> finish -> summary. */
  async function summary(now: number) {
    NOW = now;
    const el = (await SessionPage({ params: Promise.resolve({ id: SESSION_ID }) })) as unknown as { type: unknown; props: RunnerProps };
    check("page renders SessionRunner", el.type === RunnerStub);
    const refreshes: number[] = [];
    const planCalls: unknown[] = [];
    const t0 = { v: 0 };
    const actions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => ({ ok: true }),
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => ({ ok: true, data: null }),
      finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 3000 } }),
      abandonSession: async () => ({ ok: true }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      swapExercise: async () => ({ ok: true, data: null }),
      refreshAfterSession: async () => { refreshes.push(globalThis.performance.now() - t0.v); return { ok: true }; },
      planDay: async (input: unknown) => { planCalls.push(input); t0.v = globalThis.performance.now(); return { ok: true }; },
      getSessionSummary: async () => ({ ok: true, data: [] }),
    } as unknown as RunnerProps["actions"];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SessionRunner, {
        ...el.props,
        startedAt: new Date(NOW - 3600_000).toISOString(),
        warmup: [], cooldown: [],
        exercises: [{
          id: "se1", exerciseId: "ex-1", name: "Bench Press", cue: null, metric: "reps", primaryMuscles: [],
          plannedSets: 1, plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, restSeconds: 90,
          workingWeightKg: 60, suggestedWeightKg: 60, status: "completed", feel: "good",
          sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null, isWarmupSet: false, completedAt: new Date(NOW - 600_000).toISOString() }],
          isBodyweight: false,
        }] as unknown as RunnerProps["exercises"],
        actions,
        timer: { setTimeout: (cb: () => void, ms: number) => globalThis.setTimeout(cb, Math.min(ms, 5)), clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id) },
      } as RunnerProps));
    });
    await flush();
    const finish = btn(container, /^Skip cool-down$/) ?? btn(container, /Finish/);
    check("finish button present", !!finish);
    if (finish) await act(async () => { finish.click(); });
    await flush();
    const done = async () => { await act(async () => { root.unmount(); }); container.remove(); };
    return { container, props: el.props, refreshes, planCalls, done };
  }

  console.log("N1 (surface 1, QA1 4-day repro): Upper Mon done, Lower Tue finished -> Wed rest -> Train anyway");
  {
    PROGRAM_DAYS = fourDay();
    SESSIONS = [
      sessionRow({ id: "s-mon", status: "completed", local_date: "2026-10-26", program_day_id: "pd-1", created_at: "2026-10-26T12:00:00.000Z" }),
      sessionRow({ local_date: "2026-10-27", program_day_id: "pd-2" }),
    ];
    const s = await summary(Date.UTC(2026, 9, 27, 16, 30, 0)); // 22:00 IST Tue 27
    const text = s.container.textContent ?? "";
    check("rest prompt: 'Tomorrow: rest day. Train anyway?'", text.includes("Tomorrow: rest day. Train anyway?"), text.slice(-300));
    await click(s.container, /^Train anyway$/);
    const list = dayList(s.container, ["Upper", "Lower"]);
    check("list is exactly [Upper [Next up], Lower]", JSON.stringify(list) === '["Upper [Next up]","Lower"]', JSON.stringify(list));
    check("first entry is Upper with the Next up badge", list[0] === "Upper [Next up]", String(list[0]));
    check("Lower (just done) is not first", !String(list[0]).startsWith("Lower"));
    check("Lower (just done) is not badged", !list.includes("Lower [Next up]"));
    await s.done();
  }

  console.log("\nN2 (surface 1, 3-day): Full Body A finished Mon -> Tue rest -> Train anyway -> B is Next up");
  {
    PROGRAM_DAYS = threeDay();
    SESSIONS = [sessionRow({ local_date: "2026-10-26", program_day_id: "pd-1" })];
    const s = await summary(Date.UTC(2026, 9, 26, 16, 30, 0)); // 22:00 IST Mon 26
    await click(s.container, /^Train anyway$/);
    const list = dayList(s.container, ["Full Body"]);
    check("first entry is Full Body B [Next up]", list[0] === "Full Body B [Next up]", JSON.stringify(list));
    check("Full Body A (just done) is not badged", !list.includes("Full Body A [Next up]"), JSON.stringify(list));
    check("exactly one Next up badge", list.filter((l) => l.endsWith("[Next up]")).length === 1, JSON.stringify(list));
    await s.done();
  }

  console.log("\nN3 (surface 2, summary 'Swap the day'): Upper finished Mon -> Tue Lower -> swap list");
  {
    PROGRAM_DAYS = fourDay();
    SESSIONS = [sessionRow({ local_date: "2026-10-26", program_day_id: "pd-1" })];
    const s = await summary(Date.UTC(2026, 9, 26, 16, 30, 0)); // 22:00 IST Mon 26
    const text = s.container.textContent ?? "";
    check("prompt: 'Tomorrow is Lower.'", text.includes("Tomorrow is Lower."), text.slice(-300));
    await click(s.container, /^Swap the day$/);
    const list = dayList(s.container, ["Upper", "Lower"]);
    check("list is exactly [Lower [Next up], Upper]", JSON.stringify(list) === '["Lower [Next up]","Upper"]', JSON.stringify(list));
    check("Upper (just done) is not badged", !list.includes("Upper [Next up]"));
    await s.done();
  }

  console.log("\nN4 (LOW-2): Tue session finished 00:20 IST Wed -> plans Wed (today): copy says Today");
  {
    PROGRAM_DAYS = fourDay();
    SESSIONS = [
      sessionRow({ id: "s-mon", status: "completed", local_date: "2026-10-26", program_day_id: "pd-1", created_at: "2026-10-26T12:00:00.000Z" }),
      sessionRow({ local_date: "2026-10-27", program_day_id: "pd-2" }),
    ];
    const s = await summary(Date.UTC(2026, 9, 27, 18, 50, 0)); // 00:20 IST Wed 28
    check("page: tomorrow.localDate = 2026-10-28 (today)", s.props.tomorrow?.localDate === "2026-10-28", String(s.props.tomorrow?.localDate));
    check("page: tomorrowLabel = Today", s.props.tomorrowLabel === "Today", String(s.props.tomorrowLabel));
    const text = s.container.textContent ?? "";
    check("heading 'What about today?'", text.includes("What about today?"), text.slice(-300));
    check("'Today: rest day. Train anyway?'", text.includes("Today: rest day. Train anyway?"));
    check("no 'Tomorrow' / 'tomorrow' in the prompt", !/tomorrow/i.test(text.slice(text.indexOf("What about"))), text.slice(-300));
    await click(s.container, /^Keep rest$/);
    const after = s.container.textContent ?? "";
    check("settled copy 'Today is a rest day.'", after.includes("Today is a rest day."), after.slice(-200));
    check("settled copy never says Tomorrow", !after.includes("Tomorrow is"));
    await s.done();
  }

  console.log("\nN4b: same session finished 22:00 IST Tue -> label stays Tomorrow");
  {
    const s = await summary(Date.UTC(2026, 9, 27, 16, 30, 0));
    check("page: tomorrowLabel = Tomorrow", s.props.tomorrowLabel === "Tomorrow", String(s.props.tomorrowLabel));
    await s.done();
  }

  console.log(`\nN5 (LOW-1): the confirmation stays visible; Today refreshes after ${SESSION_CONFIRM_MS}ms`);
  {
    PROGRAM_DAYS = fourDay();
    SESSIONS = [sessionRow({ local_date: "2026-10-26", program_day_id: "pd-1" })];
    const s = await summary(Date.UTC(2026, 9, 26, 16, 30, 0));
    check("SESSION_CONFIRM_MS is about 1.5s", SESSION_CONFIRM_MS >= 1200 && SESSION_CONFIRM_MS <= 2000, String(SESSION_CONFIRM_MS));
    await click(s.container, /^Keep it$/);
    check("planDay called once", s.planCalls.length === 1, JSON.stringify(s.planCalls));
    check("planDay carries the day the page showed (shownDate = tomorrow.localDate)",
      (s.planCalls[0] as { shownDate?: string } | undefined)?.shownDate === s.props.tomorrow?.localDate && s.props.tomorrow?.localDate === "2026-10-27",
      JSON.stringify(s.planCalls[0]));
    check("confirmation shown right after the tap", (s.container.textContent ?? "").includes("Tomorrow is Lower."));
    check("no refresh/redirect right after the tap", s.refreshes.length === 0, JSON.stringify(s.refreshes));
    await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });
    check("confirmation still visible at ~1.0s", (s.container.textContent ?? "").includes("Tomorrow is Lower."));
    check("still no refresh at ~1.0s", s.refreshes.length === 0, JSON.stringify(s.refreshes));
    await act(async () => { await new Promise((r) => setTimeout(r, SESSION_CONFIRM_MS)); });
    check("refreshAfterSession called exactly once after the hold", s.refreshes.length === 1, JSON.stringify(s.refreshes));
    check("refresh came no earlier than SESSION_CONFIRM_MS", (s.refreshes[0] ?? 0) >= SESSION_CONFIRM_MS - 50, JSON.stringify(s.refreshes));
    await s.done();
  }

  console.log("\nN5b: 'Change it' inside the hold cancels the refresh");
  {
    const s = await summary(Date.UTC(2026, 9, 26, 16, 30, 0));
    await click(s.container, /^Keep it$/);
    await click(s.container, /^Change it$/);
    await act(async () => { await new Promise((r) => setTimeout(r, SESSION_CONFIRM_MS + 200)); });
    check("no refresh after Change it", s.refreshes.length === 0, JSON.stringify(s.refreshes));
    await s.done();
  }

  console.log("\nN7 (QA3 X2): LA profile, stale session (24 Oct) at 18:00 PDT Wed 28 (UTC Thu 29 01:00) -> Thu 29, Tomorrow");
  {
    PROFILE_TZ = "America/Los_Angeles";
    PROGRAM_DAYS = fourDay();
    SESSIONS = [sessionRow({ local_date: "2026-10-24", program_day_id: "pd-1", actual_type: "weights" })];
    const s = await summary(Date.UTC(2026, 9, 29, 1, 0, 0));
    check("page: tomorrow.localDate = 2026-10-29 (LA today + 1; UTC today + 1 would be 2026-10-30)", s.props.tomorrow?.localDate === "2026-10-29", String(s.props.tomorrow?.localDate));
    check("page: tomorrowLabel = Tomorrow", s.props.tomorrowLabel === "Tomorrow", String(s.props.tomorrowLabel));
    check("prompt names Thursday's plan: 'Tomorrow is Upper.'", (s.container.textContent ?? "").includes("Tomorrow is Upper."), (s.container.textContent ?? "").slice(-200));
    await s.done();
    PROFILE_TZ = "Asia/Kolkata";
  }

  console.log("\nN8: a session that is not a program day (free workout) does not move Next up: Upper Mon done -> Lower");
  {
    PROGRAM_DAYS = fourDay();
    SESSIONS = [
      sessionRow({ id: "s-mon", status: "completed", local_date: "2026-10-26", program_day_id: "pd-1", created_at: "2026-10-26T12:00:00.000Z" }),
      sessionRow({ local_date: "2026-10-27", program_day_id: null, actual_type: "weights" }),
    ];
    const s = await summary(Date.UTC(2026, 9, 27, 16, 30, 0)); // 22:00 IST Tue 27 -> Wed rest
    await click(s.container, /^Train anyway$/);
    const list = dayList(s.container, ["Upper", "Lower"]);
    check("Next up stays on Lower (after the last program day, Upper)", list[0] === "Lower [Next up]", JSON.stringify(list));
    await s.done();
  }

  console.log("\nN6: planTargetLabel / planPromptHeading");
  check("today -> Today", planTargetLabel("2026-10-28", "2026-10-28") === "Today");
  check("today+1 -> Tomorrow", planTargetLabel("2026-10-29", "2026-10-28") === "Tomorrow");
  check("today+2 -> Friday", planTargetLabel("2026-10-30", "2026-10-28") === "Friday", planTargetLabel("2026-10-30", "2026-10-28"));
  check("heading for Today", planPromptHeading("Today") === "What about today?");
  check("heading for Friday", planPromptHeading("Friday") === "What about Friday?");

  if (failures > 0) {
    console.log(`\n❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All next-up-after-session wiring checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
