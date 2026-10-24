#!/usr/bin/env tsx
/**
 * Test: signInAgainHref rejects javascript: protocol
 * 
 * Behavioral test that signInAgainHref from #105 rejects dangerous URLs.
 */

import { signInAgainHref } from "../src/lib/auth/session-expired";

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting signInAgainHref rejects javascript: protocol\n");

// javascript: should be rejected
const jsResult = signInAgainHref("javascript:alert(1)");
check("Rejects 'javascript:alert(1)'", jsResult === "/?next=%2Ftoday");

// javascript: with spaces
const jsSpacesResult = signInAgainHref("javascript: alert(1)");
check("Rejects 'javascript: alert(1)'", jsSpacesResult === "/?next=%2Ftoday");

// data: protocol
const dataResult = signInAgainHref("data:text/html,<script>alert(1)</script>");
check("Rejects 'data:' URL", dataResult === "/?next=%2Ftoday");

// Valid paths should work
const validResult = signInAgainHref("/session/abc123");
check("Accepts '/session/abc123'", validResult === "/?next=%2Fsession%2Fabc123");

console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
