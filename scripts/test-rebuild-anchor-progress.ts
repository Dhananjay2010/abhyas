#!/usr/bin/env tsx
/**
 * Behavioural test: a MID-block rebuild of an anchored block 1 leaves Progress
 * unchanged (QA1/APP MED on #168).
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
 * The rebuild's database effect is applied as rebuild_block does it
 * (migration 20261025000023): the old row becomes superseded with
 * ended_on = p_today - 1 and a new row starts on p_today.
 *
 * Run for Asia/Kolkata and America/Los_Angeles, with instants whose UTC date
 * differs from the member's local date.
 *
 * Mutants D (rebuild anchors to today) and E (rebuild not anchored, main's
 * behaviour) in scripts/test-rebuild-rollover-mutants.sh must fail this test
 * by assertion ("❌ FAIL").
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
  block1Starts: string[];
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
    if (path.endsWith("/exercises")) return rows(catalogueFixture, accept);
    if (path.endsWith("/programs")) {
      if (url.searchParams.get("status") === "eq.active") return rows(cfg.activeBlock ? [cfg.activeBlock] : [], accept);
      if (url.searchParams.get("block_number") === "eq.1") {
        return rows([...cfg.block1Starts].sort().slice(0, 1).map((started_on) => ({ started_on })), accept);
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

const training = (days: Day[]) => days.filter((d) => d.dayType === "weights" || d.dayType === "bodyweight").map((d) => d.dayIndex).sort((a, b) => a - b);
const byIndex = (days: Day[]) => Object.fromEntries(days.map((d) => [d.dayIndex, d.dayType])) as Record<number, DayType>;

const SIGNUP = "2026-10-14"; // Wednesday
const REBUILD = "2026-10-19"; // Monday, mid-block
const TODAY = "2026-10-22"; // Thursday
const sessions = ["2026-10-14", "2026-10-16", "2026-10-18", "2026-10-21"].map((local_date) => ({
  local_date, actual_type: "weights" as DayType, status: "completed", working_set_count: 3,
}));

async function scenario(name: string, timezone: string, signupInstant: Date, rebuildInstant: Date) {
  console.log(`\n${name}: Wed sign-up, Wed/Fri/Sun block 1, mid-block rebuild on Mon ${REBUILD}`);

  const first = buildClient({ timezone, lastBlockNumber: null, activeBlock: null, block1Starts: [] });
  const built = await createBlockForUser(first.client, "user-1", { now: signupInstant });
  check("block 1 builds", built.ok === true, JSON.stringify(built));
  const block1Days = first.rec.insertedDays;
  check("block 1 is anchored to Wed/Fri/Sun [3,5,7]", JSON.stringify(training(block1Days)) === "[3,5,7]", JSON.stringify(training(block1Days)));

  const again = buildClient({ timezone, lastBlockNumber: 1, activeBlock: { block_number: 1, started_on: SIGNUP }, block1Starts: [SIGNUP] });
  const rebuilt = await createBlockForUser(again.client, "user-1", { mode: "rebuild", now: rebuildInstant });
  check("mid-block rebuild succeeds through rebuild_block", rebuilt.ok === true && again.rec.rpc[0]?.name === "rebuild_block", JSON.stringify(rebuilt));
  const rpc = again.rec.rpc[0];
  check(`rebuild_block p_today is the member's local date ${REBUILD}`, rpc?.pToday === REBUILD, String(rpc?.pToday));
  check("rebuilt block keeps Wed/Fri/Sun [3,5,7]", JSON.stringify(training(rpc?.days ?? [])) === "[3,5,7]", JSON.stringify(training(rpc?.days ?? [])));

  // Progress before the rebuild: block 1 active.
  const prePrograms = [{ id: "b1", startedOn: SIGNUP, endsOn: addDays(SIGNUP, 27), endedOn: null }];
  const preTypes = { b1: byIndex(block1Days) };
  // Progress after: rebuild_block superseded b1 (ended_on = p_today - 1) and the page's
  // `.neq("status", "superseded")` drops it; the new row starts on p_today.
  const postPrograms = [{ id: "b1r", startedOn: String(rpc?.pToday), endsOn: String(rpc?.endsOn), endedOn: null }];
  const postTypes = { b1r: byIndex(rpc?.days ?? []) };

  const progress = (programs: typeof prePrograms, dayTypesByProgram: Record<string, Record<number, DayType>>) => {
    const effectiveStart = progressStartDate({ programs, completedSessions: sessions });
    const records = buildDayRecords({ programs, dayTypesByProgram, completedSessions: sessions, today: TODAY, effectiveStart });
    return { records, streaks: computeStreaks(records, TODAY) };
  };
  const pre = progress(prePrograms, preTypes);
  const post = progress(postPrograms, postTypes);

  check("before the rebuild: current streak 4, longest 4, days trained 4", pre.streaks.current === 4 && pre.streaks.longest === 4 && pre.streaks.totalSessions === 4, JSON.stringify(pre.streaks));
  check("current streak unchanged by the rebuild", post.streaks.current === pre.streaks.current, `${pre.streaks.current} -> ${post.streaks.current}`);
  check("longest streak unchanged by the rebuild", post.streaks.longest === pre.streaks.longest, `${pre.streaks.longest} -> ${post.streaks.longest}`);
  check("days trained unchanged by the rebuild", post.streaks.totalSessions === pre.streaks.totalSessions, `${pre.streaks.totalSessions} -> ${post.streaks.totalSessions}`);
  const sameDates = JSON.stringify(pre.records.map((r) => r.localDate)) === JSON.stringify(post.records.map((r) => r.localDate));
  check("Progress covers the same days before and after", sameDates, `${pre.records[0]?.localDate}..${pre.records.at(-1)?.localDate} vs ${post.records[0]?.localDate}..${post.records.at(-1)?.localDate}`);
  const changedCompleted = pre.records.filter((r, i) => post.records[i]?.completed !== r.completed).map((r) => r.localDate);
  check("every past day keeps its completed state", changedCompleted.length === 0, changedCompleted.join(",") || "none");
  const changedPlan = pre.records.filter((r, i) => r.localDate >= REBUILD && post.records[i]?.dayType !== r.dayType).map((r) => `${r.localDate}:${r.dayType}->${post.records.find((p) => p.localDate === r.localDate)?.dayType}`);
  check(`from the rebuild day on, every day keeps its planned type`, changedPlan.length === 0, changedPlan.join(",") || "none");
}

(async () => {
  // 2026-10-14 01:30 IST is still 10-13 in UTC; 2026-10-19 01:30 IST is 10-18 in UTC.
  await scenario("IST", "Asia/Kolkata", new Date("2026-10-13T20:00:00Z"), new Date("2026-10-18T20:00:00Z"));
  // 2026-10-14 20:00 PDT is already 10-15 in UTC; 2026-10-19 20:00 PDT is 10-20 in UTC.
  await scenario("Los Angeles", "America/Los_Angeles", new Date("2026-10-15T03:00:00Z"), new Date("2026-10-20T03:00:00Z"));
  console.log(failures ? `\n❌ ${failures} FAIL` : "\n✅ All rebuild-anchor Progress checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
