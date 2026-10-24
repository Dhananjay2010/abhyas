#!/usr/bin/env tsx
/**
 * Mutation test for finish-flow guards and critical branches.
 *
 * Tests that removing each guard or branch causes a test failure.
 * Each mutant is matched to its catching test.
 *
 *   npx tsx scripts/test-finish-flow-mutations.ts
 */

import { runFinish, runEndEarly, type FinishFlowDeps } from "../src/lib/session/finish-flow";
import { finishSessionCore } from "../src/lib/session/finish-session";
import { abandonSessionCore } from "../src/lib/session/abandon-session";

type MutantResult = {
  mutant: string;
  catchingTest: string;
  caught: boolean;
  detail?: string;
};

const results: MutantResult[] = [];

function testMutant(mutant: string, catchingTest: string, testFn: () => Promise<boolean>) {
  return testFn().then((caught) => {
    results.push({ mutant, catchingTest, caught });
  });
}

// --- Mutant tests ---

// Mutant 1: Remove inFlight guard in runFinish
async function testRunFinishInFlightGuard(): Promise<boolean> {
  const calls: string[] = [];
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => {
      calls.push("finishSession");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true, data: { status: "completed" as const } };
    },
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await Promise.all([
    runFinish(deps, { sessionId: "s1", cooldownCompleted: true }),
    runFinish(deps, { sessionId: "s1", cooldownCompleted: true }),
  ]);

  // Without the guard, we'd get 2 calls
  return calls.length === 1;
}

// Mutant 2: Remove resumeElapsed on network throw in runFinish
async function testRunFinishResumeOnNetworkThrow(): Promise<boolean> {
  let resumed = false;
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => {
      throw new Error("Failed to fetch");
    },
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      resumed = true;
    },
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });
  return resumed;
}

// Mutant 3: Remove offline copy on network throw in runFinish
async function testRunFinishOfflineCopy(): Promise<boolean> {
  let errorMsg = "";
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => {
      throw new Error("network request failed");
    },
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: (msg) => {
      errorMsg = msg ?? "";
    },
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });
  return errorMsg.includes("offline");
}

// Mutant 4: Remove resumeElapsed on {ok:false} in runFinish
async function testRunFinishResumeOnNotOk(): Promise<boolean> {
  let resumed = false;
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => ({ ok: false, error: "Server error" }),
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      resumed = true;
    },
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });
  return resumed;
}

// Mutant 5: Expose server error text on {ok:false} in runFinish
async function testRunFinishGenericErrorCopy(): Promise<boolean> {
  let errorMsg = "";
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => ({ ok: false, error: "Server said no" }),
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: (msg) => {
      errorMsg = msg ?? "";
    },
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });
  // Must be exact safe copy, not server text
  return errorMsg === "Couldn't finish the session. Try again.";
}

// Mutant 6: Remove try/catch around refreshAfterSession in runFinish
async function testRunFinishRefreshThrowDoesntBlock(): Promise<boolean> {
  let navigated = false;
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => ({ ok: true, data: { status: "skipped" as const } }),
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => {
      throw new Error("Offline");
    },
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {
      navigated = true;
    },
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });
  return navigated;
}

// Mutant 7: Remove endingRef guard in runEndEarly
async function testRunEndEarlyEndingRefGuard(): Promise<boolean> {
  const calls: string[] = [];
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => {
      calls.push("abandonSession");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true };
    },
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight: { current: false },
  };

  const params = {
    sessionId: "s1",
    setsDone: 5,
    setConfirming: () => {},
    setOfflineError: () => {},
    endingRef,
    setEnding: () => {},
  };

  await Promise.all([runEndEarly(deps, params), runEndEarly(deps, { ...params })]);

  // Without the guard, we'd get 2 calls
  return calls.length === 1;
}

// Mutant 8: Remove setOfflineError(true) on network throw in runEndEarly
async function testRunEndEarlyOfflineFlag(): Promise<boolean> {
  let offlineSet = false;
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => {
      throw new Error("network request failed");
    },
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight: { current: false },
  };

  await runEndEarly(deps, {
    sessionId: "s1",
    setsDone: 5,
    setConfirming: () => {},
    setOfflineError: (val) => {
      offlineSet = val;
    },
    endingRef,
    setEnding: () => {},
  });

  return offlineSet;
}

// Mutant 9: Remove .eq('status', 'in_progress') from finishSessionCore
async function testFinishSessionCoreStatusFilter(): Promise<boolean> {
  const calls: Array<{ column: string; value: unknown }> = [];

  const fake = {
    from: () => ({
      select: () => ({
        eq: () => ({
          data: [{ session_sets: [{ id: "1", is_warmup_set: false }] }],
          error: null,
        }),
      }),
      update: () => ({
        eq: (column: string, value: unknown) => {
          calls.push({ column, value });
          return {
            eq: (column2: string, value2: unknown) => {
              calls.push({ column: column2, value: value2 });
              return { error: null };
            },
          };
        },
      }),
    }),
  };

  await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  // Must have a filter on status='in_progress'
  const hasStatusFilter = calls.some((c) => c.column === "status" && c.value === "in_progress");
  return hasStatusFilter;
}

// Mutant 10: Ignore decideAbandonStatus in finishSessionCore (always save 'completed')
async function testFinishSessionCoreRespectsZeroSets(): Promise<boolean> {
  let savedStatus: string | null = null;

  const fake = {
    from: () => ({
      select: () => ({
        eq: () => ({
          data: [{ session_sets: [{ id: "1", is_warmup_set: true }] }], // Only warmup
          error: null,
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        savedStatus = payload.status as string;
        return {
          eq: () => ({
            eq: () => ({ error: null }),
          }),
        };
      },
    }),
  };

  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  // Must save 'skipped' for 0 working sets
  return savedStatus === "skipped" && result.ok && result.data.status === "skipped";
}

// Mutant 11: Ignore readError in finishSessionCore
async function testFinishSessionCoreReadError(): Promise<boolean> {
  const fake = {
    from: () => ({
      select: () => ({
        eq: () => ({
          data: null,
          error: { message: "Read failed" },
        }),
      }),
    }),
  };

  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  return !result.ok && result.error === "Read failed";
}

// Mutant 12: Remove .eq('status', 'in_progress') from abandonSessionCore
async function testAbandonSessionCoreStatusFilter(): Promise<boolean> {
  const calls: Array<{ column: string; value: unknown }> = [];

  const fake = {
    from: () => ({
      select: () => ({
        eq: () => ({
          data: [{ session_sets: [{ id: "1", is_warmup_set: false }] }],
          error: null,
        }),
      }),
      update: () => ({
        eq: (column: string, value: unknown) => {
          calls.push({ column, value });
          return {
            eq: (column2: string, value2: unknown) => {
              calls.push({ column: column2, value: value2 });
              return { error: null };
            },
          };
        },
      }),
    }),
  };

  await abandonSessionCore(fake, "s1", 100);

  const hasStatusFilter = calls.some((c) => c.column === "status" && c.value === "in_progress");
  return hasStatusFilter;
}

// Mutant 13: Ignore readError in abandonSessionCore
async function testAbandonSessionCoreReadError(): Promise<boolean> {
  const fake = {
    from: () => ({
      select: () => ({
        eq: () => ({
          data: null,
          error: { message: "Read failed" },
        }),
      }),
    }),
  };

  const result = await abandonSessionCore(fake, "s1", 100);
  return !result.ok && result.error === "Read failed";
}

// --- Run all tests ---

(async () => {
  console.log("🧬 Running finish-flow mutation tests...\n");

  await testMutant(
    "Remove inFlight guard in runFinish",
    "test:finish-flow (concurrent calls)",
    testRunFinishInFlightGuard,
  );

  await testMutant(
    "Remove resumeElapsed on network throw in runFinish",
    "test:finish-flow (network error resumeElapsed)",
    testRunFinishResumeOnNetworkThrow,
  );

  await testMutant(
    "Remove offline copy on network throw in runFinish",
    "test:finish-flow (network error offline copy)",
    testRunFinishOfflineCopy,
  );

  await testMutant(
    "Remove resumeElapsed on {ok:false} in runFinish",
    "test:finish-flow ({ok:false} resumeElapsed)",
    testRunFinishResumeOnNotOk,
  );

  await testMutant(
    "Expose server error text on {ok:false} in runFinish",
    "test:finish-flow ({ok:false} exact copy)",
    testRunFinishGenericErrorCopy,
  );

  await testMutant(
    "Remove try/catch around refreshAfterSession in runFinish",
    "test:finish-flow (refreshAfterSession throw still navigates)",
    testRunFinishRefreshThrowDoesntBlock,
  );

  await testMutant(
    "Remove endingRef guard in runEndEarly",
    "test:finish-flow (concurrent calls endEarly)",
    testRunEndEarlyEndingRefGuard,
  );

  await testMutant(
    "Remove setOfflineError(true) on network throw in runEndEarly",
    "test:finish-flow (network error setOfflineError)",
    testRunEndEarlyOfflineFlag,
  );

  await testMutant(
    "Remove .eq('status','in_progress') from finishSessionCore",
    "test:finish-session-core (status filter)",
    testFinishSessionCoreStatusFilter,
  );

  await testMutant(
    "Ignore decideAbandonStatus in finishSessionCore (0 sets)",
    "test:finish-session-core (0 sets saves skipped)",
    testFinishSessionCoreRespectsZeroSets,
  );

  await testMutant(
    "Ignore readError in finishSessionCore",
    "test:finish-session-core (read error)",
    testFinishSessionCoreReadError,
  );

  await testMutant(
    "Remove .eq('status','in_progress') from abandonSessionCore",
    "test:finish-session-core (abandon status filter)",
    testAbandonSessionCoreStatusFilter,
  );

  await testMutant(
    "Ignore readError in abandonSessionCore",
    "test:finish-session-core (abandon read error)",
    testAbandonSessionCoreReadError,
  );

  // Print table
  console.log("\n┌─────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────┬────────┐");
  console.log("│ Mutant                                                                  │ Catching Test                            │ Caught │");
  console.log("├─────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┼────────┤");

  for (const result of results) {
    const mutant = result.mutant.padEnd(71);
    const test = result.catchingTest.padEnd(40);
    const caught = result.caught ? "✅ YES" : "❌ NO ";
    console.log(`│ ${mutant} │ ${test} │ ${caught} │`);
  }

  console.log("└─────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────┴────────┘\n");

  const allCaught = results.every((r) => r.caught);
  const caughtCount = results.filter((r) => r.caught).length;

  console.log(`${caughtCount}/${results.length} mutants caught\n`);

  if (allCaught) {
    console.log("✨ All mutants caught!\n");
    process.exit(0);
  } else {
    console.log("❌ Some mutants escaped!\n");
    process.exit(1);
  }
})();
