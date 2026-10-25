#!/usr/bin/env tsx
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

export {};

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

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

async function main() {
  console.log("Testing startSessionCore local_date filtering\n");

await test("L3: startSessionCore 23505 re-read filters by local_date", async () => {
  const db = createFakeDb({
    unique: [
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
  if (!result1.ok) throw new Error("Yesterday's session failed");

  // Stale tab tries to start a session for TODAY, hits 23505
  const todayPayload = sessionPayload(USER_ID, TODAY);
  const result2 = await startSessionCore(db.client, USER_ID, todayPayload);

  // With the fix: the 23505 re-read filters by TODAY's date, finds nothing,
  // and returns an error instructing the user to reload.
  if (result2.ok) {
    throw new Error(`Expected error, got ok with session ${result2.sessionId}`);
  }
  if (!result2.error.includes("already in progress")) {
    throw new Error(`Expected 'already in progress' error, got: ${result2.error}`);
  }
  // Verify it did NOT adopt yesterday's session
  const sessions = db.tables.sessions ?? [];
  const todaySessions = sessions.filter((s) => s.local_date === TODAY && s.status === "in_progress");
  if (todaySessions.length > 0) {
    throw new Error("A new session for today should not have been created");
  }
});

await test("L3: startSessionCore 23505 on same date returns existing session", async () => {
  const db = createFakeDb({
    unique: [
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
  if (!result1.ok) throw new Error("First tab failed");

  // Second tab tries to create session for TODAY, hits 23505
  const result2 = await startSessionCore(db.client, USER_ID, payload);
  if (!result2.ok) throw new Error("Second tab failed");

  // Both tabs get the same session
  if (result2.sessionId !== result1.sessionId) {
    throw new Error(`Expected same session, got ${result2.sessionId} !== ${result1.sessionId}`);
  }

  // Only one session exists
  const sessions = db.tables.sessions ?? [];
  if (sessions.length !== 1) throw new Error(`Expected 1 session, got ${sessions.length}`);
  if (sessions[0].local_date !== TODAY) throw new Error(`Expected ${TODAY}, got ${sessions[0].local_date}`);
});


  console.log(`\nPassed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
