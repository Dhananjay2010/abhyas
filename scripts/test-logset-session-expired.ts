#!/usr/bin/env tsx
/**
 * Test A1: logSet action with expired session
 * 
 * This tests the REAL logSet path (not just resolveAuth in isolation)
 * to ensure expired sessions return structured SESSION_EXPIRED result.
 */

import { logSet } from "../src/app/session/actions";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n🧪 Test A1: logSet action handles expired session\n");

async function testLogSetExpired() {
  // Call logSet - it will detect no auth via getAuthedClient
  const result = await logSet({
    sessionId: "test-session",
    sessionExerciseId: "test-ex",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "test-client",
  });

  assert(!result.ok, "A1: Expired session returns ok=false");
  assert("code" in result && result.code === "SESSION_EXPIRED", "A1: Result has SESSION_EXPIRED code");
  assert("error" in result, "A1: Result has error message");
}

async function main() {
  try {
    await testLogSetExpired();
    console.log(`\n✅ All assertions passed (${passed})`);
    console.log("\nMutation A1 killed: logSet uses resolveAuth for structured SESSION_EXPIRED handling");
    console.log("Break: Reverting to requireUser() causes unhandled throws instead of structured errors");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
