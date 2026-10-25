#!/usr/bin/env tsx
/**
 * Test A1: logSetActionCore with expired session
 * 
 * Tests the pure core of logSet with injected auth to verify
 * expired sessions return structured SESSION_EXPIRED result.
 */

import { logSetActionCore } from "../src/lib/session/log-set-action-core";

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

console.log("\n🧪 Test A1: logSetActionCore handles expired session\n");

async function testLogSetExpiredAuth() {
  // Fake expired auth
  const fakeAuthExpired = async () => ({
    ok: false as const,
    error: "Session expired",
    code: "SESSION_EXPIRED" as const,
  });

  const fakeClient: any = null;

  const result = await logSetActionCore(
    {
      getAuthResult: fakeAuthExpired,
      getClient: () => fakeClient,
    },
    {
      sessionExerciseId: "test-ex",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  assert(!result.ok, "A1: Expired auth returns ok=false");
  assert("code" in result && result.code === "SESSION_EXPIRED", "A1: Result has SESSION_EXPIRED code");
  assert("error" in result, "A1: Result has error message");
}

async function main() {
  try {
    await testLogSetExpiredAuth();
    console.log(`\n✅ All assertions passed (${passed})`);
    console.log("\nMutation A1 killed: logSet uses resolveAuth for structured SESSION_EXPIRED handling");
    console.log("Break: Reverting to requireUser() causes unhandled throws instead of structured errors");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
