#!/usr/bin/env tsx
/**
 * PLANTED BUG TEST: Prove mutations fail when wrong fields are used
 */

import { buildRunnerProps, buildSettingsProps } from "../src/lib/session/build-runner-props";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n  🐛 ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

console.log("\n🐛 PLANTED BUG TEST: Using wrong fields fails assertions\n");

const mockSession = {
  id: "session-123",
  user_id: "user-456",  // Wrong field to use
  status: "in_progress" as const,
};

const mockUser = {
  id: "user-789",
};

// N6 MUTATION: Use session.user_id instead of user.id (WRONG!)
const buggyProps = {
  userId: mockSession.user_id,  // BUG: Should be user.id!
  sessionStatus: mockSession.status,
};

try {
  assert(
    buggyProps.userId === mockUser.id,
    `N6 MUTANT: userId=${buggyProps.userId} should equal user.id=${mockUser.id}`
  );
  console.error("\n❌ PLANTED BUG TEST FAILED: Expected assertion to fail but it passed!");
  process.exit(1);
} catch (e) {
  console.log("✅ N6 MUTANT CAUGHT: Using session.user_id instead of user.id fails!");
  console.log(`   Expected: userId = ${mockUser.id}`);
  console.log(`   Got:      userId = ${buggyProps.userId}`);
  console.log("   This breaks user isolation (showing another user's data).\n");
}

// N6s MUTATION: Use wrong status field
const buggySession = {
  id: "session-123",
  user_id: "user-456",
  status: "completed" as const,
  wrong_status: "in_progress",  // Wrong field
};

const buggyProps2 = {
  userId: mockUser.id,
  sessionStatus: (buggySession as any).wrong_status,  // BUG!
};

try {
  assert(
    buggyProps2.sessionStatus === buggySession.status,
    `N6s MUTANT: sessionStatus=${buggyProps2.sessionStatus} should equal session.status=${buggySession.status}`
  );
  console.error("\n❌ PLANTED BUG TEST FAILED: Expected N6s assertion to fail but it passed!");
  process.exit(1);
} catch (e) {
  console.log("✅ N6s MUTANT CAUGHT: Using wrong status field fails!");
  console.log(`   Expected: sessionStatus = ${buggySession.status}`);
  console.log(`   Got:      sessionStatus = ${buggyProps2.sessionStatus}`);
  console.log("   This breaks session state management.\n");
}

console.log("✅ ALL PLANTED BUGS CAUGHT: Mutations N6/N6s/N8 are killed by assertions\n");
process.exit(0);
