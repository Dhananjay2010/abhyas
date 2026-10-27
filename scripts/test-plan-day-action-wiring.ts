#!/usr/bin/env tsx
/**
 * MED-2 wiring test: drive the REAL planDay server action
 * (src/app/session/actions.ts) end to end with a recording fake Supabase
 * client and a pinned clock. Nothing below planDay is mocked: the real
 * resolvePlanTargetDate, makeFetchSessionLocalDate, createPlanDayDbOps,
 * planDayCore and friendlyPlanDayError all run. Only next/* , the rate limiter
 * and getAuthedClient are stubbed (they need a request).
 *
 * Kills (scripts/test-d7-rest-prompt-mutants.sh):
 *   MED-2a  planDay writes `input.localDate ?? today` instead of the resolved date
 *   MED-2b  raw core error returned without friendlyPlanDayError
 *   MED-2c  failed session lookup falls back to today instead of erroring
 *   MED-1   allowlist reverted to a deny-list
 *   MED-4   stale session offered/written to a past day
 *
 *   npx tsx scripts/test-plan-day-action-wiring.ts
 */

export {};

// ---- pin the clock (mutable so each case can set its own "now") ----------
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
let revalidations = 0;

/** PostgREST-ish chain that records every call and answers via `respond`. */
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
  if (id === "next/cache") return { revalidatePath() { revalidations++; }, revalidateTag() {}, unstable_cache: (f: unknown) => f };
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

const GENERIC = "Couldn't save your choice. Please try again.";
const PROGRAM = { id: "p1", started_on: "2026-10-05", deload_week: 4, week_offset: 0 };

const has = (q: Query, col: string, v: unknown) => q.filters.some(([c, x]) => c === col && x === v);
const isLookup = (q: Query) => q.table === "sessions" && q.op === "select" && q.cols === "local_date";
const sessionWrites = () => queries.filter((q) => q.table === "sessions" && q.op !== "select");
const daySessionReads = () => queries.filter((q) => q.table === "sessions" && q.op === "select" && q.cols.startsWith("id, status"));

/**
 * Happy-path DB: profile timezone, the session lookup, an empty target day,
 * an active block. `over` can override any query's reply.
 */
function db(opts: { tz?: string; sessionLocalDate?: string | null; over?: (q: Query) => Reply | undefined }) {
  return (q: Query): Reply => {
    const o = opts.over?.(q);
    if (o) return o;
    if (q.table === "profiles") return { data: { timezone: opts.tz ?? "Asia/Kolkata" }, error: null };
    if (isLookup(q)) return { data: opts.sessionLocalDate == null ? null : { local_date: opts.sessionLocalDate }, error: null };
    if (q.table === "sessions" && q.op === "select") return { data: [], error: null };
    if (q.table === "programs") return { data: PROGRAM, error: null };
    return { data: null, error: null };
  };
}

function reset(r: (q: Query) => Reply, now: number) {
  queries = [];
  revalidations = 0;
  respond = r;
  NOW = now;
}

(async () => {
  const { planDay } = await import("../src/app/session/actions");
  const { localDateString } = await import("../src/lib/dates");

  // 22:00 IST Wed 28 Oct
  const EVENING_IST = Date.UTC(2026, 9, 28, 16, 30, 0);
  // 00:20 IST Thu 29 Oct (still 28 Oct in UTC)
  const AFTER_MIDNIGHT_IST = Date.UTC(2026, 9, 28, 18, 50, 0);

  console.log("A1: end-of-session choice writes session.local_date + 1, not today");
  reset(db({ sessionLocalDate: "2026-10-28" }), EVENING_IST);
  check("clock pinned: IST today is 2026-10-28", localDateString("Asia/Kolkata") === "2026-10-28", localDateString("Asia/Kolkata"));
  {
    const r = await planDay({ sessionId: "s-1", plan: { kind: "rest" } });
    check("result ok", r.ok, JSON.stringify(r));
    const lookup = queries.find(isLookup);
    check("session lookup scoped by id and user_id", !!lookup && has(lookup, "id", "s-1") && has(lookup, "user_id", "u1"), JSON.stringify(lookup?.filters));
    const ins = sessionWrites().filter((q) => q.op === "insert");
    const written = (ins[0]?.payload as Row | undefined)?.local_date;
    check("exactly one insert", ins.length === 1, String(ins.length));
    check("insert lands on resolved date 2026-10-29", written === "2026-10-29", String(written));
    check("insert is NOT today (2026-10-28)", written !== "2026-10-28");
    check("target day read on 2026-10-29", daySessionReads().every((q) => has(q, "local_date", "2026-10-29")) && daySessionReads().length > 0);
    check("revalidated after a successful save", revalidations > 0, String(revalidations));
  }

  console.log("\nA2: 00:20 IST after a 28 Oct session -> writes 29 Oct (user-local, not UTC)");
  reset(db({ sessionLocalDate: "2026-10-28" }), AFTER_MIDNIGHT_IST);
  {
    check("clock: UTC still 2026-10-28, IST 2026-10-29", localDateString("UTC") === "2026-10-28" && localDateString("Asia/Kolkata") === "2026-10-29");
    const r = await planDay({ sessionId: "s-1", plan: { kind: "yoga" } });
    const written = (sessionWrites().find((q) => q.op === "insert")?.payload as Row | undefined)?.local_date;
    check("result ok", r.ok, JSON.stringify(r));
    check("writes 2026-10-29", written === "2026-10-29", String(written));
  }

  console.log("\nA3: MED-4 stale session (24 Oct) finished 28 Oct -> today+1 (29 Oct), never a past day");
  reset(db({ sessionLocalDate: "2026-10-24" }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-old", plan: { kind: "rest" } });
    const written = (sessionWrites().find((q) => q.op === "insert")?.payload as Row | undefined)?.local_date;
    check("result ok (no 'already been and gone')", r.ok, JSON.stringify(r));
    check("writes 2026-10-29", written === "2026-10-29", String(written));
  }

  console.log("\nA4: Today-page path (localDate) writes that date");
  reset(db({}), EVENING_IST);
  {
    const r = await planDay({ localDate: "2026-10-28", plan: { kind: "rest" } });
    const written = (sessionWrites().find((q) => q.op === "insert")?.payload as Row | undefined)?.local_date;
    check("result ok", r.ok, JSON.stringify(r));
    check("writes 2026-10-28", written === "2026-10-28", String(written));
    check("no session lookup on the localDate path", !queries.some(isLookup));
  }

  console.log("\nB1: unexpected DB error (RLS) on the day read -> generic copy, not raw text");
  const RLS = 'new row violates row-level security policy for table "sessions"';
  reset(db({ sessionLocalDate: "2026-10-28", over: (q) => (q.table === "sessions" && q.op === "select" && !isLookup(q) ? { data: null, error: { message: RLS } } : undefined) }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-1", plan: { kind: "rest" } });
    check("not ok", !r.ok);
    check("error is exactly the generic copy", !r.ok && r.error === GENERIC, JSON.stringify(r));
    check("no raw RLS text", !JSON.stringify(r).includes("row-level security"));
    check("not revalidated on failure", revalidations === 0);
  }

  console.log("\nB2: insert fails with 'JWT expired' -> generic copy");
  reset(db({ sessionLocalDate: "2026-10-28", over: (q) => (q.table === "sessions" && q.op === "insert" ? { data: null, error: { message: "JWT expired", code: "PGRST301" } } : undefined) }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-1", plan: { kind: "rest" } });
    check("error is exactly the generic copy", !r.ok && r.error === GENERIC, JSON.stringify(r));
  }

  console.log("\nB3: the core's own copy passes through ('That day is already done.')");
  reset(db({ sessionLocalDate: "2026-10-28", over: (q) => (q.table === "sessions" && q.op === "select" && !isLookup(q) ? { data: [{ id: "d1", status: "completed", actual_type: "weights" }], error: null } : undefined) }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-1", plan: { kind: "rest" } });
    check("error is 'That day is already done.'", !r.ok && r.error === "That day is already done.", JSON.stringify(r));
    check("nothing written", sessionWrites().length === 0);
  }

  console.log("\nB4: training day missing from the block -> 'That day is not in your block.' (real loadPlanDay copy)");
  reset(db({ sessionLocalDate: "2026-10-28", over: (q) => (q.table === "program_days" ? { data: null, error: null } : undefined) }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-1", plan: { kind: "training", programDayId: "gone" } });
    check("error is 'That day is not in your block.'", !r.ok && r.error === "That day is not in your block.", JSON.stringify(r));
  }

  console.log("\nC1: session lookup errors -> error returned, no fallback to today, nothing written");
  reset(db({ over: (q) => (isLookup(q) ? { data: null, error: { message: "connect ETIMEDOUT" } } : undefined) }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-1", plan: { kind: "rest" } });
    check("not ok", !r.ok, JSON.stringify(r));
    check("error is 'Could not load session.'", !r.ok && r.error === "Could not load session.", JSON.stringify(r));
    check("no day read / write happened", daySessionReads().length === 0 && sessionWrites().length === 0, JSON.stringify(queries.map((q) => `${q.table}:${q.op}`)));
  }

  console.log("\nC2: session not found -> error, nothing written");
  reset(db({ sessionLocalDate: null }), EVENING_IST);
  {
    const r = await planDay({ sessionId: "s-missing", plan: { kind: "rest" } });
    check("error is 'Session not found.'", !r.ok && r.error === "Session not found.", JSON.stringify(r));
    check("nothing written", sessionWrites().length === 0);
  }

  console.log("\nD1: neither sessionId nor localDate -> generic copy, no session queries (LOW-9)");
  reset(db({}), EVENING_IST);
  {
    const r = await planDay({ plan: { kind: "rest" } });
    check("error is the generic copy", !r.ok && r.error === GENERIC, JSON.stringify(r));
    check("no sessions query at all", !queries.some((q) => q.table === "sessions"));
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All planDay action wiring checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
