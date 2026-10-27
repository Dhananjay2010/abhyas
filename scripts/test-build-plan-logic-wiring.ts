#!/usr/bin/env tsx
/**
 * MED-2(b) wiring test: call the REAL buildPlanLogic (src/lib/program/build-plan-logic.ts,
 * which the buildPlan server action delegates to) with a recording fake Supabase
 * client, and assert what it actually does against the database:
 *
 *   - for an active block whose ends_on < today, rollover_block runs (closing the
 *     ended block as completed and opening the next one) BEFORE the rebuild reads
 *     the active block and calls rebuild_block;
 *   - both RPCs receive p_today = the member's LOCAL date (profile timezone,
 *     pinned clock), not the server's UTC date;
 *   - the rebuild targets the freshly rolled-over block, not the ended one;
 *   - no direct table writes (the legacy first-build insert path is not taken).
 *
 * The fake mirrors only what rebuild-plan-deps, rollover.ts and persist.ts use:
 * from().select/eq/neq/order/limit/lt/in + single/maybeSingle/await, and rpc().
 * Programs state is mutated by the fake rollover_block like the real RPC does.
 *
 * It also runs the REAL buildPlan server action (src/app/today/actions.ts) with
 * next/cache, auth and the rate limiter stubbed, so the action itself is proven
 * to delegate to buildPlanLogic (rollover_block, then rebuild_block).
 *
 * Clock: the global Date is faked (no-arg `new Date()` / `Date.now()`) to a
 * far-off instant, 2031-06-15, so any code path that reads the wall clock
 * instead of the pinned `now` gets a date no assertion accepts, whatever the
 * real date is. Only the action section moves the global clock to NOW, because
 * the action takes no clock argument.
 *
 * Mutants in scripts/test-rebuild-rollover-mutants.sh that this test must kill
 * by assertion ("❌ FAIL"):
 *   B  buildPlanLogic skips rebuildPlanCore (createBlockForUser rebuild directly)
 *   C  the buildPlan action calls createBlockForUser directly (main's old body)
 *   T1 rebuild-plan-deps drops `today` from createBlockForUser
 *   T2 persist.ts ignores options.today
 *   T4 buildPlanLogic reads the wall clock instead of `now`
 *   E1 fetchActiveBlock swallows its error
 *   G  buildPlanLogic's catch shows the raw error message
 *
 *   npx tsx scripts/test-build-plan-logic-wiring.ts
 */

// ---- global fake clock -----------------------------------------------------
const FAR_CLOCK = Date.UTC(2031, 5, 15, 12, 0, 0);
let clockNow = FAR_CLOCK;
{
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(clockNow);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else super(...(args as [any]));
    }
    static now() { return clockNow; }
  }
  (globalThis as unknown as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
}

import { readFileSync } from "fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { buildPlanLogic, REBUILD_FAILED_MESSAGE } from "../src/lib/program/build-plan-logic";
import { localDateString, addDays } from "../src/lib/dates";

type Row = Record<string, unknown>;
type Op =
  | { kind: "query"; table: string; select: string | null; filters: string[]; terminal: string }
  | { kind: "write"; table: string; method: string }
  | { kind: "rpc"; name: string; args: Row };

// The committed fixture is exported from active rows only; restore the column the queries filter on.
const catalogue = (JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8")) as Row[]).map((e) => ({ ...e, is_active: true }));

function makeFake(opts: { timezone: string; programs: Row[]; failActiveFetch?: string; rolloverError?: string }) {
  const ops: Op[] = [];
  const programs = opts.programs.map((p) => ({ ...p }));
  const profile: Row = {
    id: "u1", timezone: opts.timezone, goal: "strength", level: "beginner", primary_track: "weights",
    days_per_week: 3, yoga_days_per_week: 0, has_all_equipment: true, height_cm: null,
    date_of_birth: null, preferred_session_minutes: 45, units: "kg",
  };
  const tables: Record<string, Row[]> = {
    profiles: [profile], programs, program_days: [], program_day_exercises: [],
    body_metrics: [], user_equipment: [], user_injuries: [], exercises: catalogue,
  };

  function from(table: string) {
    let select: string | null = null;
    const filters: string[] = [];
    const preds: Array<(r: Row) => boolean> = [];
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    const c: Record<string, unknown> = {};
    const write = (method: string) => () => { ops.push({ kind: "write", table, method }); return c; };
    for (const m of ["insert", "update", "upsert", "delete"]) c[m] = write(m);
    c.select = (s: string) => { select = s; return c; };
    c.eq = (col: string, v: unknown) => { filters.push(`${col}=${v}`); preds.push((r) => r[col] === v); return c; };
    c.neq = (col: string, v: unknown) => { filters.push(`${col}!=${v}`); preds.push((r) => r[col] !== v); return c; };
    c.lt = (col: string, v: number) => { filters.push(`${col}<${v}`); preds.push((r) => (r[col] as number) < v); return c; };
    c.in = (col: string, v: unknown[]) => { filters.push(`${col} in ${v.length}`); preds.push((r) => v.includes(r[col])); return c; };
    c.order = (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return c; };
    c.limit = (n: number) => { limit = n; return c; };
    const rows = () => {
      let out = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (order) { const { col, asc } = order; out = [...out].sort((a, b) => (a[col]! > b[col]! ? 1 : a[col]! < b[col]! ? -1 : 0) * (asc ? 1 : -1)); }
      if (limit !== null) out = out.slice(0, limit);
      return out;
    };
    const run = (terminal: string) => {
      ops.push({ kind: "query", table, select, filters, terminal });
      const r = rows();
      if (terminal === "single") return r.length === 1 ? { data: r[0], error: null } : { data: null, error: { message: `single: ${r.length} rows` } };
      if (terminal === "maybeSingle") return r.length <= 1 ? { data: r[0] ?? null, error: null } : { data: null, error: { message: `maybeSingle: ${r.length} rows` } };
      return { data: r, error: null };
    };
    c.single = () => Promise.resolve(run("single"));
    c.maybeSingle = () => {
      if (opts.failActiveFetch && table === "programs" && select === "id, ends_on") {
        ops.push({ kind: "query", table, select, filters, terminal: "maybeSingle" });
        return Promise.resolve({ data: null, error: { message: opts.failActiveFetch } });
      }
      return Promise.resolve(run("maybeSingle"));
    };
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run("await")).then(res, rej);
    return c;
  }

  async function rpc(name: string, args: Row) {
    ops.push({ kind: "rpc", name, args });
    const payload = args.p_payload as Row;
    if (name === "rollover_block") {
      if (opts.rolloverError) return { data: null, error: { message: opts.rolloverError } };
      // Mirror rollover_block (migration 20261025000023): the ended block is closed as
      // completed with ended_on = its ends_on; the next block starts the day after,
      // or on p_today (ending p_today + 27) for a late return more than a day after.
      const today = args.p_today as string;
      let startedOn = today;
      let endsOn = payload.ends_on as string;
      for (const p of programs) {
        if (p.status !== "active") continue;
        const ends = p.ends_on as string;
        if (today <= ends) return { data: null, error: { message: "rollover_block: block has not ended" } };
        const late = today > addDays(ends, 1);
        startedOn = late ? today : addDays(ends, 1);
        if (late) endsOn = addDays(today, 27);
        p.status = "completed"; p.ended_on = ends;
      }
      programs.push({ id: payload.id, user_id: "u1", block_number: payload.block_number, started_on: startedOn, ends_on: endsOn, ended_on: null, status: "active", week_offset: 0 });
      return { data: payload.id, error: null };
    }
    if (name === "rebuild_block") return { data: payload.id, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  }

  return { client: { from, rpc } as unknown as SupabaseClient<Database>, ops, programs };
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const rpcs = (ops: Op[]) => ops.filter((o): o is Extract<Op, { kind: "rpc" }> => o.kind === "rpc");
const idx = (ops: Op[], pred: (o: Op) => boolean) => ops.findIndex(pred);

// Pinned clock: 2026-10-27 20:00 UTC = 2026-10-28 01:30 in Asia/Kolkata.
const NOW = new Date(Date.UTC(2026, 9, 27, 20, 0, 0));
const TZ = "Asia/Kolkata";

/** Capture console.error while `fn` runs, so logged originals can be asserted. */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; logged: string }> {
  const orig = console.error;
  const lines: string[] = [];
  console.error = (...a: unknown[]) => { lines.push(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
  try { return { value: await fn(), logged: lines.join("\n") }; } finally { console.error = orig; }
}

// ---- module stubs for the buildPlan server action ---------------------------
let actionClient: SupabaseClient<Database> | null = null;
const revalidated: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const origRequire = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/cache") return { revalidatePath: (p: string) => { revalidated.push(p); } };
  if (id === "@/lib/rate-limit/server-action") return { checkActionRateLimit: async () => null };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: actionClient, user: { id: "u1" } }) };
  // eslint-disable-next-line prefer-rest-params
  return origRequire.apply(this, arguments);
};

(async () => {
  check("global clock faked far from the pinned instant (2031-06-15)", localDateString("UTC") === "2031-06-15", localDateString("UTC"));
  const localToday = localDateString(TZ, NOW);
  check("pinned clock: local date in Asia/Kolkata is 2026-10-28 (UTC date is 2026-10-27)", localToday === "2026-10-28" && localDateString("UTC", NOW) === "2026-10-27", localToday);

  console.log("\nB1: active block ended (ends_on 2026-10-27 < local today 2026-10-28) -> rollover, then rebuild");
  {
    const f = makeFake({ timezone: TZ, programs: [
      { id: "old", user_id: "u1", block_number: 1, started_on: "2026-09-30", ends_on: "2026-10-27", ended_on: null, status: "active" },
    ] });
    const res = await buildPlanLogic(f.client, "u1", NOW);
    check("buildPlanLogic returns ok", res.ok === true, JSON.stringify(res));
    const names = rpcs(f.ops).map((r) => r.name);
    check("RPCs are exactly [rollover_block, rebuild_block] in that order", JSON.stringify(names) === JSON.stringify(["rollover_block", "rebuild_block"]), JSON.stringify(names));
    const roll = rpcs(f.ops).find((r) => r.name === "rollover_block");
    const reb = rpcs(f.ops).find((r) => r.name === "rebuild_block");
    check("rollover_block p_today equals computed local date 2026-10-28", roll?.args.p_today === localToday, String(roll?.args.p_today));
    check("rebuild_block p_today equals computed local date 2026-10-28", reb?.args.p_today === localToday, String(reb?.args.p_today));
    const iRoll = idx(f.ops, (o) => o.kind === "rpc" && o.name === "rollover_block");
    const iCreateRead = idx(f.ops, (o) => o.kind === "query" && o.table === "programs" && o.select === "block_number, started_on");
    const iReb = idx(f.ops, (o) => o.kind === "rpc" && o.name === "rebuild_block");
    check("rollover_block runs BEFORE createBlockForUser reads the active block", iRoll >= 0 && iCreateRead > iRoll, `rollover@${iRoll} createRead@${iCreateRead}`);
    check("rollover_block runs BEFORE rebuild_block", iRoll >= 0 && iReb > iRoll, `rollover@${iRoll} rebuild@${iReb}`);
    const iFetch = idx(f.ops, (o) => o.kind === "query" && o.table === "programs" && o.select === "id, ends_on" && o.filters.includes("user_id=u1") && o.filters.includes("status=active"));
    check("active block fetched for this user before rollover", iFetch >= 0 && iFetch < iRoll, `fetch@${iFetch}`);
    check("rollover payload is block 2, ends_on = today + 27", (roll?.args.p_payload as Row)?.block_number === 2 && (roll?.args.p_payload as Row)?.ends_on === addDays(localToday, 27), JSON.stringify({ b: (roll?.args.p_payload as Row)?.block_number, e: (roll?.args.p_payload as Row)?.ends_on }));
    check("rebuild targets the rolled-over block 2, not the ended block 1", (reb?.args.p_payload as Row)?.block_number === 2, `got ${(reb?.args.p_payload as Row)?.block_number}`);
    check("ended block closed as 'completed' (not superseded)", f.programs.find((p) => p.id === "old")?.status === "completed", String(f.programs.find((p) => p.id === "old")?.status));
    const writes = f.ops.filter((o) => o.kind === "write");
    check("no direct table writes (first-build insert path not taken)", writes.length === 0, JSON.stringify(writes));
  }

  console.log("\nB2: same instant, active block still current (ends_on 2026-10-28 >= today) -> no rollover");
  {
    const f = makeFake({ timezone: TZ, programs: [
      { id: "cur", user_id: "u1", block_number: 1, started_on: "2026-10-01", ends_on: "2026-10-28", ended_on: null, status: "active" },
    ] });
    const res = await buildPlanLogic(f.client, "u1", NOW);
    check("buildPlanLogic returns ok", res.ok === true, JSON.stringify(res));
    const names = rpcs(f.ops).map((r) => r.name);
    check("RPCs are exactly [rebuild_block]", JSON.stringify(names) === JSON.stringify(["rebuild_block"]), JSON.stringify(names));
    const reb = rpcs(f.ops)[0];
    check("rebuild_block p_today is local date 2026-10-28, block 1 kept", reb?.args.p_today === localToday && (reb?.args.p_payload as Row)?.block_number === 1, JSON.stringify({ t: reb?.args.p_today, b: (reb?.args.p_payload as Row)?.block_number }));
  }

  console.log("\nB3: profile timezone drives 'today': same instant in UTC (today 2026-10-27) -> block ending 10-27 is current");
  {
    const f = makeFake({ timezone: "UTC", programs: [
      { id: "old", user_id: "u1", block_number: 1, started_on: "2026-09-30", ends_on: "2026-10-27", ended_on: null, status: "active" },
    ] });
    const res = await buildPlanLogic(f.client, "u1", NOW);
    check("buildPlanLogic returns ok", res.ok === true, JSON.stringify(res));
    const names = rpcs(f.ops).map((r) => r.name);
    check("RPCs are exactly [rebuild_block] (no rollover in UTC)", JSON.stringify(names) === JSON.stringify(["rebuild_block"]), JSON.stringify(names));
    check("rebuild_block p_today is 2026-10-27", rpcs(f.ops)[0]?.args.p_today === "2026-10-27", String(rpcs(f.ops)[0]?.args.p_today));
  }

  console.log("\nB4: fetching the active block fails -> friendly error, original logged, nothing written");
  {
    const raw = "PGRST301 raw database text";
    const f = makeFake({ timezone: TZ, failActiveFetch: raw, programs: [
      { id: "old", user_id: "u1", block_number: 1, started_on: "2026-09-30", ends_on: "2026-10-27", ended_on: null, status: "active" },
    ] });
    const { value: res, logged } = await captureErrors(() => buildPlanLogic(f.client, "u1", NOW));
    check("buildPlanLogic returns ok:false", res.ok === false, JSON.stringify(res));
    check("member sees the friendly copy", !res.ok && res.error === REBUILD_FAILED_MESSAGE, JSON.stringify(res));
    check("raw database text is not shown to the member", !res.ok && !res.error.includes(raw), JSON.stringify(res));
    check("original error is logged", logged.includes(raw), logged || "nothing logged");
    check("no RPC runs after the failed read", rpcs(f.ops).length === 0, JSON.stringify(rpcs(f.ops).map((r) => r.name)));
  }

  console.log("\nB5: rollover_block fails -> friendly rollover copy, original logged, no rebuild");
  {
    const raw = "rollover raw failure 23505";
    const f = makeFake({ timezone: TZ, rolloverError: raw, programs: [
      { id: "old", user_id: "u1", block_number: 1, started_on: "2026-09-30", ends_on: "2026-10-27", ended_on: null, status: "active" },
    ] });
    const { value: res, logged } = await captureErrors(() => buildPlanLogic(f.client, "u1", NOW));
    check("buildPlanLogic returns ok:false", res.ok === false, JSON.stringify(res));
    check("member sees friendly rollover copy, not the raw text", !res.ok && res.error.startsWith("Unable to start your next training block") && !res.error.includes(raw), JSON.stringify(res));
    check("original rollover error is logged", logged.includes(raw), logged || "nothing logged");
    check("rebuild_block never runs after a failed rollover", !rpcs(f.ops).some((r) => r.name === "rebuild_block"), JSON.stringify(rpcs(f.ops).map((r) => r.name)));
  }

  console.log("\nA1: the REAL buildPlan server action delegates to buildPlanLogic (rollover, then rebuild)");
  {
    const { buildPlan } = await import("../src/app/today/actions");
    clockNow = NOW.getTime();
    try {
      const f = makeFake({ timezone: TZ, programs: [
        { id: "old", user_id: "u1", block_number: 1, started_on: "2026-09-30", ends_on: "2026-10-27", ended_on: null, status: "active" },
      ] });
      actionClient = f.client;
      revalidated.length = 0;
      const res = await buildPlan();
      check("buildPlan returns ok", res.ok === true, JSON.stringify(res));
      const names = rpcs(f.ops).map((r) => r.name);
      check("action RPCs are exactly [rollover_block, rebuild_block]", JSON.stringify(names) === JSON.stringify(["rollover_block", "rebuild_block"]), JSON.stringify(names));
      check("action passes the member's local date to both RPCs", rpcs(f.ops).every((r) => r.args.p_today === localToday), JSON.stringify(rpcs(f.ops).map((r) => r.args.p_today)));
      check("ended block closed as 'completed' by the action", f.programs.find((p) => p.id === "old")?.status === "completed", String(f.programs.find((p) => p.id === "old")?.status));
      check("action revalidates Today, History and Progress", ["/today", "/history", "/progress"].every((p) => revalidated.includes(p)), JSON.stringify(revalidated));

      const g = makeFake({ timezone: TZ, failActiveFetch: "raw action failure", programs: [] });
      actionClient = g.client;
      revalidated.length = 0;
      const { value: bad } = await captureErrors(() => buildPlan());
      check("action surfaces buildPlanLogic's friendly error", !bad.ok && bad.error === REBUILD_FAILED_MESSAGE, JSON.stringify(bad));
      check("action does not revalidate after a failure", revalidated.length === 0, JSON.stringify(revalidated));
    } finally {
      clockNow = FAR_CLOCK;
    }
  }

  console.log(failures ? `\n❌ ${failures} FAIL` : "\n✅ All buildPlanLogic wiring checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
