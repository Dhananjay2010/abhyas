#!/usr/bin/env node
/**
 * N6s: Test session page sessionStatus prop is read from buildRunnerProps
 * 
 * PLANTED BUG: sessionStatus hardcoded to "in_progress" breaks completed session handling
 * 
 * Ensures the session page extracts sessionStatus correctly from the Session object.
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

function testN6s() {
  console.log("\n📋 Test N6s: Session page sessionStatus extraction\n");
  
  const mockUser = {
    id: "user-abc-123",
  };
  
  const mockSession = {
    status: "completed" as const,
  };
  
  const result = buildRunnerProps(mockSession, mockUser);
  
  assert(result.sessionStatus === "completed", "N6s: sessionStatus extracted correctly from Session object");
  assert(result.sessionStatus !== "in_progress", "N6s: sessionStatus is not hardcoded to 'in_progress'");
  assert(result.sessionStatus === mockSession.status, "N6s: sessionStatus matches Session.status exactly");
  
  console.log(`\n✅ Test N6s passed (${passed} assertions)`);
  console.log("\nMutation N6s killed: Hardcoding sessionStatus='in_progress' breaks completed session handling");
  console.log("Break: Hardcoded status causes pending set replay on completed sessions\n");
}

try {
  testN6s();
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Test N6s failed:`, error);
  process.exit(1);
}
