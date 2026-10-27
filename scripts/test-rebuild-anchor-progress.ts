#!/usr/bin/env tsx
/**
 * Behavioural test: a MID-block rebuild of block 1 leaves its weekdays and
 * Progress unchanged, for anchored and pre-#165 members (QA1/APP MED on #168).
 *
 * A member who signs up on a Wednesday gets block 1 anchored to Wed/Fri/Sun
 * (#165). Before the fix, a mid-block rebuild re-planned block 1 on the default
 * Mon/Wed/Fri mapping, so the Monday after the rebuild became a "missed"
 * training day and the current streak collapsed.
 *
 * Everything that decides the outcome is real code:
 *   - createBlockForUser (persist.ts) builds block 1 and the rebuild_block
 *     payload through a real supabase-js client whose fetch is a stub;
 *   - progressStartDate, buildDayRecords and computeStreaks are the functions
 *     the Progress page calls, fed the way the page feeds them (superseded
 *     blocks dropped, program_days keyed by day_index).
 * The rebuild's database effect is applied as the live rebuild_block does it
 * (migration 20261025000025, which replaced 20261025000023's version): the old
 * row becomes superseded with ended_on = p_today - 1, and for a mid-block
 * rebuild (p_today <= ends_on) the new row keeps started_on, ends_on and
 * week_offset; the payload's ends_on is only used after the block has ended.
 *
 * Rule (APP): a rebuild NEVER changes the training weekdays of the block in
 * progress. Two members:
 *   - anchored (signed up after #165): Wed sign-up, block 1 on Wed/Fri/Sun;
 *   - pre-#165 (unanchored): block 1 started on a Thursday but laid out on the
 *     default Mon/Wed/Fri [1,3,5], which must stay [1,3,5] after a rebuild.
 * The pre-#165 block's program_days are seeded as that default layout (what the
 * generator wrote before #165); everything after that is real code.
 *
 * Each scenario runs for Asia/Kolkata and America/Los_Angeles, with instants
 * whose UTC date differs from the member's local date.
 *
 * Mutants in scripts/test-rebuild-rollover-mutants.sh this test must kill by
 * assertion ("❌ FAIL"): D (rebuild anchors to today), F (rebuild never
 * anchored, main's behaviour), K (unanchored members get anchored).
 *
 *   npx tsx scripts/test-rebuild-anchor-progress.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { createBlockForUser } from "../src/lib/program/persist";
import { progressStartDate } from "../src/lib/progress/progress-start-date";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import { addDays } from "../src/lib/dates";
import catalogueFixture from "./fixtures/catalogue.json";

type DayType = Database["public"]["Enums"]["day_type"];
type Day = { dayIndex: number; dayType: DayType };

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function toDays(value: unknown): Day[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) =>
    r && typeof r === "object" && typeof r.day_index === "number" && typeof r.day_type === "string"
      ? [{ dayIndex: r.day_index, dayType: r.day_type as DayType }]
      : [],
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
function rows(data: unknown[], accept: string) {
  if (accept.includes("vnd.pgrst.object")) {
    return data.length === 1 ? json(data[0]) : json({ code: "PGRST116", message: "not one row", details: "", hint: null }, 406);
  }
  return json(data);
}

function buildClient(cfg: {
  timezone: string;
  lastBlockNumber: number | null;
  activeBlock: { block_number: number; started_on: string } | null;
  /** Every block-1 row (superseded included) and the active row's program_days. */
  block1Rows: Array<{ id: string; started_on: string; status: string }>;
  activeDays: Day[];
}) {
  const rec = { insertedDays: [] as Day[], rpc: [] as Array<{ name: string; pToday: unknown; endsOn: unknown; days: Day[] }> };
  const stubFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const path = url.pathname;
    if (path.includes("/rpc/")) {
      rec.rpc.push({ name: path.split("/rpc/")[1] ?? "", pToday: body?.p_today, endsOn: body?.p_payload?.ends_on, days: toDays(body?.p_payload?.days) });
      return json("prog-rpc-1");
    }
    if (method === "POST" && path.endsWith("/programs")) return rows([{ id: "prog-1" }], accept);
    if (method === "POST" && path.endsWith("/program_days")) {
      const days = toDays(body);
      rec.insertedDays.push(...days);
      return rows(days.map((d, i) => ({ id: `pd-${i}`, day_index: d.dayIndex })), accept);
    }
    if (method === "POST" && path.endsWith("/program_day_exercises")) return new Response(null, { status: 201 });
    if (method === "PATCH") return new Response(null, { status: 204 });
    if (path.endsWith("/profiles")) {
      return rows([{
        id: "user-1", goal: "general_fitness", level: "beginner", primary_track: "weights", days_per_week: 3,
        yoga_days_per_week: 0, date_of_birth: "1990-01-01", height_cm: 175, has_all_equipment: true,
        preferred_session_minutes: 45, timezone: cfg.timezone,
      }], accept);
    }
    if (path.endsWith("/body_metrics")) return rows([{ weight_kg: 75 }], accept);
    if (path.endsWith("/user_equipment") || path.endsWith("/user_injuries")) return rows([], accept);
    if (path.endsWith("/program_days")) {
      const active = cfg.block1Rows.find((r) => r.status === "active");
      const wanted = url.searchParams.get("program_id");
      return rows(active && wanted === `eq.${active.id}` ? cfg.activeDays.map((d) => ({ day_index: d.dayIndex, day_type: d.dayType })) : [], accept);
    }
    if (path.endsWith("/exercises")) return rows(catalogueFixture, accept);
    if (path.endsWith("/programs")) {
      if (url.searchParams.get("status") === "eq.active") return rows(cfg.activeBlock ? [cfg.activeBlock] : [], accept);
      if (url.searchParams.get("block_number") === "eq.1") {
        return rows([...cfg.block1Rows].sort((x, y) => x.started_on.localeCompare(y.started_on)), accept);
      }
      return rows(cfg.lastBlockNumber === null ? [] : [{ block_number: cfg.lastBlockNumber }], accept);
    }
    return rows([], accept);
  };
  const client = createClient<Database>("http://stub.local", "anon-key", {
    global: { fetch: stubFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, rec };
}

type BlockRow = { startedOn: string; endsOn: string; weekOffset: number };
/** rebuild_block's date logic, as in migration 20261025000025 (M1). */
function rebuildBlockDates(old: BlockRow, pToday: string, payloadEndsOn: string): BlockRow {
  if (pToday <= old.endsOn) return { ...old };
  const weeks = Math.floor((Date.parse(pToday) - Date.parse(old.startedOn)) / (7 * 86400000));
  return { startedOn: pToday, endsOn: payloadEndsOn, weekOffset: old.weekOffset + weeks };
}
const cycleWeek = (b: BlockRow, date: string) =>
  b.weekOffset + Math.floor((Date.parse(date) - Date.parse(b.startedOn)) / (7 * 86400000)) + 1;

const training = (days: Day[]) => days.filter((d) => d.dayType === "weights" || d.dayType === "bodyweight").map((d) => d.dayIndex).sort((a, b) => a - b);
const byIndex = (days: Day[]) => Object.fromEntries(days.map((d) => [d.dayIndex, d.dayType])) as Record<number, DayType>;

type Session = { local_date: string; actual_type: DayType; status: string; working_set_count: number };
const done = (dates: string[]): Session[] =>
  dates.map((local_date) => ({ local_date, actual_type: "weights", status: "completed", working_set_count: 3 }));

/** Rebuild block 1 mid-block through the real createBlockForUser, then compare Progress before/after. */
async function rebuildAndCompare(opts: {
  timezone: string;
  blockStart: string;
  block1Days: Day[];
  rebuildDate: string;
  rebuildInstant: Date;
  today: string;
  sessions: Session[];
  expectWeekdays: string;
  expectStreak: { current: number; longest: number; totalSessions: number };
}) {
  const again = buildClient({
    timezone: opts.timezone, lastBlockNumber: 1,
    activeBlock: { block_number: 1, started_on: opts.blockStart },
    block1Rows: [{ id: "b1", started_on: opts.blockStart, status: "active" }],
    activeDays: opts.block1Days,
  });
  const rebuilt = await createBlockForUser(again.client, "user-1", { mode: "rebuild", now: opts.rebuildInstant });
  check("mid-block rebuild succeeds through rebuild_block", rebuilt.ok === true && again.rec.rpc[0]?.name === "rebuild_block", JSON.stringify(rebuilt));
  const rpc = again.rec.rpc[0];
  check(`rebuild_block p_today is the member's local date ${opts.rebuildDate}`, rpc?.pToday === opts.rebuildDate, String(rpc?.pToday));
  check(`rebuilt block keeps the weekdays ${opts.expectWeekdays}`, JSON.stringify(training(rpc?.days ?? [])) === opts.expectWeekdays, JSON.stringify(training(rpc?.days ?? [])));

  // Before: block 1 active. After: rebuild_block superseded it (ended_on = p_today - 1),
  // the page's `.neq("status", "superseded")` drops it, and the new row gets the dates
  // rebuild_block gives it from this payload.
  const oldRow: BlockRow = { startedOn: opts.blockStart, endsOn: addDays(opts.blockStart, 27), weekOffset: 0 };
  check(`p_today ${String(rpc?.pToday)} is within the block, so rebuild_block takes its mid-block path`, String(rpc?.pToday) <= oldRow.endsOn);
  const newRow = rebuildBlockDates(oldRow, String(rpc?.pToday), String(rpc?.endsOn));
  check("rebuilt row keeps started_on, ends_on and week_offset", JSON.stringify(newRow) === JSON.stringify(oldRow), JSON.stringify(newRow));
  check("rebuilt row ends in cycle week 4 (no overrun)", cycleWeek(newRow, newRow.endsOn) === 4, String(cycleWeek(newRow, newRow.endsOn)));
  check(`cycle week on ${opts.rebuildDate} unchanged`, cycleWeek(newRow, opts.rebuildDate) === cycleWeek(oldRow, opts.rebuildDate));
  const prePrograms = [{ id: "b1", startedOn: oldRow.startedOn, endsOn: oldRow.endsOn, endedOn: null }];
  const postPrograms = [{ id: "b1r", startedOn: newRow.startedOn, endsOn: newRow.endsOn, endedOn: null }];
  const progress = (programs: typeof prePrograms, dayTypesByProgram: Record<string, Record<number, DayType>>) => {
    const effectiveStart = progressStartDate({ programs, completedSessions: opts.sessions });
    const records = buildDayRecords({ programs, dayTypesByProgram, completedSessions: opts.sessions, today: opts.today, effectiveStart });
    return { records, streaks: computeStreaks(records, opts.today) };
  };
  const pre = progress(prePrograms, { b1: byIndex(opts.block1Days) });
  const post = progress(postPrograms, { b1r: byIndex(rpc?.days ?? []) });

  const e = opts.expectStreak;
  check(`before the rebuild: current ${e.current}, longest ${e.longest}, days trained ${e.totalSessions}`, pre.streaks.current === e.current && pre.streaks.longest === e.longest && pre.streaks.totalSessions === e.totalSessions, JSON.stringify(pre.streaks));
  check("current streak unchanged by the rebuild", post.streaks.current === pre.streaks.current, `${pre.streaks.current} -> ${post.streaks.current}`);
  check("longest streak unchanged by the rebuild", post.streaks.longest === pre.streaks.longest, `${pre.streaks.longest} -> ${post.streaks.longest}`);
  check("days trained unchanged by the rebuild", post.streaks.totalSessions === pre.streaks.totalSessions, `${pre.streaks.totalSessions} -> ${post.streaks.totalSessions}`);
  const postByDate = new Map(post.records.map((r) => [r.localDate, r]));
  const dates = (records: typeof pre.records) => records.map((r) => r.localDate).join(",");
  check("Progress covers exactly the same days", dates(pre.records) === dates(post.records), `${pre.records.length} -> ${post.records.length} days`);
  const changedCompleted = pre.records.filter((r) => postByDate.has(r.localDate) && postByDate.get(r.localDate)!.completed !== r.completed).map((r) => r.localDate);
  check("every past day keeps its completed state", changedCompleted.length === 0, changedCompleted.join(",") || "none");
  const changedPlan = pre.records
    .filter((r) => r.localDate >= opts.rebuildDate && postByDate.get(r.localDate)?.dayType !== r.dayType)
    .map((r) => `${r.localDate}:${r.dayType}->${postByDate.get(r.localDate)?.dayType}`);
  check("from the rebuild day on, every day keeps its planned type", changedPlan.length === 0, changedPlan.join(",") || "none");
}

async function anchoredScenario(name: string, timezone: string, signupInstant: Date, rebuildInstant: Date) {
  const SIGNUP = "2026-10-14"; // Wednesday
  console.log(`\n${name} anchored: Wed sign-up, Wed/Fri/Sun block 1, mid-block rebuild on Mon 2026-10-19`);
  const first = buildClient({ timezone, lastBlockNumber: null, activeBlock: null, block1Rows: [], activeDays: [] });
  const built = await createBlockForUser(first.client, "user-1", { now: signupInstant });
  check("block 1 builds", built.ok === true, JSON.stringify(built));
  check("block 1 is anchored to Wed/Fri/Sun [3,5,7]", JSON.stringify(training(first.rec.insertedDays)) === "[3,5,7]", JSON.stringify(training(first.rec.insertedDays)));
  await rebuildAndCompare({
    timezone, blockStart: SIGNUP, block1Days: first.rec.insertedDays,
    rebuildDate: "2026-10-19", rebuildInstant, today: "2026-10-22",
    sessions: done(["2026-10-14", "2026-10-16", "2026-10-18", "2026-10-21"]),
    expectWeekdays: "[3,5,7]", expectStreak: { current: 4, longest: 4, totalSessions: 4 },
  });
}

async function preAnchorScenario(name: string, timezone: string, rebuildInstant: Date) {
  // Block 1 started Thu 2026-10-15 but, like every plan before #165, sits on the default
  // Mon/Wed/Fri layout. Anchoring it to its start would make Thursday a training day,
  // and Thu 2026-10-22 (not trained) a missed one.
  console.log(`\n${name} pre-#165: block 1 started Thu 2026-10-15 on Mon/Wed/Fri, mid-block rebuild on Tue 2026-10-20`);
  const layout: Day[] = [1, 2, 3, 4, 5, 6, 7].map((dayIndex) => ({ dayIndex, dayType: [1, 3, 5].includes(dayIndex) ? "weights" : "rest" }));
  await rebuildAndCompare({
    timezone, blockStart: "2026-10-15", block1Days: layout,
    rebuildDate: "2026-10-20", rebuildInstant, today: "2026-10-23",
    sessions: done(["2026-10-16", "2026-10-19", "2026-10-21"]),
    expectWeekdays: "[1,3,5]", expectStreak: { current: 3, longest: 3, totalSessions: 3 },
  });
}

(async () => {
  // 2026-10-14 01:30 IST is still 10-13 in UTC; 2026-10-19 01:30 IST is 10-18 in UTC.
  await anchoredScenario("IST", "Asia/Kolkata", new Date("2026-10-13T20:00:00Z"), new Date("2026-10-18T20:00:00Z"));
  // 2026-10-14 20:00 PDT is already 10-15 in UTC; 2026-10-19 20:00 PDT is 10-20 in UTC.
  await anchoredScenario("Los Angeles", "America/Los_Angeles", new Date("2026-10-15T03:00:00Z"), new Date("2026-10-20T03:00:00Z"));
  // 2026-10-20 01:30 IST is 10-19 in UTC; 2026-10-20 20:00 PDT is 10-21 in UTC.
  await preAnchorScenario("IST", "Asia/Kolkata", new Date("2026-10-19T20:00:00Z"));
  await preAnchorScenario("Los Angeles", "America/Los_Angeles", new Date("2026-10-21T03:00:00Z"));
  console.log(failures ? `\n❌ ${failures} FAIL` : "\n✅ All rebuild-anchor Progress checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
