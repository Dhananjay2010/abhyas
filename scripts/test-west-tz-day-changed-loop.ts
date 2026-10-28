#!/usr/bin/env tsx
/**
 * QA3 LOW-1 (#166 r5): a profile timezone moved WEST after a session started
 * dead-ends the end-of-session "What about ...?" prompt.
 *
 * Repro: a session recorded on 27 Oct in IST (07:00), profile then set to
 * America/Los_Angeles, where it is still 26 Oct. The session page shows
 * planTargetDate(27, 26) = 28 Oct ("Wednesday"). acceptShownTargetDate only
 * took today/tomorrow (26/27), so planDay refused with DAY_CHANGED_ERROR and
 * sent back retarget = planTargetDate(27, 26) = 28, the same day. Every later
 * tap repeated that, so the choice never saved.
 *
 * Drives the REAL planDay server action (src/app/session/actions.ts) with a
 * recording fake Supabase client and a pinned clock. The real
 * resolveTimezoneWithProfile, localDateString, resolvePlanTargetDate,
 * acceptShownTargetDate, planDayCore and nextDayPlan all run; the shown day
 * is computed exactly as src/app/session/[id]/page.tsx does. Only next/*,
 * the rate limiter and getAuthedClient are stubbed (they need a request).
 *
 * Also pins that same-zone and east-move behaviour is exactly main's, and
 * that genuine day changes are still refused.
 *
 *   npx tsx scripts/test-west-tz-day-changed-loop.ts
 * Mutants (unchained): bash scripts/test-west-tz-day-changed-mutants.sh
 */

export {};

let NOW = Date.UTC(2026, 9, 27, 2, 0, 0);
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
type Query = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  cols: string;
  filters: Array<[string, unknown]>;
  payload?: unknown;
};
type Reply = { data: unknown; error: { message: string; code?: string } | null };

let queries: Query[] = [];
let respond: (q: Query) => Reply = () => ({ data: null, error: null });

function chain(table: string) {
  const q: Query = { table, op: "select", cols: "", filters: [] };
  queries.push(q);
  const c: Record<string, unknown> = {};
  c.select = (cols: string) => { if (q.op === "select") q.cols = cols; return c; };
  c.insert = (p: unknown) => { q.op = "insert"; q.payload = p; return c; };
  c.update = (p: unknown) => { q.op = "update"; q.payload = p; return c; };
  c.delete = () => { q.op = "delete"; return c; };
  c.eq = (col: string, v: unknown) => { q.filters.push([col, v]); return c; };
  c.in = (col: string, v: unknown) => { q.filters.push([col, v]); return c; };
  c.order = () => c;
  c.limit = () => c;
  c.single = () => Promise.resolve(respond(q));
  c.maybeSingle = () => Promise.resolve(respond(q));
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(respond(q)).then(res, rej);
  return c;
}
const fakeClient = { from: (t: string) => chain(t) };
const USER = { id: "u1" };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/cache") return { revalidatePath() {}, revalidateTag() {}, unstable_cache: (f: unknown) => f };
  if (id === "next/headers") return { headers: async () => new Map(), cookies: async () => ({ get() {}, getAll: () => [], set() {} }) };
  if (id === "next/navigation") return { redirect: (u: string) => { throw new Error("REDIRECT " + u); }, notFound: () => { throw new Error("NOT_FOUND"); } };
  if (id === "@/lib/rate-limit/server-action") return { checkActionRateLimit: async () => null };
  if (id === "@/lib/supabase/auth") return {
    getAuthedClient: async () => ({ supabase: fakeClient, user: USER }),
    getSessionUser: async () => USER,
  };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const PROGRAM = { id: "p1", started_on: "2026-10-05", deload_week: 4, week_offset: 0 };
const isLookup = (q: Query) => q.table === "sessions" && q.op === "select" && q.cols === "local_date";
const sessionWrites = () => queries.filter((q) => q.table === "sessions" && q.op !== "select");
const inserted = () => (sessionWrites().find((q) => q.op === "insert")?.payload as Row | undefined)?.local_date;

function db(tz: string, sessionLocalDate: string) {
  return (q: Query): Reply => {
    if (q.table === "profiles") return { data: { timezone: tz }, error: null };
    if (isLookup(q)) return { data: { local_date: sessionLocalDate }, error: null };
    if (q.table === "sessions" && q.op === "select") return { data: [], error: null };
    if (q.table === "programs") return { data: PROGRAM, error: null };
    return { data: null, error: null };
  };
}
function reset(r: (q: Query) => Reply, now: number) {
  queries = [];
  respond = r;
  NOW = now;
}

const LA = "America/Los_Angeles";
const IST = "Asia/Kolkata";

(async () => {
  const { planDay } = await import("../src/app/session/actions");
  const { localDateString, addDays } = await import("../src/lib/dates");
  const { resolveTimezoneWithProfile } = await import("../src/lib/timezone");
  const {
    DAY_CHANGED_ERROR,
    planTargetDate,
    planTargetLabel,
    acceptShownTargetDate,
  } = await import("../src/lib/session/resolve-plan-target-date");

  /** The day src/app/session/[id]/page.tsx shows for this session right now. */
  const pageShownDate = (profileTz: string, sessionLocalDate: string) =>
    planTargetDate(sessionLocalDate, localDateString(resolveTimezoneWithProfile(profileTz)));

  type R = Awaited<ReturnType<typeof planDay>>;
  const retargetOf = (r: R) => (!r.ok && "retarget" in r ? r.retarget : null);

  /**
   * Tap like DayPlanPrompt does: send the shown day; on a retarget, show the
   * new day and send that with the next tap (day-plan-prompt.tsx shownDay).
   */
  async function tapUntilSaved(shown: string, maxTaps: number) {
    const log: Array<{ sent: string; ok: boolean; error?: string; retarget?: string }> = [];
    let sent = shown;
    for (let i = 0; i < maxTaps; i++) {
      queries = [];
      const r = await planDay({ sessionId: "s-w", shownDate: sent, plan: { kind: "rest" } });
      const rt = retargetOf(r);
      log.push({ sent, ok: r.ok, error: r.ok ? undefined : r.error, retarget: rt?.localDate });
      if (r.ok || !rt) return { log, saved: r.ok ? inserted() : undefined };
      sent = rt.localDate;
    }
    return { log, saved: undefined };
  }

  // 07:00 IST Tue 27 Oct = 01:30Z; page/tap at 02:00Z = 07:30 IST 27 / 19:00 LA Mon 26.
  const WEST_EVENING = Date.UTC(2026, 9, 27, 2, 0, 0);

  console.log("W1: QA3 LOW-1 repro: IST session (27 Oct), profile now LA (26 Oct) -> the shown day saves");
  reset(db(LA, "2026-10-27"), WEST_EVENING);
  {
    check("clock: LA today 2026-10-26, IST today 2026-10-27",
      localDateString(resolveTimezoneWithProfile(LA)) === "2026-10-26" && localDateString(resolveTimezoneWithProfile(IST)) === "2026-10-27");
    const shown = pageShownDate(LA, "2026-10-27");
    check("page shows 2026-10-28 (planTargetDate(27, 26))", shown === "2026-10-28", shown);
    check("page labels it Wednesday", planTargetLabel(shown, "2026-10-26") === "Wednesday", planTargetLabel(shown, "2026-10-26"));
    const r = await planDay({ sessionId: "s-w", shownDate: shown, plan: { kind: "rest" } });
    check("first tap saves (no day-changed)", r.ok, JSON.stringify(r));
    check("writes the shown day 2026-10-28", inserted() === "2026-10-28", String(inserted()));
  }

  console.log("\nW2: no dead end: a refusal never sends back the day that was just refused");
  reset(db(LA, "2026-10-27"), WEST_EVENING);
  {
    const { log, saved } = await tapUntilSaved(pageShownDate(LA, "2026-10-27"), 4);
    const deadEnd = log.some((t) => !t.ok && t.error === DAY_CHANGED_ERROR && t.retarget === t.sent);
    check("no DAY_CHANGED whose retarget equals the day sent", !deadEnd, JSON.stringify(log));
    check("saved within 4 taps", saved === "2026-10-28", JSON.stringify(log));
  }

  console.log("\nW3: west move, the session's own day (27 = LA tomorrow) is still refused, then the new day saves");
  reset(db(LA, "2026-10-27"), WEST_EVENING);
  {
    const { log, saved } = await tapUntilSaved("2026-10-27", 3);
    check("first tap refused with the day-changed copy", !log[0].ok && log[0].error === DAY_CHANGED_ERROR, JSON.stringify(log[0]));
    check("retarget is 2026-10-28", log[0].retarget === "2026-10-28", JSON.stringify(log[0]));
    check("second tap saves 2026-10-28", log.length === 2 && saved === "2026-10-28", JSON.stringify(log));
  }

  console.log("\nW4: west move, a day the rule would not show (29 Oct) is still refused, nothing written");
  reset(db(LA, "2026-10-27"), WEST_EVENING);
  {
    const r = await planDay({ sessionId: "s-w", shownDate: "2026-10-29", plan: { kind: "rest" } });
    check("refused with the day-changed copy", !r.ok && r.error === DAY_CHANGED_ERROR, JSON.stringify(r));
    check("retarget is 2026-10-28", retargetOf(r)?.localDate === "2026-10-28", JSON.stringify(retargetOf(r)));
    check("nothing written", sessionWrites().length === 0, JSON.stringify(sessionWrites()));
  }

  console.log("\nW5: genuine day change after a west move: page left open from LA 26 to LA 29 -> refused, new day 30");
  // 10:00 LA Thu 29 Oct = 17:00Z
  reset(db(LA, "2026-10-27"), Date.UTC(2026, 9, 29, 17, 0, 0));
  {
    check("clock: LA today 2026-10-29", localDateString(resolveTimezoneWithProfile(LA)) === "2026-10-29");
    const r = await planDay({ sessionId: "s-w", shownDate: "2026-10-28", plan: { kind: "rest" } });
    check("refused with the day-changed copy", !r.ok && r.error === DAY_CHANGED_ERROR, JSON.stringify(r));
    check("retarget is 2026-10-30", retargetOf(r)?.localDate === "2026-10-30", JSON.stringify(retargetOf(r)));
    check("nothing written", sessionWrites().length === 0);
  }

  console.log("\nW6: west move, LA midnight passes before the tap (LA 27, shown 28 = tomorrow) -> saves 28");
  // 00:00:01 LA Tue 27 Oct = 07:00:01Z
  reset(db(LA, "2026-10-27"), Date.UTC(2026, 9, 27, 7, 0, 1));
  {
    const r = await planDay({ sessionId: "s-w", shownDate: "2026-10-28", plan: { kind: "rest" } });
    check("result ok", r.ok, JSON.stringify(r));
    check("writes 2026-10-28", inserted() === "2026-10-28", String(inserted()));
  }

  console.log("\nE1: east move (LA session 26 Oct, profile now IST 27 Oct) -> page shows today 27, saves 27");
  reset(db(IST, "2026-10-26"), WEST_EVENING);
  {
    const shown = pageShownDate(IST, "2026-10-26");
    check("page shows 2026-10-27", shown === "2026-10-27", shown);
    const r = await planDay({ sessionId: "s-w", shownDate: shown, plan: { kind: "rest" } });
    check("result ok", r.ok, JSON.stringify(r));
    check("writes 2026-10-27", inserted() === "2026-10-27", String(inserted()));
  }

  console.log("\nE2: same zone, page open across IST midnight (session 27, shown 28 = old today, tap IST 29) -> refused, new day 30");
  // 00:00:01 IST Thu 29 Oct
  reset(db(IST, "2026-10-27"), Date.UTC(2026, 9, 28, 18, 30, 1));
  {
    const r = await planDay({ sessionId: "s-w", shownDate: "2026-10-28", plan: { kind: "rest" } });
    check("refused with the day-changed copy", !r.ok && r.error === DAY_CHANGED_ERROR, JSON.stringify(r));
    check("retarget is 2026-10-30", retargetOf(r)?.localDate === "2026-10-30", JSON.stringify(retargetOf(r)));
    check("nothing written", sessionWrites().length === 0);
  }

  console.log("\nE3: same zone, the session's own day is never accepted (session 28, shown 28, today 28)");
  reset(db(IST, "2026-10-28"), Date.UTC(2026, 9, 28, 16, 30, 0));
  {
    const r = await planDay({ sessionId: "s-w", shownDate: "2026-10-28", plan: { kind: "rest" } });
    check("refused with the day-changed copy", !r.ok && r.error === DAY_CHANGED_ERROR, JSON.stringify(r));
    check("nothing written", sessionWrites().length === 0);
  }

  console.log("\nX1: acceptShownTargetDate is exactly main's rule whenever the session's day is not after today");
  {
    // main 70534d43: todayOrTomorrow && shownDate > sessionLocalDate
    const mainRule = (shown: string, session: string, today: string) =>
      (shown === today || shown === addDays(today, 1)) && shown > session;
    const today = "2026-10-28";
    let same = 0;
    const diffs: string[] = [];
    for (let s = -6; s <= 0; s++) {
      for (let d = -4; d <= 5; d++) {
        const session = addDays(today, s);
        const shown = addDays(today, d);
        if (acceptShownTargetDate(shown, session, today) === mainRule(shown, session, today)) same++;
        else diffs.push(`session ${session} shown ${shown}`);
      }
    }
    check("70/70 (session <= today) decisions identical to main", diffs.length === 0 && same === 70, diffs.join("; "));
  }

  console.log("\nX2: when the session's day is after today (west move), only main's set plus planTargetDate is accepted");
  {
    const today = "2026-10-26";
    const diffs: string[] = [];
    for (let s = 1; s <= 2; s++) {
      for (let d = -2; d <= 5; d++) {
        const session = addDays(today, s);
        const shown = addDays(today, d);
        const expected =
          ((shown === today || shown === addDays(today, 1)) && shown > session) ||
          shown === planTargetDate(session, today);
        if (acceptShownTargetDate(shown, session, today) !== expected) diffs.push(`session ${session} shown ${shown}`);
      }
    }
    check("16/16 decisions as specified", diffs.length === 0, diffs.join("; "));
    check("session 27, today 26: 28 accepted", acceptShownTargetDate("2026-10-28", "2026-10-27", today));
    check("session 27, today 26: 29 refused", !acceptShownTargetDate("2026-10-29", "2026-10-27", today));
    check("session 27, today 26: 27 refused", !acceptShownTargetDate("2026-10-27", "2026-10-27", today));
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All west-timezone day-changed checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
