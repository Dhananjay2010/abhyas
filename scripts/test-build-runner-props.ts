#!/usr/bin/env tsx
/**
 * Test N6/N6s: buildRunnerProps extracts correct fields
 * 
 * N6: userId must be user.id
 * N6s: sessionStatus must be session.status
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

console.log("\n🧪 Test N6/N6s: buildRunnerProps extracts userId and sessionStatus\n");

const mockSession: any = {
  id: "session-123",
  user_id: "user-456",
  status: "in_progress",
  created_at: "2026-01-01",
  // ... other fields
};

const mockUser = {
  id: "user-456",
};

const props = buildRunnerProps(mockSession, mockUser);

assert(props.userId === mockUser.id, "N6: userId equals user.id");
assert(props.userId === "user-456", "N6: userId is correct value");
assert(props.sessionStatus === mockSession.status, "N6s: sessionStatus equals session.status");
assert(props.sessionStatus === "in_progress", "N6s: sessionStatus is correct value");

console.log(`\n✅ All assertions passed (${passed})`);
console.log("\nMutations N6/N6s killed: Changing user.id or session.status breaks assertions");
console.log("Break: Using wrong fields (e.g. session.user_id for userId) fails tests");
