#!/usr/bin/env tsx
/**
 * Test: logSet returns SESSION_EXPIRED (Item 6 - A1)
 * 
 * Verifies that logSet returns SESSION_EXPIRED result when auth has expired.
 * Drives the REAL logSetWithAuth core (including real resolveAuth from auth-result.ts)
 * with only data-layer dependencies injected.
 */

import { logSetWithAuth, type LogSetCoreDeps } from "../src/lib/session/log-set-with-auth";
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

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

// Helper to create a minimal SupabaseClient stub for testing
function createStubSupabase(impl: { from: (...args: any[]) => any }): SupabaseClient<Database> {
  return impl as SupabaseClient<Database>;
}

// Test 1: Auth returns null user → resolveAuth catches and returns SESSION_EXPIRED
async function testExpiredAuth() {
  console.log("=== Test 1: Expired auth returns SESSION_EXPIRED ===\n");
  
  const stubSupabase = createStubSupabase({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    }),
  });
  
  const deps: LogSetCoreDeps = {
    getAuthedClient: async () => ({
      supabase: stubSupabase,
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
  if ("ok" in result && !result.ok && "code" in result) {
    assert(result.code === SESSION_EXPIRED_CODE, `Result code is SESSION_EXPIRED_CODE (${SESSION_EXPIRED_CODE})`);
    assert(result.error === "Not signed in", "Result error message is 'Not signed in'");
  } else {
    throw new Error("Expected result with code field");
  }
  
  console.log("✓ Test 1 passed\n");
}

// Test 2: Valid auth proceeds to logSetCore
async function testValidAuth() {
  console.log("=== Test 2: Valid auth proceeds to logSetCore ===\n");
  
  let coreCalled = false;
  
  const stubSupabase = createStubSupabase({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    }),
  });
  
  const deps: LogSetCoreDeps = {
    getAuthedClient: async () => ({
      supabase: stubSupabase,
      user: { id: "user123" },
    }),
    checkLogSetInput: async () => null,
    validateSessionForLogSet: async () => ({ ok: true }),
    buildLogSetValidationDeps: () => ({ lookupSessionExercise: async () => null, lookupExistingSet: async () => null }),
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

// Run all tests
(async () => {
  await testExpiredAuth();
  await testValidAuth();
  
  console.log(`✅ All logSet SESSION_EXPIRED tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
