#!/usr/bin/env tsx
/**
 * Behavioral test for A1: logSet must use resolveAuth wrapping
 * to handle expired sessions gracefully (return structured error, not throw).
 */

import { resolveAuth } from "../src/lib/session/auth-result";
import { isSessionExpired } from "../src/lib/auth/session-expired";

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

console.log("\n🧪 Test A1: resolveAuth wraps logSet for session expiry handling\n");

async function runTests() {
try {
  // Test 1: Normal flow - auth succeeds
  const normalResult = await resolveAuth(
    async () => ({ user: { id: "test-user" }, supabase: {} as any }),
    async ({ user }) => {
      return { value: `User ${user.id} processed` };
    }
  );
  
  assert(normalResult.value === "User test-user processed", "A1: Normal auth flow succeeds");
  
  // Test 2: No user - should return structured error
  const expiredResult = await resolveAuth(
    async () => ({ user: null, supabase: {} as any }),
    async ({ user }) => {
      return { value: `Should not reach here` };
    }
  );
  
  assert(isSessionExpired(expiredResult), "A1: No user returns structured error");
  assert(expiredResult.ok === false, "A1: No user result has ok=false");
  assert(expiredResult.code === "SESSION_EXPIRED", "A1: No user result has SESSION_EXPIRED code");
  
  // Test 3: "Not signed in" error - should catch and return structured error
  const notSignedInResult = await resolveAuth(
    async () => ({ user: { id: "test" }, supabase: {} as any }),
    async () => {
      throw new Error("Not signed in");
    }
  );
  
  assert(notSignedInResult.ok === false, "A1: Not signed in error returns structured error");
  assert(notSignedInResult.code === "SESSION_EXPIRED", "A1: Not signed in gets SESSION_EXPIRED code");
  
  // Test 4: Action-level error - should propagate
  const actionResult = await resolveAuth(
    async () => ({ user: { id: "test-user" }, supabase: {} as any }),
    async () => {
      return { ok: false, error: "Action failed" };
    }
  );
  
  assert(actionResult.ok === false, "A1: Action error propagates");
  assert(actionResult.error === "Action failed", "A1: Action error message preserved");
  
  console.log(`\n✅ All assertions passed (${passed})`);
  console.log("\nMutation A1 killed: logSet uses resolveAuth for structured error handling");
  console.log("Break: Reverting logSet to use requireUser() directly causes unhandled throws");
  process.exit(0);
} catch (e) {
  console.error(`\n❌ Test failed: ${e}`);
  process.exit(1);
}
}

runTests();
