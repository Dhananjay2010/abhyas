/**
 * Unit tests for pd-b bug fix: rebuilding from Settings after block ends
 * Tests progressStartDate, buildDayRecords/computeStreaks without database
 *
 * Run: npm run test:rebuild-rollover-progress
 */

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
    const { progressStartDate } = await import("../src/lib/progress/progress-start-date.js");

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
    const { buildDayRecords, computeStreaks } = await import("../src/lib/progress/streaks.js");

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
    const { progressStartDate } = await import("../src/lib/progress/progress-start-date.js");

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

  console.log("TEST: Unit test - rebuildPlanCore call order and error handling");
  {
    const { rebuildPlanCore } = await import("../src/lib/program/rebuild-plan-core.js");

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
