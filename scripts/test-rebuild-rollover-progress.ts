/**
 * Unit tests for pd-b bug fix: rebuilding from Settings after block ends
 * Tests progressStartDate, buildDayRecords/computeStreaks without database
 *
 * Run: npm run test:rebuild-rollover-progress
 */
import { progressStartDate } from "../src/lib/progress/progress-start-date.js";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks.js";
import { rebuildPlanCore } from "../src/lib/program/rebuild-plan-core.js";
import { ensureCurrentBlock } from "../src/lib/program/rollover.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.js";

let testsFailed = 0;
function assert(condition: boolean, message: string, detail = "") {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}${detail ? ` (${detail})` : ""}`);
    testsFailed++;
  } else {
    console.log(`  ✓    ${message}${detail ? ` ${detail}` : ""}`);
  }
}

async function runUnitTests() {
  console.log("TEST: Unit test - progressStartDate with superseded block and earlier sessions");
  {

    // Case: superseded block filtered out, but sessions predate the active block
    const result = progressStartDate({
      programs: [{ startedOn: "2026-10-15" }], // active block starts 10-15
      completedSessions: [
        { local_date: "2026-10-05", actual_type: "weights", status: "completed", working_set_count: 1 },
      ],
    });

    assert(result === "2026-10-05", "progressStartDate picks earlier session date", `got ${result}`);

    console.log("  PASS: progressStartDate unit test\n");
  }

  console.log("TEST: Unit test - buildDayRecords with days before any block");
  {
    // Days before the first block with a completed session should count, but not break streak
    const dayRecords = buildDayRecords({
      programs: [
        { id: "p1", startedOn: "2026-10-10", endsOn: "2026-11-06", endedOn: null },
      ],
      dayTypesByProgram: {},
      completedSessions: [
        { local_date: "2026-10-05", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
        { local_date: "2026-10-11", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
      ],
      today: "2026-10-15",
      effectiveStart: "2026-10-05",
    });

    const streaks = computeStreaks(dayRecords, "2026-10-15");
    assert(streaks.totalSessions === 2, "Days trained counts both sessions", `got ${streaks.totalSessions}`);

    // Days between 10-05 and 10-11 with no block have no template, so they don't break the streak
    console.log("  PASS: buildDayRecords unit test\n");
  }

  console.log("TEST: Unit test - breathing/rest/skipped sessions don't start range");
  {
    // Rest/breathing/skipped sessions don't count toward days trained, so they 
    // shouldn't affect start date - progressStartDate now filters via countsTowardStreak
    const result1 = progressStartDate({
      programs: [{ startedOn: "2026-10-15" }],
      completedSessions: [
        { local_date: "2026-10-05", actual_type: "rest" as const, status: "completed", working_set_count: 0 },
        { local_date: "2026-10-06", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
      ],
    });

    // progressStartDate now filters via countsTowardStreak, so only the weights session counts
    assert(result1 === "2026-10-06", "progressStartDate filters to qualifying sessions", `got ${result1}`);

    // Test with breathing session dated earliest
    const result2 = progressStartDate({
      programs: [{ startedOn: "2026-10-20" }],
      completedSessions: [
        { local_date: "2026-10-01", actual_type: "meditation" as const, status: "completed", working_set_count: 0 },
        { local_date: "2026-10-10", actual_type: "yoga" as const, status: "completed", working_set_count: 0 },
      ],
    });

    // Breathing doesn't count, but yoga does - so yoga session is the first
    assert(result2 === "2026-10-10", "Breathing session ignored, yoga session used", `got ${result2}`);

    // Test with skipped session dated earliest
    const result3 = progressStartDate({
      programs: [{ startedOn: "2026-10-20" }],
      completedSessions: [
        { local_date: "2026-10-05", actual_type: "weights" as const, status: "skipped", working_set_count: 0 },
        { local_date: "2026-10-15", actual_type: "weights" as const, status: "completed", working_set_count: 1 },
      ],
    });

    // Skipped session doesn't count
    assert(result3 === "2026-10-15", "Skipped session ignored", `got ${result3}`);

    console.log("  PASS: breathing/rest/skipped session unit test\n");
  }

  console.log("TEST: Mutant 2 killer - progressStartDate with pre-block session");
  {
    // Fixture: A completed session on 2026-10-05, but block doesn't start until 2026-10-15
    // Expected: progressStartDate returns 2026-10-05 (the earlier session date)
    // Mutant 2 (only return block start) would incorrectly return 2026-10-15
    const result = progressStartDate({
      programs: [{ startedOn: "2026-10-15" }],
      completedSessions: [
        { local_date: "2026-10-05", actual_type: "weights", status: "completed", working_set_count: 3 },
        { local_date: "2026-10-16", actual_type: "weights", status: "completed", working_set_count: 3 },
        { local_date: "2026-10-18", actual_type: "weights", status: "completed", working_set_count: 3 },
      ],
    });

    assert(result === "2026-10-05", "progressStartDate returns pre-block session date (not block start)", `got ${result}`);
    console.log("  PASS: Mutant 2 killer\n");
  }

  console.log("TEST: Mutant 3 killer - buildDayRecords with effectiveStart AFTER firstBlockStart");
  {
    // Fixture: effectiveStart is 2026-10-15 (passed override), but first block starts 2026-10-05 (earlier)
    // Expected: Days trained starts from 2026-10-05 (the EARLIER date, firstBlockStart)
    // Mutant 3 (?? fallback) would incorrectly use effectiveStart (2026-10-15), cutting off early block days
    //
    // Expected values (worked out on paper):
    // - firstBlockStart: 2026-10-05 (block starts early)
    // - effectiveStart: 2026-10-15 (override, later than block)
    // - first (start point): 2026-10-05 (min of the two - should pick block start)
    // - Days with completed sessions: 2026-10-06, 2026-10-16, 2026-10-18 = 3 sessions
    // - The early block day (2026-10-06) should appear in dayRecords
    // - Mutant 3 would start from 2026-10-15, cutting off 2026-10-06

    const dayRecords = buildDayRecords({
      programs: [
        { id: "p1", startedOn: "2026-10-05", endsOn: "2026-11-01", endedOn: null },
      ],
      dayTypesByProgram: {},
      completedSessions: [
        { local_date: "2026-10-06", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
        { local_date: "2026-10-16", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
        { local_date: "2026-10-18", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
      ],
      today: "2026-10-20",
      effectiveStart: "2026-10-15",
    });

    const earlyBlockDay = dayRecords.find((d) => d.localDate === "2026-10-06");
    assert(earlyBlockDay !== undefined, "Early block day (2026-10-06) included in dayRecords", `got ${earlyBlockDay ? "found" : "missing"}`);
    assert(earlyBlockDay?.completed === true, "Early block day marked completed", `got ${earlyBlockDay?.completed}`);
    assert(earlyBlockDay?.actualSessionType === "weights", "Early block day has correct actual session type", `got ${earlyBlockDay?.actualSessionType}`);

    const laterDay1 = dayRecords.find((d) => d.localDate === "2026-10-16");
    assert(laterDay1 !== undefined, "Later day (2026-10-16) included", `got ${laterDay1 ? "found" : "missing"}`);
    assert(laterDay1?.completed === true, "Later day marked completed", `got ${laterDay1?.completed}`);

    const streaks = computeStreaks(dayRecords, "2026-10-20");
    assert(streaks.totalSessions === 3, "Total sessions includes early block day", `got ${streaks.totalSessions}`);

    // Verify that the date range starts from firstBlockStart (2026-10-05), not effectiveStart (2026-10-15)
    const earliestDate = dayRecords.reduce((min, d) => d.localDate < min ? d.localDate : min, dayRecords[0]?.localDate ?? "9999-99-99");
    assert(earliestDate === "2026-10-05", "Day records start from firstBlockStart (min of block and effectiveStart)", `got ${earliestDate}`);

    console.log("  PASS: Mutant 3 killer\n");
  }

  console.log("TEST: Unit test - last-day rebuild (today == ends_on) uses the REAL ensureCurrentBlock");
  {
    // The rollover boundary lives in rollover.ts (`active.ends_on >= today`), so this
    // drives rebuildPlanCore with the REAL ensureCurrentBlock and a client that records
    // every call. On the last day the block is current: no database call, no rollover.
    // The day after, the same code must try to roll over (and here fails, because the
    // recording client returns errors), so createBlock must not run.
    const dbCalls: string[] = [];
    const failing = { data: null, error: { message: "recording client" } };
    const chain = (table: string): Record<string, unknown> => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "lt", "in"]) c[m] = () => c;
      c.single = () => Promise.resolve(failing);
      c.maybeSingle = () => Promise.resolve(failing);
      c.then = (res: (v: unknown) => unknown) => { dbCalls.push(`from:${table}`); return Promise.resolve(failing).then(res); };
      dbCalls.push(`from:${table}`);
      return c;
    };
    const client = {
      from: (t: string) => chain(t),
      rpc: (n: string) => { dbCalls.push(`rpc:${n}`); return Promise.resolve(failing); },
    } as unknown as SupabaseClient<Database>;

    const run = async (today: string) => {
      const callLog: string[] = [];
      dbCalls.length = 0;
      const origError = console.error;
      console.error = () => {};
      try {
        const result = await rebuildPlanCore({
          userId: "test-user",
          today,
          fetchActiveBlock: async () => { callLog.push("fetchActiveBlock"); return { id: "block1", ends_on: "2026-10-27" }; },
          ensureCurrentBlock: async (active) => { callLog.push("ensureCurrentBlock"); return ensureCurrentBlock(client, "test-user", today, active); },
          createBlock: async () => { callLog.push("createBlock"); return { ok: true as const, programId: "prog1", blockNumber: 1 }; },
        });
        return { result, callLog: [...callLog], dbCalls: [...dbCalls] };
      } finally {
        console.error = origError;
      }
    };

    const last = await run("2026-10-27");
    assert(last.result.ok === true, "Last-day rebuild succeeds");
    assert(JSON.stringify(last.callLog) === JSON.stringify(["fetchActiveBlock", "ensureCurrentBlock", "createBlock"]), "Last day: fetch, ensure, then createBlock", last.callLog.join(","));
    assert(last.dbCalls.length === 0, "Last day: real ensureCurrentBlock makes no DB call (block still current)", `got ${last.dbCalls.join(",") || "none"}`);

    const after = await run("2026-10-28");
    assert(after.dbCalls.length > 0, "Day after ends_on: real ensureCurrentBlock goes to the database to roll over", `got ${after.dbCalls.length}`);
    assert(after.result.ok === false && !after.callLog.includes("createBlock"), "Day after ends_on: a failed rollover stops before createBlock", after.callLog.join(","));

    console.log("  PASS: last-day rebuild unit test\n");
  }

  // The buildPlan server action itself is exercised for real in
  // scripts/test-build-plan-logic-wiring.ts (section A1).

  console.log("TEST: Wiring - Progress page renders days trained and streak with pre-block sessions");
  {
    // Test that Progress correctly computes metrics with min() logic
    // This exercises progressStartDate, buildDayRecords, and streaks with the fix:
    // - progressStartDate uses min(firstBlockStart, firstSessionDate)
    // - With min(): if block starts before first session, start = block start
    // - With ??: would incorrectly use first session date, cutting off early block days
    
    // Scenario: Block starts 2026-10-05, but first session is later at 2026-10-10
    // With min(): start = 2026-10-05 (block start, correct)
    // With ??: start = 2026-10-10 (session date, wrong - cuts off early block days)
    const programs = [{ startedOn: "2026-10-05" }];
    const completedSessions = [
      { local_date: "2026-10-10", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
      { local_date: "2026-10-12", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    ];
    
    const startDate = progressStartDate({ programs, completedSessions });
    assert(startDate === "2026-10-05", "Start date is block start (earlier than first session)", `got ${startDate}`);
    
    // Days trained should include both sessions
    const dayRecords = buildDayRecords({
      programs: [{ id: "prog1", startedOn: "2026-10-05", endsOn: "2026-11-05" }],
      dayTypesByProgram: { "prog1": { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "weights", 6: "rest", 7: "rest" } },
      completedSessions,
      today: "2026-10-15",
      effectiveStart: startDate,
    });
    
    // Check that day records start from block start, not first session date
    const day1 = dayRecords.find(d => d.localDate === "2026-10-05");
    assert(day1 !== undefined, "Day 1 (block start) included in records", `day records start at ${dayRecords[0]?.localDate}`);
    
    const completedDays = dayRecords.filter(d => d.completed);
    assert(completedDays.length === 2, "2 completed days counted", `got ${completedDays.length}`);
    
    // Streak should include the sessions
    const streakResult = computeStreaks(dayRecords, "2026-10-15");
    assert(streakResult.longest >= 1, "Streak includes sessions", `got ${streakResult.longest}`);
    
    console.log("  ✓ Progress page wiring verified\n");
  }

  console.log("TEST: Unit test - rebuildPlanCore call order and error handling");
  {
    const callLog: string[] = [];

    // Happy path: ensureCurrentBlock runs before createBlock
    const happyDeps = {
      userId: "test-user",
      today: "2026-10-27",
      fetchActiveBlock: async () => {
        callLog.push("fetchActiveBlock");
        return { id: "block1", ends_on: "2026-10-20" };
      },
      ensureCurrentBlock: async () => {
        callLog.push("ensureCurrentBlock");
        return { status: "current" as const, programId: "prog1" };
      },
      createBlock: async () => {
        callLog.push("createBlock");
        return { ok: true as const, programId: "prog2", blockNumber: 2 };
      },
    };

    callLog.length = 0;
    const happyResult = await rebuildPlanCore(happyDeps);
    assert(happyResult.ok === true, "rebuildPlanCore succeeds with valid deps");
    assert(callLog.length === 3, "All three functions called", `got ${callLog.length}`);
    assert(callLog[0] === "fetchActiveBlock", "fetchActiveBlock called first", `got ${callLog[0]}`);
    assert(callLog[1] === "ensureCurrentBlock", "ensureCurrentBlock called second", `got ${callLog[1]}`);
    assert(callLog[2] === "createBlock", "createBlock called third (after ensureCurrentBlock)", `got ${callLog[2]}`);

    // ensureCurrentBlock error: createBlock is never called
    const rolloverErrorDeps = {
      userId: "test-user",
      today: "2026-10-27",
      fetchActiveBlock: async () => {
        callLog.push("fetchActiveBlock");
        return { id: "block1", ends_on: "2026-10-20" };
      },
      ensureCurrentBlock: async () => {
        callLog.push("ensureCurrentBlock");
        return { status: "error" as const, error: "Rollover failed" };
      },
      createBlock: async () => {
        callLog.push("createBlock");
        return { ok: true as const, programId: "prog2", blockNumber: 2 };
      },
    };

    callLog.length = 0;
    const rolloverErrorResult = await rebuildPlanCore(rolloverErrorDeps);
    assert(rolloverErrorResult.ok === false, "rebuildPlanCore returns error from ensureCurrentBlock");
    assert(callLog.length === 2, "createBlock not called after ensureCurrentBlock error", `got ${callLog.length}, calls: ${callLog.join(", ")}`);
    assert(callLog[0] === "fetchActiveBlock", "fetchActiveBlock called first", `got ${callLog[0]}`);
    assert(callLog[1] === "ensureCurrentBlock", "ensureCurrentBlock called second", `got ${callLog[1]}`);

    // createBlock error: error is passed back
    const createErrorDeps = {
      userId: "test-user",
      today: "2026-10-27",
      fetchActiveBlock: async () => {
        callLog.push("fetchActiveBlock");
        return { id: "block1", ends_on: "2026-10-20" };
      },
      ensureCurrentBlock: async () => {
        callLog.push("ensureCurrentBlock");
        return { status: "rolled_over" as const, programId: "prog1", blockNumber: 2 };
      },
      createBlock: async () => {
        callLog.push("createBlock");
        return { ok: false as const, error: "Create failed" };
      },
    };

    callLog.length = 0;
    const createErrorResult = await rebuildPlanCore(createErrorDeps);
    assert(createErrorResult.ok === false, "rebuildPlanCore returns error from createBlock");
    assert(callLog.length === 3, "All three functions called", `got ${callLog.length}`);
    assert(callLog[2] === "createBlock", "createBlock called last", `got ${callLog[2]}`);

    console.log("  PASS: rebuildPlanCore unit test\n");
  }

  if (testsFailed === 0) {
    console.log("\n✅ ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${testsFailed} TESTS FAILED`);
    process.exit(1);
  }
}

runUnitTests().catch((error) => {
  console.error("\nTest error:", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
