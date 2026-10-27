#!/usr/bin/env tsx
/**
 * Test: logSet returns SESSION_EXPIRED (Item 6 - A1)
 * 
 * Verifies that logSet returns SESSION_EXPIRED result when auth has expired.
 * Driven through the real logSetWithAuth core with dependency injection.
 */

import { logSetWithAuth, type LogSetDeps } from "../src/lib/session/log-set-with-auth";
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

// Test 1: Auth returns null user → SESSION_EXPIRED
async function testExpiredAuth() {
  console.log("=== Test 1: Expired auth returns SESSION_EXPIRED ===\n");
  
  const deps: LogSetDeps = {
    resolveAuth: async (authFn, action) => {
      const auth = await authFn();
      if (!auth.user) {
        return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
      }
      return await action(auth);
    },
    getAuthedClient: async () => ({
      supabase: null as any,
      user: null,
    }),
    checkLogSetInput: async () => {
      throw new Error("Should not be called when auth fails");
    },
    validateSessionForLogSet: async () => {
      throw new Error("Should not be called when auth fails");
    },
    buildLogSetValidationDeps: () => {
      throw new Error("Should not be called when auth fails");
    },
    logSetCore: async () => {
      throw new Error("Should not be called when auth fails");
    },
  };
  
  const result = await logSetWithAuth(deps, {
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
  
  const deps: LogSetDeps = {
    resolveAuth: async (authFn, action) => {
      const auth = await authFn();
      if (!auth.user) {
        return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
      }
      return await action(auth);
    },
    getAuthedClient: async () => ({
      supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) } as any,
      user: { id: "user123" },
    }),
    checkLogSetInput: async () => null,
    validateSessionForLogSet: async () => ({ ok: true }),
    buildLogSetValidationDeps: () => ({}),
    logSetCore: async () => {
      coreCalled = true;
      return { ok: true };
    },
  };
  
  const result = await logSetWithAuth(deps, {
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

// Test 3: resolveAuth catches "Not signed in" throw → SESSION_EXPIRED
async function testThrowNotSignedIn() {
  console.log("=== Test 3: Throw 'Not signed in' → SESSION_EXPIRED ===\n");
  
  const deps: LogSetDeps = {
    resolveAuth: async (authFn, action) => {
      try {
        const auth = await authFn();
        if (!auth.user) {
          return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
        }
        return await action(auth);
      } catch (err) {
        if (err instanceof Error && err.message === "Not signed in") {
          return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
        }
        throw err;
      }
    },
    getAuthedClient: async () => ({
      supabase: null as any,
      user: { id: "user456" },
    }),
    checkLogSetInput: async () => {
      throw new Error("Not signed in");
    },
    validateSessionForLogSet: async () => {
      throw new Error("Should not be called");
    },
    buildLogSetValidationDeps: () => {
      throw new Error("Should not be called");
    },
    logSetCore: async () => {
      throw new Error("Should not be called");
    },
  };
  
  const result = await logSetWithAuth(deps, {
    sessionExerciseId: "ex3",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  
  assert("ok" in result && result.ok === false, "Result has ok: false");
  assert("code" in result && result.code === SESSION_EXPIRED_CODE, "Result code is SESSION_EXPIRED_CODE");
  
  console.log("✓ Test 3 passed\n");
}

// Run all tests
(async () => {
  await testExpiredAuth();
  await testValidAuth();
  await testThrowNotSignedIn();
  
  console.log(`✅ All logSet SESSION_EXPIRED tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
