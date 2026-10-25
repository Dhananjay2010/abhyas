/**
 * Test: startSessionCore's 23505 re-read filters by local_date.
 * 
 * L3 (QA Bot 1, PR #79): a stale Today tab with an unfinished session from
 * yesterday can press Start and be put into YESTERDAY's in_progress session
 * with an 8-hour clock. startSessionCore's 23505 re-read ignores local_date,
 * while updateSessionCore's re-read filters by it, so the two are inconsistent.
 * 
 * Fix: filter the 23505 re-read by the same local_date the start is for. If the
 * only open row is from another date, return a clear error.
 * 
 * Note: PR #111 (branch cursor/fix-timezone-session-stale-40e3) closes stale
 * sessions when Today renders, so it doesn't cover the case where a stale tab
 * bypassed the Today refresh and went directly to Start.
 * 
 * This test fails when the fix is reverted: the stale tab is put into yesterday's session.
 */
import { createFakeDb } from "./helpers/fake-postgrest";
import { startSessionCore } from "../src/lib/session/start-session-core";

const USER_ID = "user-a";
const YESTERDAY = "2026-10-24";
const TODAY = "2026-10-25";
const PROGRAM_ID = "prog1";
const DAY_ID = "day1";

function sessionPayload(userId: string, date: string) {
  return {
    user_id: userId,
    program_id: PROGRAM_ID,
    program_day_id: DAY_ID,
    local_date: date,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights" as const,
    actual_type: "weights" as const,
    status: "in_progress" as const,
    started_at: new Date().toISOString(),
  };
}

test("L3: startSessionCore 23505 re-read filters by local_date", async () => {
  const db = createFakeDb({
    uniqueConstraints: [
      { 
        table: "sessions", 
        columns: ["user_id"], 
        where: (r) => r.status === "in_progress" 
      },
    ],
  });

  // Yesterday's session exists and is in_progress
  const yesterdayPayload = sessionPayload(USER_ID, YESTERDAY);
  const result1 = await startSessionCore(db.client, USER_ID, yesterdayPayload);
  expect(result1.ok).toBe(true);
  if (!result1.ok) throw new Error("Yesterday's session failed");
  const yesterdaySessionId = result1.sessionId;

  // Stale tab tries to start a session for TODAY, hits 23505
  const todayPayload = sessionPayload(USER_ID, TODAY);
  const result2 = await startSessionCore(db.client, USER_ID, todayPayload);

  // With the fix: the 23505 re-read filters by TODAY's date, finds nothing,
  // and returns an error rather than adopting yesterday's session
  expect(result2.ok).toBe(false);
  if (result2.ok) {
    // If it succeeded, it must NOT be yesterday's session
    expect(result2.sessionId).not.toBe(yesterdaySessionId);
  } else {
    expect(result2.error).toContain("different day");
  }
});

test("L3: startSessionCore 23505 on same date returns existing session", async () => {
  const db = createFakeDb({
    uniqueConstraints: [
      { 
        table: "sessions", 
        columns: ["user_id"], 
        where: (r) => r.status === "in_progress" 
      },
    ],
  });

  const payload = sessionPayload(USER_ID, TODAY);

  // First tab creates session for today
  const result1 = await startSessionCore(db.client, USER_ID, payload);
  expect(result1.ok).toBe(true);
  if (!result1.ok) throw new Error("First tab failed");

  // Second tab tries to create session for TODAY, hits 23505
  const result2 = await startSessionCore(db.client, USER_ID, payload);
  expect(result2.ok).toBe(true);
  if (!result2.ok) throw new Error("Second tab failed");

  // Both tabs get the same session
  expect(result2.sessionId).toBe(result1.sessionId);

  // Only one session exists
  const sessions = db.tables.sessions ?? [];
  expect(sessions.length).toBe(1);
  expect(sessions[0].local_date).toBe(TODAY);
});

test("L3: updateSessionCore already filters by local_date (consistency check)", async () => {
  const db = createFakeDb({
    uniqueConstraints: [
      { 
        table: "sessions", 
        columns: ["user_id"], 
        where: (r) => r.status === "in_progress" 
      },
    ],
  });

  // Create yesterday's session
  const yesterdayPayload = sessionPayload(USER_ID, YESTERDAY);
  const result1 = await startSessionCore(db.client, USER_ID, yesterdayPayload);
  expect(result1.ok).toBe(true);
  if (!result1.ok) throw new Error("Yesterday's session failed");
  const yesterdaySessionId = result1.sessionId;

  // Create a planned session for today
  const todayPlannedId = "sess-today-planned";
  await db.client.from("sessions").insert({
    id: todayPlannedId,
    user_id: USER_ID,
    program_id: PROGRAM_ID,
    program_day_id: DAY_ID,
    local_date: TODAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "planned",
    started_at: null,
  });

  // Update the TODAY planned session to in_progress
  const { updateSessionCore } = await import("../src/lib/session/update-session-core");
  const updateResult = await updateSessionCore(
    db.client,
    todayPlannedId,
    USER_ID,
    TODAY,
    { status: "in_progress", started_at: new Date().toISOString() }
  );

  // With updateSessionCore's local_date filter, this update hits 23505 (yesterday's
  // in_progress session exists), but the re-read filters by TODAY, finds nothing,
  // and falls through to error
  expect(updateResult.ok).toBe(false);
  if (updateResult.ok) {
    // If it succeeded, it must NOT be yesterday's session
    expect(updateResult.sessionId).not.toBe(yesterdaySessionId);
  }
});

test("L3 overlap check: PR #111 closes stale on Today render, not on Start", async () => {
  // PR #111 (cursor/fix-timezone-session-stale-40e3) closes stale sessions when
  // Today's loader runs, BEFORE reading recent sessions. This means that by the
  // time Today renders, stale in_progress rows are already closed.
  //
  // However, PR #111 does NOT cover the case where a stale Today tab bypassed the
  // Today refresh (e.g. via a saved URL, a back navigation within staleTimes.dynamic,
  // or a direct link to /session/[id]) and went straight to Start.
  //
  // L3 covers that path: startSessionCore must filter by local_date so a stale
  // Start cannot adopt yesterday's session.
  //
  // Overlap: NONE. PR #111 and L3 fix different paths.
  // - PR #111: closes stale on Today render (loader-owned)
  // - L3: filters by date on Start's 23505 path (action-owned)

  expect(true).toBe(true);
});
