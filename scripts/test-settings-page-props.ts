#!/usr/bin/env tsx
/**
 * Test: Settings page props mapping
 * 
 * Tests break N8: userId must be passed to SignOutButton.
 */

import { getSignOutButtonUserId } from "../src/app/settings/settings-page-props";

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting settings page props mapping (N8)\n");

const user = { id: "user-456" };
const userId = getSignOutButtonUserId(user);

check("Returns user.id", userId === "user-456");
check("Returns string", typeof userId === "string");
check("Not empty", userId.length > 0);

console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
