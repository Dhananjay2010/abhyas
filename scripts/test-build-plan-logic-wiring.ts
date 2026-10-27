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
 * Mutant M-B in scripts/test-rebuild-rollover-mutants.sh makes buildPlanLogic skip
 * rebuildPlanCore and call createBlockForUser(..., { mode: "rebuild" }) directly;
 * this test must then fail by assertion ("❌ FAIL").
 *
 *   npx tsx scripts/test-build-plan-logic-wiring.ts
 */

import { readFileSync } from "fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { buildPlanLogic } from "../src/lib/program/build-plan-logic";
import { localDateString, addDays } from "../src/lib/dates";

type Row = Record<string, unknown>;
type Op =
  | { kind: "query"; table: string; select: string | null; filters: string[]; terminal: string }
  | { kind: "write"; table: string; method: string }
  | { kind: "rpc"; name: string; args: Row };

// The committed fixture is exported from active rows only; restore the column the queries filter on.
const catalogue = (JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8")) as Row[]).map((e) => ({ ...e, is_active: true }));

function makeFake(opts: { timezone: string; programs: Row[] }) {
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
    c.maybeSingle = () => Promise.resolve(run("maybeSingle"));
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run("await")).then(res, rej);
    return c;
  }

  async function rpc(name: string, args: Row) {
    ops.push({ kind: "rpc", name, args });
    const payload = args.p_payload as Row;
    if (name === "rollover_block") {
      // Mirror the real RPC: close the ended active block as completed, open the next.
      for (const p of programs) if (p.status === "active") { p.status = "completed"; p.ended_on = addDays(args.p_today as string, -1); }
      programs.push({ id: payload.id, user_id: "u1", block_number: payload.block_number, started_on: args.p_today, ends_on: payload.ends_on, ended_on: null, status: "active" });
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

(async () => {
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

  console.log(failures ? `\n❌ ${failures} FAIL` : "\n✅ All buildPlanLogic wiring checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
