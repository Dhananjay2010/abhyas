#!/usr/bin/env tsx
/**
 * Test: signInAgainHref rejects dangerous protocols
 * 
 * Verifies that signInAgainHref properly sanitizes next-path URLs
 * and rejects javascript:, data:, and other unsafe protocols.
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

console.log("\nTesting signInAgainHref URL sanitization\n");

// javascript: protocol should be rejected and fallback to /today
const jsResult = signInAgainHref("javascript:alert(1)");
check("Rejects 'javascript:alert(1)'", jsResult === "/");

// javascript: with spaces
const jsSpaces = signInAgainHref("javascript: alert(1)");
check("Rejects 'javascript: alert(1)'", jsSpaces === "/");

// data: protocol
const dataResult = signInAgainHref("data:text/html,<script>alert(1)</script>");
check("Rejects 'data:' URL", dataResult === "/");

// Valid paths should work
const validResult = signInAgainHref("/session/abc123");
check("Accepts '/session/abc123'", validResult === "/?next=%2Fsession%2Fabc123");

const validWithQuery = signInAgainHref("/today?ref=home");
check("Accepts '/today?ref=home'", validWithQuery === "/?next=%2Ftoday%3Fref%3Dhome");

console.log(exitCode === 0 ? "\n✅ All URL sanitization tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
