#!/usr/bin/env node
/**
 * N8: Test settings page SignOutButton receives userId from buildSettingsProps
 * 
 * PLANTED BUG: userId="" (hardcoded empty) breaks pending set clearing on sign-out
 * 
 * Ensures the settings page extracts userId correctly and passes it to SignOutButton.
 */

import { buildSettingsProps } from "../src/lib/session/build-runner-props";

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

function testN8() {
  console.log("\n📋 Test N8: Settings page SignOutButton userId extraction\n");
  
  const mockUser = {
    id: "user-xyz-789",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  };
  
  const result = buildSettingsProps(mockUser);
  
  assert(result.userId === "user-xyz-789", "N8: userId extracted correctly from User object");
  assert(result.userId !== "", "N8: userId is not empty string");
  assert(result.userId === mockUser.id, "N8: userId matches User.id exactly");
  
  console.log(`\n✅ Test N8 passed (${passed} assertions)`);
  console.log("\nMutation N8 killed: Hardcoding userId=\"\" breaks pending set clearing on sign-out");
  console.log("Break: Empty userId leaves orphaned pending sets in localStorage after sign-out\n");
}

try {
  testN8();
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Test N8 failed:`, error);
  process.exit(1);
}
