#!/usr/bin/env tsx
/**
 * MED-A / MED-4 wiring test: call the REAL session page server component
 * (src/app/session/[id]/page.tsx) with a recording fake Supabase client and a
 * pinned clock, and read the `tomorrow` prop it hands to SessionRunner. The
 * real nextDayPlan / resolveDay / planTargetDate run; only next/*, auth and the
 * client runner component are stubbed.
 *
 * Replaces the exact-string source scans with behaviour: the page must show
 * the day the planDay action will write (session.local_date + 1, or user-local
 * today + 1 for a stale session), never wall-clock tomorrow and never a past day,
 * and must pass session.id to nextDayPlan so #165's post-swap collision check
 * reads this session (P6).
 *
 *   npx tsx scripts/test-session-page-tomorrow-wiring.ts
 */

export {};

let NOW = Date.UTC(2026, 9, 28, 16, 30, 0); // 22:00 IST, Wed 28 Oct 2026
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
type Query = { table: string; cols: string; filters: Array<[string, unknown]> };
let queries: Query[] = [];
type SessionFixture = { localDate: string; programDayId: string | null; actualType: string | null };
let fixture: { session: SessionFixture; program: Row | null } = {
  session: { localDate: "2026-10-28", programDayId: "pd-3", actualType: "weights" },
  program: { id: "p1", user_id: "u1", split_type: "upper_lower" },
};

// ISO weekday 1..7: Wed(3)=Lower, Thu(4)=Upper, the rest are rest days.
const PROGRAM_DAYS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  id: `pd-${d}`,
  day_index: d,
  day_type: d === 3 || d === 4 ? "weights" : "rest",
  label: d === 3 ? "Lower" : d === 4 ? "Upper" : null,
  program_id: "p1",
  status: "active",
}));

/** The member's sessions table: just the session being finished. */
function sessionRows(): Row[] {
  const f = fixture.session;
  return [{
    id: SESSION_ID, user_id: "u1", status: "in_progress", local_date: f.localDate,
    program_day_id: f.programDayId, actual_type: f.actualType, is_deload: false, week_in_block: 1,
    warmup_completed: true, started_at: new Date(NOW - 3600_000).toISOString(), session_exercises: [],
  }];
}

type Filter = (r: Row) => boolean;
function reply(q: Query, filters: Filter[], single: boolean): { data: unknown; error: null } {
  const pick = (rows: Row[]) => {
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    return single ? (hit[0] ?? null) : hit;
  };
  switch (q.table) {
    case "sessions":
      return { data: pick(sessionRows()), error: null };
    case "program_days":
      return { data: pick(PROGRAM_DAYS), error: null };
    case "programs":
      return { data: fixture.program, error: null };
    case "profiles":
      return { data: { primary_track: "weights", has_all_equipment: true, timezone: "Asia/Kolkata", units: "metric" }, error: null };
    case "user_settings":
      return { data: {}, error: null };
    default:
      return { data: single ? null : [], error: null };
  }
}

/** PostgREST-ish chain that applies eq/in/lte/gte filters to fixture rows. */
function chain(table: string) {
  const q: Query = { table, cols: "", filters: [] };
  const filters: Filter[] = [];
  queries.push(q);
  const c: Record<string, unknown> = {};
  c.select = (cols: string) => { q.cols = cols; return c; };
  c.eq = (col: string, v: unknown) => { q.filters.push([col, v]); filters.push((r) => !(col in r) || r[col] === v); return c; };
  c.in = (col: string, v: unknown[]) => { q.filters.push([col, v]); filters.push((r) => !(col in r) || v.includes(r[col])); return c; };
  c.lte = (col: string, v: string) => { q.filters.push([col, v]); filters.push((r) => !(col in r) || String(r[col]) <= v); return c; };
  c.gte = (col: string, v: string) => { q.filters.push([col, v]); filters.push((r) => !(col in r) || String(r[col]) >= v); return c; };
  for (const m of ["order", "limit"]) c[m] = () => c;
  c.single = () => Promise.resolve(reply(q, filters, true));
  c.maybeSingle = () => Promise.resolve(reply(q, filters, true));
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(reply(q, filters, false)).then(res, rej);
  return c;
}
const fakeClient = { from: (t: string) => chain(t) };
const SESSION_ID = "11111111-2222-4333-8444-555555555555";

function RunnerStub() { return null; }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") return {
    redirect: (u: string) => { throw new Error("REDIRECT " + u); },
    notFound: () => { throw new Error("NOT_FOUND"); },
  };
  if (id === "next/cache") return { revalidatePath() {} };
  if (id === "next/headers") return { headers: async () => new Map(), cookies: async () => ({ get() {}, getAll: () => [], set() {} }) };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: fakeClient, user: { id: "u1" } }), getSessionUser: async () => ({ id: "u1" }) };
  if (id === "./session-runner") return { SessionRunner: RunnerStub };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type Tomorrow = { localDate: string; plannedLabel: string; programDayId: string | null; days: Array<{ label: string; nextUp?: boolean }> } | null;

(async () => {
  const { default: SessionPage } = await import("../src/app/session/[id]/page");
  const { localDateString } = await import("../src/lib/dates");

  async function render(
    sessionLocalDate: string,
    now: number,
    program: Row | null = { id: "p1", user_id: "u1", split_type: "upper_lower" },
    session: Partial<SessionFixture> = {},
  ) {
    NOW = now;
    queries = [];
    fixture = { session: { localDate: sessionLocalDate, programDayId: null, actualType: null, ...session }, program };
    const el = (await SessionPage({ params: Promise.resolve({ id: SESSION_ID }) })) as unknown as { type: unknown; props: { tomorrow: Tomorrow; sessionId: string } };
    const overrideRead = queries.find((q) => q.table === "sessions" && q.cols.startsWith("actual_type"));
    const byIdLookup = queries.find((q) => q.table === "sessions" && q.cols === "id, program_day_id, actual_type, local_date");
    return { el, tomorrow: el.props.tomorrow, overrideDate: overrideRead?.filters.find(([c]) => c === "local_date")?.[1], byIdLookup };
  }

  const EVENING_IST = Date.UTC(2026, 9, 28, 16, 30, 0); // 22:00 IST Wed 28
  const AFTER_MIDNIGHT_IST = Date.UTC(2026, 9, 28, 18, 50, 0); // 00:20 IST Thu 29 (UTC still 28)

  console.log("P1: session 28 Oct, evening -> Tomorrow is Thu 29 Oct (Upper)");
  {
    const { el, tomorrow, overrideDate } = await render("2026-10-28", EVENING_IST);
    check("page renders SessionRunner", el.type === RunnerStub && el.props.sessionId === SESSION_ID);
    check("tomorrow.localDate = 2026-10-29", tomorrow?.localDate === "2026-10-29", String(tomorrow?.localDate));
    check("plannedLabel = Upper", tomorrow?.plannedLabel === "Upper", String(tomorrow?.plannedLabel));
    check("override read uses 2026-10-29", overrideDate === "2026-10-29", String(overrideDate));
    check("days offered come from the block", JSON.stringify(tomorrow?.days.map((d) => d.label)) === '["Lower","Upper"]', JSON.stringify(tomorrow?.days));
  }

  console.log("\nP2: same session finished 00:20 IST Thu -> still Thu 29 (session.local_date + 1, not wall-clock Fri 30)");
  {
    NOW = AFTER_MIDNIGHT_IST;
    check("clock: UTC still 2026-10-28, IST 2026-10-29", localDateString("UTC") === "2026-10-28" && localDateString("Asia/Kolkata") === "2026-10-29");
    const { tomorrow, overrideDate } = await render("2026-10-28", AFTER_MIDNIGHT_IST);
    check("tomorrow.localDate = 2026-10-29", tomorrow?.localDate === "2026-10-29", String(tomorrow?.localDate));
    check("plannedLabel = Upper (Fri 30 would be Rest)", tomorrow?.plannedLabel === "Upper", String(tomorrow?.plannedLabel));
    check("override read uses 2026-10-29", overrideDate === "2026-10-29", String(overrideDate));
  }

  console.log("\nP3: MED-4 stale session from Sat 24 Oct finished Wed 28 -> today+1 (Thu 29), never Sun 25");
  {
    const { tomorrow, overrideDate } = await render("2026-10-24", EVENING_IST);
    check("tomorrow.localDate = 2026-10-29 (not past 2026-10-25)", tomorrow?.localDate === "2026-10-29", String(tomorrow?.localDate));
    check("plannedLabel = Upper", tomorrow?.plannedLabel === "Upper", String(tomorrow?.plannedLabel));
    check("override read uses 2026-10-29", overrideDate === "2026-10-29", String(overrideDate));
  }

  console.log("\nP4: session yesterday (27 Oct) finished 22:00 IST 28 -> local_date+1 = today (28, Lower)");
  {
    const { tomorrow } = await render("2026-10-27", EVENING_IST);
    check("tomorrow.localDate = 2026-10-28", tomorrow?.localDate === "2026-10-28", String(tomorrow?.localDate));
    check("plannedLabel = Lower", tomorrow?.plannedLabel === "Lower", String(tomorrow?.plannedLabel));
  }

  console.log("\nP6: #165 sessionId - stale swap session (Sat 24 Oct did Upper) finished Wed 28 -> Thu 29 collision resolves to Lower");
  {
    // Target = today+1 = Thu 29 (Upper). nextDayPlan's swap check must read
    // THIS session by id: Upper was done as a swap, so Thu's Upper collides and
    // the next day in the rotation (Lower) is served. A date-based lookup on
    // Wed 28 finds nothing and would wrongly keep Upper.
    const { tomorrow, byIdLookup } = await render("2026-10-24", EVENING_IST, undefined, { programDayId: "pd-4", actualType: "weights" });
    check("nextDayPlan looked the session up by id", !!byIdLookup && byIdLookup.filters.some(([c, v]) => c === "id" && v === SESSION_ID), JSON.stringify(byIdLookup?.filters));
    check("tomorrow.localDate = 2026-10-29", tomorrow?.localDate === "2026-10-29", String(tomorrow?.localDate));
    check("collision resolved: plannedLabel = Lower", tomorrow?.plannedLabel === "Lower", String(tomorrow?.plannedLabel));
    check("collision resolved: programDayId = pd-3", tomorrow?.programDayId === "pd-3", String(tomorrow?.programDayId));
  }

  console.log("\nP7: no swap (session 28 Oct did its scheduled Lower) -> Thu 29 stays Upper, no collision");
  {
    const { tomorrow } = await render("2026-10-28", EVENING_IST, undefined, { programDayId: "pd-3", actualType: "weights" });
    check("plannedLabel = Upper", tomorrow?.plannedLabel === "Upper", String(tomorrow?.plannedLabel));
  }

  console.log("\nP5: no active block -> no prompt");
  {
    const { tomorrow } = await render("2026-10-28", EVENING_IST, null);
    check("tomorrow is null", tomorrow === null, JSON.stringify(tomorrow));
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All session page tomorrow wiring checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
