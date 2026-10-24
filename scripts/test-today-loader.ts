/**
 * Test loadTodaySessionState loader: c2, e1, f2 page wiring.
 * Typed fakes ensure the page passes correct data to the loader.
 * 
 *   npx tsx scripts/test-today-loader.ts
 */

import { 
  loadTodaySessionState,
  type TodayLoaderDeps,
  type OpenSessionRow
} from "../src/lib/today/loader";
import type { SessionForDetection } from "../src/lib/today/session-detection";

class FakeTodayLoaderDeps implements TodayLoaderDeps {
  private openSessions: OpenSessionRow[] | null = null;
  private creditedToReturn = 0;
  
  recordedCloseStaleInput: OpenSessionRow[] = [];
  recordedCloseStaleToday: string | null = null;

  setOpenSessions(sessions: OpenSessionRow[] | null) {
    this.openSessions = sessions;
  }

  setCreditedCount(count: number) {
    this.creditedToReturn = count;
  }

  async fetchOpenSessions(): Promise<OpenSessionRow[] | null> {
    return this.openSessions;
  }

  async closeStale(input: OpenSessionRow[], today: string): Promise<number> {
    this.recordedCloseStaleInput = input;
    this.recordedCloseStaleToday = today;
    return this.creditedToReturn;
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. c2: creditedBanner reflects the count closeStale returned");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "s1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
  ]);
  fake.setCreditedCount(2);

  const allSessions: SessionForDetection[] = [];
  const todaySessions: SessionForDetection[] = [];

  const result = await loadTodaySessionState(fake, allSessions, todaySessions, "2026-10-25");

  check("credited count is 2", result.credited === 2);
  check("c2: creditedBanner shows 2 sessions", result.creditedBanner?.startsWith("2 sessions") === true);
}

console.log("\n2. e1: strengthOpen searches all sessions (not just today's)");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([]);
  fake.setCreditedCount(0);

  const allSessions: SessionForDetection[] = [
    { id: "yesterday", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z" },
    { id: "breathe", status: "in_progress", actual_type: "meditation", local_date: "2026-10-24" },
  ];
  const todaySessions: SessionForDetection[] = [
    { id: "today", status: "planned", actual_type: "bodyweight", local_date: "2026-10-25" },
  ];

  const result = await loadTodaySessionState(fake, allSessions, todaySessions, "2026-10-25");

  check("e1: strengthOpen found", result.strengthOpen !== undefined);
  check("e1: strengthOpen is yesterday's in_progress", result.strengthOpen?.id === "yesterday");
}

console.log("\n3. f2: closeStale receives each row's real started_at");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions([
    { id: "s1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
    { id: "s2", local_date: "2026-10-25", started_at: null, actual_type: "bodyweight", status: "in_progress" },
  ]);
  fake.setCreditedCount(1);

  const allSessions: SessionForDetection[] = [];
  const todaySessions: SessionForDetection[] = [];

  const result = await loadTodaySessionState(fake, allSessions, todaySessions, "2026-10-25");

  check("f2: closeStale called", fake.recordedCloseStaleInput.length === 2);
  check("f2: first row has real started_at", fake.recordedCloseStaleInput[0].started_at === "2026-10-24T10:00:00Z");
  check("f2: second row has null started_at", fake.recordedCloseStaleInput[1].started_at === null);
  check("f2: today passed correctly", fake.recordedCloseStaleToday === "2026-10-25");
}

console.log("\n4. null openSessions handled gracefully");
{
  const fake = new FakeTodayLoaderDeps();
  fake.setOpenSessions(null);
  fake.setCreditedCount(0);

  const allSessions: SessionForDetection[] = [];
  const todaySessions: SessionForDetection[] = [];

  const result = await loadTodaySessionState(fake, allSessions, todaySessions, "2026-10-25");

  check("closeStale received empty array", fake.recordedCloseStaleInput.length === 0);
  check("credited is 0", result.credited === 0);
  check("creditedBanner is null", result.creditedBanner === null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
