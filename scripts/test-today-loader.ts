/**
 * Test loadTodaySessionState loader: call ordering, c2, e1, f2.
 * Typed fakes ensure close-before-read and correct data flow.
 * 
 *   npx tsx scripts/test-today-loader.ts
 */

import { 
  loadTodaySessionState,
  type TodayLoaderDeps,
  type OpenSessionRow,
  type RecentSessionRow
} from "../src/lib/today/loader";

class FakeTodayLoaderDeps implements TodayLoaderDeps {
  private openSessions: OpenSessionRow[] | null = null;
  private creditedToReturn = 0;
  private recentSessions: RecentSessionRow[] | null = null;
  
  recordedCloseStaleInput: OpenSessionRow[] = [];
  recordedCloseStaleToday: string | null = null;
  callOrder: string[] = [];

  setOpenSessions(sessions: OpenSessionRow[] | null) {
    this.openSessions = sessions;
  }

  setCreditedCount(count: number) {
    this.creditedToReturn = count;
  }

  setRecentSessions(sessions: RecentSessionRow[] | null) {
    this.recentSessions = sessions;
  }

  async fetchOpenSessions(): Promise<OpenSessionRow[] | null> {
    this.callOrder.push("fetchOpenSessions");
    return this.openSessions;
  }

  async closeStale(input: OpenSessionRow[], today: string): Promise<number> {
    this.callOrder.push("closeStale");
    this.recordedCloseStaleInput = input;
    this.recordedCloseStaleToday = today;
    return this.creditedToReturn;
  }

  async fetchRecentSessions(): Promise<RecentSessionRow[] | null> {
    this.callOrder.push("fetchRecentSessions");
    return this.recentSessions;
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Call order: closeStale runs BEFORE fetchRecentSessions");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([]);
  fake.setCreditedCount(0);
  fake.setRecentSessions([]);

  await loadTodaySessionState(fake, "2026-10-25");

  check("3 calls made", fake.callOrder.length === 3);
  check("fetchOpenSessions first", fake.callOrder[0] === "fetchOpenSessions");
  check("closeStale second", fake.callOrder[1] === "closeStale");
  check("fetchRecentSessions last (after closeStale)", fake.callOrder[2] === "fetchRecentSessions");
}

console.log("\n2. Closed session not in strengthOpen: closeStale flips status before read");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "yesterday", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z", actual_type: "weights", status: "in_progress" },
  ]);
  fake.setCreditedCount(1);
  // After closeStale, fetchRecentSessions returns the row as completed
  fake.setRecentSessions([
    { id: "yesterday", status: "completed", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z", program_day_id: "day1", created_at: "2026-10-24T10:00:00Z" },
  ]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("closeStale ran before read", fake.callOrder[1] === "closeStale");
  check("fetchRecentSessions ran after close", fake.callOrder[2] === "fetchRecentSessions");
  check("strengthOpen is undefined (closed row not found)", result.strengthOpen === undefined);
  check("credited is 1", result.credited === 1);
}

console.log("\n3. c2: creditedBanner reflects the count closeStale returned");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "s1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
  ]);
  fake.setCreditedCount(2);
  fake.setRecentSessions([]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("credited count is 2", result.credited === 2);
  check("c2: creditedBanner shows 2 sessions", result.creditedBanner?.startsWith("2 sessions") === true);
}

console.log("\n4. e1: strengthOpen searches all sessions (not just today's)");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([]);
  fake.setCreditedCount(0);
  fake.setRecentSessions([
    { id: "yesterday", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z", program_day_id: "day1", created_at: "2026-10-24T10:00:00Z" },
    { id: "breathe", status: "in_progress", actual_type: "meditation", local_date: "2026-10-24", started_at: null, program_day_id: null, created_at: "2026-10-24T11:00:00Z" },
    { id: "today", status: "planned", actual_type: "bodyweight", local_date: "2026-10-25", started_at: null, program_day_id: "day2", created_at: "2026-10-25T00:00:00Z" },
  ]);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("e1: strengthOpen found", result.strengthOpen !== undefined);
  check("e1: strengthOpen is yesterday's in_progress", result.strengthOpen?.id === "yesterday");
}

console.log("\n5. f2: closeStale receives each row's real started_at");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "s1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
    { id: "s2", local_date: "2026-10-25", started_at: null, actual_type: "bodyweight", status: "in_progress" },
  ]);
  fake.setCreditedCount(1);
  fake.setRecentSessions([]);

  await loadTodaySessionState(fake, "2026-10-25");

  check("f2: closeStale called", fake.recordedCloseStaleInput.length === 2);
  check("f2: first row has real started_at", fake.recordedCloseStaleInput[0].started_at === "2026-10-24T10:00:00Z");
  check("f2: second row has null started_at", fake.recordedCloseStaleInput[1].started_at === null);
  check("f2: today passed correctly", fake.recordedCloseStaleToday === "2026-10-25");
}

console.log("\n6. null openSessions and recentSessions handled gracefully");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions(null);
  fake.setCreditedCount(0);
  fake.setRecentSessions(null);

  const result = await loadTodaySessionState(fake, "2026-10-25");

  check("closeStale received empty array", fake.recordedCloseStaleInput.length === 0);
  check("credited is 0", result.credited === 0);
  check("creditedBanner is null", result.creditedBanner === null);
  check("allSessions is empty", result.allSessions.length === 0);
  check("todaySessions is empty", result.todaySessions.length === 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
