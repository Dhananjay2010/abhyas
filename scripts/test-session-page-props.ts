#!/usr/bin/env tsx
/**
 * Test: Session page props mapping
 * 
 * Tests break N6: userId must be passed to SessionRunner.
 */

import { getSessionRunnerUserId } from "../src/app/session/[id]/session-page-props";

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting session page props mapping (N6)\n");

const user = { id: "user-123" };
const userId = getSessionRunnerUserId(user);

check("Returns user.id", userId === "user-123");
check("Returns string", typeof userId === "string");
check("Not empty", userId.length > 0);

console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
