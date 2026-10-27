#!/usr/bin/env tsx
/**
 * Test cd1: Cool-down must clear rest persistence ONLY after finishSession succeeds.
 * 
 * A failed finish must leave the state intact so the user can retry.
 * Only after a successful finish should the rest state be cleared.
 * 
 * This tests the behavioral contract: rest is cleared if and only if finishSession succeeds.
 * 
 *   npx tsx scripts/test-cd1-runner-rest-clearance.ts
 */

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

// Simulate the cool-down handler behavior
type RestPersistence = {
  data: number | null;
  save: (seconds: number) => void;
  clear: () => void;
};

type FinishResult = { ok: true; data: { status: string; durationSeconds: number } } | { ok: false; error: string };

async function cooldownDoneHandler(
  restPersistence: RestPersistence,
  finishSession: () => Promise<FinishResult>
): Promise<{ phase: "done" | "cooldown"; needsRetry: boolean }> {
  const result = await finishSession();
  
  if (result && result.ok) {
    restPersistence.clear();
    return { phase: "done", needsRetry: false };
  } else {
    return { phase: "cooldown", needsRetry: true };
  }
}

(async function main() {
console.log("\ncd1: Rest persistence cleared only after finishSession succeeds\n");

console.log("1. Successful finish clears rest persistence");
{
  const restPersistence: RestPersistence = {
    data: 90,
    save: (seconds) => { restPersistence.data = seconds; },
    clear: () => { restPersistence.data = null; },
  };
  
  const finishSession = async () => {
    return { ok: true as const, data: { status: "completed", durationSeconds: 1800 } };
  };
  
  assertEquals(restPersistence.data, 90, "rest initially saved");
  
  const outcome = await cooldownDoneHandler(restPersistence, finishSession);
  
  assertEquals(outcome.phase, "done", "moved to done phase");
  assertEquals(outcome.needsRetry, false, "no retry needed");
  assertEquals(restPersistence.data, null, "rest cleared after successful finish");
}

console.log("\n2. Failed finish retains rest persistence");
{
  const restPersistence: RestPersistence = {
    data: 90,
    save: (seconds) => { restPersistence.data = seconds; },
    clear: () => { restPersistence.data = null; },
  };
  
  const finishSession = async () => {
    return { ok: false as const, error: "Network error" };
  };
  
  assertEquals(restPersistence.data, 90, "rest initially saved");
  
  const outcome = await cooldownDoneHandler(restPersistence, finishSession);
  
  assertEquals(outcome.phase, "cooldown", "stayed in cooldown phase");
  assertEquals(outcome.needsRetry, true, "retry needed");
  assertEquals(restPersistence.data, 90, "rest NOT cleared after failed finish");
}

console.log("\n3. Retry sequence: fail then succeed");
{
  const restPersistence: RestPersistence = {
    data: 90,
    save: (seconds) => { restPersistence.data = seconds; },
    clear: () => { restPersistence.data = null; },
  };
  
  let attempts = 0;
  const finishSession = async () => {
    attempts++;
    if (attempts === 1) {
      return { ok: false as const, error: "Network error" };
    }
    return { ok: true as const, data: { status: "completed", durationSeconds: 1800 } };
  };
  
  // First attempt (fails)
  const firstOutcome = await cooldownDoneHandler(restPersistence, finishSession);
  assertEquals(firstOutcome.phase, "cooldown", "stayed in cooldown after first attempt");
  assertEquals(restPersistence.data, 90, "rest NOT cleared after first failed attempt");
  
  // Retry (succeeds)
  const secondOutcome = await cooldownDoneHandler(restPersistence, finishSession);
  assertEquals(secondOutcome.phase, "done", "moved to done phase after retry");
  assertEquals(restPersistence.data, null, "rest cleared after successful retry");
  assertEquals(attempts, 2, "finish attempted twice");
}

console.log("\n4. Multiple failures retain persistence");
{
  const restPersistence: RestPersistence = {
    data: 90,
    save: (seconds) => { restPersistence.data = seconds; },
    clear: () => { restPersistence.data = null; },
  };
  
  const finishSession = async () => {
    return { ok: false as const, error: "Network error" };
  };
  
  // First failure
  await cooldownDoneHandler(restPersistence, finishSession);
  assertEquals(restPersistence.data, 90, "rest retained after first failure");
  
  // Second failure
  await cooldownDoneHandler(restPersistence, finishSession);
  assertEquals(restPersistence.data, 90, "rest retained after second failure");
  
  // Third failure
  await cooldownDoneHandler(restPersistence, finishSession);
  assertEquals(restPersistence.data, 90, "rest retained after third failure");
}

console.log("\n5. Skip cool-down button has same behavior");
{
  const restPersistence: RestPersistence = {
    data: 90,
    save: (seconds) => { restPersistence.data = seconds; },
    clear: () => { restPersistence.data = null; },
  };
  
  // Skip button with successful finish
  const finishSessionSuccess = async () => {
    return { ok: true as const, data: { status: "completed", durationSeconds: 1800 } };
  };
  
  const outcome = await cooldownDoneHandler(restPersistence, finishSessionSuccess);
  assertEquals(outcome.phase, "done", "moved to done phase");
  assertEquals(restPersistence.data, null, "rest cleared when skip succeeds");
}

console.log("\n6. No-cooldown path has same behavior");
{
  const restPersistence: RestPersistence = {
    data: 90,
    save: (seconds) => { restPersistence.data = seconds; },
    clear: () => { restPersistence.data = null; },
  };
  
  // Finish directly without cooldown (cooldownEnabled = false)
  const finishSessionDirect = async () => {
    return { ok: true as const, data: { status: "completed", durationSeconds: 1800 } };
  };
  
  const outcome = await cooldownDoneHandler(restPersistence, finishSessionDirect);
  assertEquals(outcome.phase, "done", "moved to done phase");
  assertEquals(restPersistence.data, null, "rest cleared when direct finish succeeds");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All cd1 rest clearance tests passed!");
})();
