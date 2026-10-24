#!/usr/bin/env tsx
import { runFinish, runEndEarly, type FinishFlowDeps } from "../src/lib/session/finish-flow";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
  }
}

// --- runFinish tests ---

async function testRunFinishConcurrency() {
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

  // Concurrent calls
  await Promise.all([
    runFinish(deps, { sessionId: "s1", cooldownCompleted: true }),
    runFinish(deps, { sessionId: "s1", cooldownCompleted: true }),
  ]);

  assertEquals(calls.length, 1, "runFinish concurrent calls: exactly 1 finishSession call");
}

async function testRunFinishThrowNetworkError() {
  const calls: { resumeElapsed?: boolean; setError?: string | null } = {};
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => {
      throw new Error("Failed to fetch");
    },
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      calls.resumeElapsed = true;
    },
    setError: (msg) => {
      calls.setError = msg;
    },
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });

  assertEquals(calls.resumeElapsed, true, "runFinish network throw: resumeElapsed called");
  assertEquals(
    calls.setError,
    "You're offline. Your session wasn't finished – try again when you're back online.",
    "runFinish network throw: offline copy shown",
  );
}

async function testRunFinishThrowGenericError() {
  const calls: { resumeElapsed?: boolean; setError?: string | null } = {};
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => {
      throw new Error("Database timeout");
    },
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      calls.resumeElapsed = true;
    },
    setError: (msg) => {
      calls.setError = msg;
    },
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });

  assertEquals(calls.resumeElapsed, true, "runFinish generic throw: resumeElapsed called");
  assertEquals(
    calls.setError,
    "Couldn't finish the session. Try again.",
    "runFinish generic throw: generic copy shown",
  );
}

async function testRunFinishNotOk() {
  const calls: { resumeElapsed?: boolean; setError?: string | null } = {};
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => ({ ok: false, error: "Server said no" }),
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      calls.resumeElapsed = true;
    },
    setError: (msg) => {
      calls.setError = msg;
    },
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });

  assertEquals(calls.resumeElapsed, true, "runFinish {ok:false}: resumeElapsed called");
  assertEquals(
    calls.setError,
    "Couldn't finish the session. Try again.",
    "runFinish {ok:false}: exact copy, never server text",
  );
}

async function testRunFinishSuccessSkipped() {
  const calls: {
    refreshAfterSession?: boolean;
    navigate?: string;
    setError?: string | null;
  } = {};
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => ({ ok: true, data: { status: "skipped" as const } }),
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => {
      calls.refreshAfterSession = true;
      return { ok: true };
    },
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: (msg) => {
      calls.setError = msg;
    },
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: (path) => {
      calls.navigate = path;
    },
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });

  assertEquals(calls.setError, null, "runFinish success (skipped): clears error");
  assertEquals(calls.refreshAfterSession, true, "runFinish success (skipped): refreshAfterSession called");
  assertEquals(calls.navigate, "/today", "runFinish success (skipped): navigates to /today");
}

async function testRunFinishSuccessCompleted() {
  const calls: { setPhase?: "done"; setError?: string | null } = {};
  const inFlight = { current: false };

  const deps: FinishFlowDeps = {
    finishSession: async () => ({ ok: true, data: { status: "completed" as const } }),
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: (msg) => {
      calls.setError = msg;
    },
    setPhase: (phase) => {
      calls.setPhase = phase;
    },
    setEndedEarly: () => {},
    navigate: () => {},
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });

  assertEquals(calls.setError, null, "runFinish success (completed): clears error");
  assertEquals(calls.setPhase, "done", "runFinish success (completed): setPhase('done')");
}

async function testRunFinishRefreshThrowsStillNavigates() {
  const calls: { navigate?: string } = {};
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
    navigate: (path) => {
      calls.navigate = path;
    },
    onExit: null,
    inFlight,
  };

  await runFinish(deps, { sessionId: "s1", cooldownCompleted: true });

  assertEquals(calls.navigate, "/today", "runFinish refreshAfterSession throw: still navigates");
}

// --- runEndEarly tests ---

async function testRunEndEarlyConcurrency() {
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

  // Concurrent calls
  await Promise.all([runEndEarly(deps, params), runEndEarly(deps, { ...params })]);

  assertEquals(calls.length, 1, "runEndEarly concurrent calls: exactly 1 abandonSession call");
}

async function testRunEndEarlyThrowNetworkError() {
  const calls: { resumeElapsed?: boolean; setOfflineError?: boolean } = {};
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => {
      throw new Error("network request failed");
    },
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      calls.resumeElapsed = true;
    },
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
      calls.setOfflineError = val;
    },
    endingRef,
    setEnding: () => {},
  });

  assertEquals(calls.resumeElapsed, true, "runEndEarly network throw: resumeElapsed called");
  assertEquals(calls.setOfflineError, true, "runEndEarly network throw: setOfflineError(true)");
}

async function testRunEndEarlyThrowGenericError() {
  const calls: { resumeElapsed?: boolean; setError?: string | null } = {};
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => {
      throw new Error("Database timeout");
    },
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      calls.resumeElapsed = true;
    },
    setError: (msg) => {
      calls.setError = msg;
    },
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
    setOfflineError: () => {},
    endingRef,
    setEnding: () => {},
  });

  assertEquals(calls.resumeElapsed, true, "runEndEarly generic throw: resumeElapsed called");
  assertEquals(
    calls.setError,
    "Couldn't end the session. Try again.",
    "runEndEarly generic throw: generic copy shown",
  );
}

async function testRunEndEarlyNotOk() {
  const calls: { resumeElapsed?: boolean; setError?: string | null } = {};
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => ({ ok: false, error: "Server said no" }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {
      calls.resumeElapsed = true;
    },
    setError: (msg) => {
      calls.setError = msg;
    },
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
    setOfflineError: () => {},
    endingRef,
    setEnding: () => {},
  });

  assertEquals(calls.resumeElapsed, true, "runEndEarly {ok:false}: resumeElapsed called");
  assertEquals(
    calls.setError,
    "Couldn't end the session. Try again.",
    "runEndEarly {ok:false}: exact copy, never server text",
  );
}

async function testRunEndEarlySuccessZeroSets() {
  const calls: {
    refreshAfterSession?: boolean;
    navigate?: string;
    setConfirming?: null;
  } = {};
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => {
      calls.refreshAfterSession = true;
      return { ok: true };
    },
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: (path) => {
      calls.navigate = path;
    },
    onExit: null,
    inFlight: { current: false },
  };

  await runEndEarly(deps, {
    sessionId: "s1",
    setsDone: 0,
    setConfirming: (val) => {
      calls.setConfirming = val;
    },
    setOfflineError: () => {},
    endingRef,
    setEnding: () => {},
  });

  assertEquals(calls.setConfirming, null, "runEndEarly success (0 sets): setConfirming(null)");
  assertEquals(calls.refreshAfterSession, true, "runEndEarly success (0 sets): refreshAfterSession called");
  assertEquals(calls.navigate, "/today", "runEndEarly success (0 sets): navigates to /today");
}

async function testRunEndEarlySuccessWithSets() {
  const calls: {
    setEndedEarly?: boolean;
    setPhase?: "done";
    setConfirming?: null;
  } = {};
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: (phase) => {
      calls.setPhase = phase;
    },
    setEndedEarly: (val) => {
      calls.setEndedEarly = val;
    },
    navigate: () => {},
    onExit: null,
    inFlight: { current: false },
  };

  await runEndEarly(deps, {
    sessionId: "s1",
    setsDone: 5,
    setConfirming: (val) => {
      calls.setConfirming = val;
    },
    setOfflineError: () => {},
    endingRef,
    setEnding: () => {},
  });

  assertEquals(calls.setConfirming, null, "runEndEarly success (with sets): setConfirming(null)");
  assertEquals(calls.setEndedEarly, true, "runEndEarly success (with sets): setEndedEarly(true)");
  assertEquals(calls.setPhase, "done", "runEndEarly success (with sets): setPhase('done')");
}

async function testRunEndEarlyRefreshThrowsStillNavigates() {
  const calls: { navigate?: string } = {};
  const endingRef = { current: false };

  const deps: Omit<FinishFlowDeps, "finishSession"> = {
    abandonSession: async () => ({ ok: true }),
    refreshAfterSession: async () => {
      throw new Error("Offline");
    },
    stopElapsed: () => 100,
    resumeElapsed: () => {},
    setError: () => {},
    setPhase: () => {},
    setEndedEarly: () => {},
    navigate: (path) => {
      calls.navigate = path;
    },
    onExit: null,
    inFlight: { current: false },
  };

  await runEndEarly(deps, {
    sessionId: "s1",
    setsDone: 0,
    setConfirming: () => {},
    setOfflineError: () => {},
    endingRef,
    setEnding: () => {},
  });

  assertEquals(calls.navigate, "/today", "runEndEarly refreshAfterSession throw: still navigates");
}

// --- Run all tests ---

(async () => {
  console.log("🧪 Running finish-flow tests...\n");

  await testRunFinishConcurrency();
  await testRunFinishThrowNetworkError();
  await testRunFinishThrowGenericError();
  await testRunFinishNotOk();
  await testRunFinishSuccessSkipped();
  await testRunFinishSuccessCompleted();
  await testRunFinishRefreshThrowsStillNavigates();

  await testRunEndEarlyConcurrency();
  await testRunEndEarlyThrowNetworkError();
  await testRunEndEarlyThrowGenericError();
  await testRunEndEarlyNotOk();
  await testRunEndEarlySuccessZeroSets();
  await testRunEndEarlySuccessWithSets();
  await testRunEndEarlyRefreshThrowsStillNavigates();

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All finish-flow tests passed!");
})();
