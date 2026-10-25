#!/usr/bin/env tsx
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

console.log("\n🧪 Test A1: resolveAuth wraps logSet\n");

async function runTests() {
try {
  const normalResult = await resolveAuth(
    async () => ({ user: { id: "test-user" }, supabase: {} }),
    async () => {
      return { value: `User test-user processed` };
    }
  );
  
  assert("value" in normalResult && normalResult.value === "User test-user processed", "A1: Normal auth flow succeeds");
  
  const expiredResult = await resolveAuth(
    async () => ({ user: null, supabase: {} }),
    async () => {
      return { value: `Should not reach here` };
    }
  );
  
  assert(isSessionExpired(expiredResult), "A1: No user returns structured error");
  assert("ok" in expiredResult && expiredResult.ok === false, "A1: No user result has ok=false");
  assert("code" in expiredResult && expiredResult.code === "SESSION_EXPIRED", "A1: No user result has SESSION_EXPIRED code");
  
  console.log(`\n✅ All assertions passed (${passed})`);
  process.exit(0);
} catch (e) {
  console.error(`\n❌ Test failed: ${e}`);
  process.exit(1);
}
}

runTests();
