#!/usr/bin/env tsx
/**
 * Test: logSet returns SESSION_EXPIRED (Item 6 - A1)
 * 
 * Verifies that logSet returns SESSION_EXPIRED result when auth has expired.
 * Driven through dependency-injected components, no source-text checks,
 * no mocking of module under test.
 */

import { resolveAuth } from "../src/lib/session/auth-result";
import { logSetCore, type LogSetClient, type LogSetInput } from "../src/lib/session/log-set-core";
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";

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

console.log("\n📋 Test: logSet returns SESSION_EXPIRED when auth expired (Item 6 - A1)\n");

/**
 * Thin wrapper around logSetCore that uses resolveAuth,
 * mimicking the structure of the real logSet server action.
 */
async function testableLogSet(
  authFn: () => Promise<{ user: unknown | null; supabase: LogSetClient }>,
  input: LogSetInput,
) {
  return await resolveAuth(
    authFn,
    async ({ user, supabase }) => {
      if (!user) throw new Error("Not signed in");
      return logSetCore(supabase, String(user), input);
    }
  );
}

// Test 1: Auth returns null user → SESSION_EXPIRED
async function testExpiredAuth() {
  console.log("=== Test 1: Expired auth returns SESSION_EXPIRED ===\n");
  
  const fakeSupabase: LogSetClient = {
    from: () => {
      throw new Error("Should not be called when auth fails");
    },
  };
  
  const expiredAuthFn = async () => ({
    user: null,
    supabase: fakeSupabase,
  });
  
  const result = await testableLogSet(expiredAuthFn, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  
  assert("ok" in result && result.ok === false, "Result has ok: false");
  assert("code" in result, "Result has code field");
  assert(result.code === SESSION_EXPIRED_CODE, `Result code is SESSION_EXPIRED_CODE (${SESSION_EXPIRED_CODE})`);
  assert(result.error === "Not signed in", "Result error message is 'Not signed in'");
  
  console.log("✓ Test 1 passed\n");
}

// Test 2: Valid auth proceeds to logSetCore
async function testValidAuth() {
  console.log("=== Test 2: Valid auth proceeds to logSetCore ===\n");
  
  let coreCalled = false;
  
  // Fake supabase that tracks if core logic runs
  const fakeSupabase: LogSetClient = {
    from: (table: string) => {
      coreCalled = true;
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        }),
        insert: () => ({
          error: null,
        }),
      } as any;
    },
  };
  
  const validAuthFn = async () => ({
    user: "user123",
    supabase: fakeSupabase,
  });
  
  const result = await testableLogSet(validAuthFn, {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  
  assert(coreCalled, "logSetCore was called with valid auth");
  assert("ok" in result && result.ok === true, "Result is ok: true");
  
  console.log("✓ Test 2 passed\n");
}

// Test 3: Core throws "Not signed in" → SESSION_EXPIRED
async function testCoreThrowsNotSignedIn() {
  console.log("=== Test 3: Core throws 'Not signed in' → SESSION_EXPIRED ===\n");
  
  const fakeSupabase: LogSetClient = {
    from: () => {
      throw new Error("Should not be called");
    },
  };
  
  // Auth returns user, but core throws "Not signed in" for some reason
  const authFn = async () => ({
    user: "user456",
    supabase: fakeSupabase,
  });
  
  // Wrapper that throws "Not signed in" inside action
  const testLogSetWithThrow = async () => {
    return await resolveAuth(
      authFn,
      async () => {
        throw new Error("Not signed in");
      }
    );
  };
  
  const result = await testLogSetWithThrow();
  
  assert("ok" in result && result.ok === false, "Result has ok: false");
  assert("code" in result && result.code === SESSION_EXPIRED_CODE, "Result code is SESSION_EXPIRED_CODE");
  
  console.log("✓ Test 3 passed\n");
}

// Run all tests
(async () => {
  await testExpiredAuth();
  await testValidAuth();
  await testCoreThrowsNotSignedIn();
  
  console.log(`✅ All logSet SESSION_EXPIRED tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
