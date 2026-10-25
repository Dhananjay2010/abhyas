#!/usr/bin/env node
/**
 * N6: Test session page userId prop is read from buildRunnerProps
 * 
 * PLANTED BUG: userId="" (hardcoded empty) breaks session runner
 * 
 * Ensures the session page extracts userId correctly from the User object.
 */

import { buildRunnerProps } from "../src/lib/session/build-runner-props";

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

function testN6() {
  console.log("\n📋 Test N6: Session page userId extraction\n");
  
  const mockUser = {
    id: "user-abc-123",
  };
  
  const mockSession = {
    status: "in_progress" as const,
  };
  
  const result = buildRunnerProps(mockSession, mockUser);
  
  assert(result.userId === "user-abc-123", "N6: userId extracted correctly from User object");
  assert(result.userId !== "", "N6: userId is not empty string");
  assert(result.userId === mockUser.id, "N6: userId matches User.id exactly");
  
  console.log(`\n✅ Test N6 passed (${passed} assertions)`);
  console.log("\nMutation N6 killed: Hardcoding userId=\"\" breaks session runner");
  console.log("Break: Empty userId prevents pending set isolation and corrupts storage keys\n");
}

try {
  testN6();
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Test N6 failed:`, error);
  process.exit(1);
}
