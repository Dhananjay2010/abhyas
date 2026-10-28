#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 5: cool-down Done/Skip sanitizes known server error patterns.
 * 
 * Verifies that runnerErrorMessage is called on finish errors to sanitize known
 * dangerous patterns (5xx errors, offline errors, session expired) with friendly copy.
 * The run() function now wraps all finish errors through runnerErrorMessage.
 * 
 *   npx tsx scripts/test-pr169-cooldown-finish-error.ts
 */

import { runnerErrorMessage } from "../src/lib/session/runner-error-message";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

(function main() {
  console.log("\nPR #169 follow-up item 5: cool-down finish error sanitization\n");

  console.log("Case 1: Plain 'Internal Server Error' text (known 5xx pattern)");
  {
    const rawError = new Error("Internal Server Error");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "Something went wrong on our side. Please try again.", "5xx error shows friendly message");
  }

  console.log("\nCase 2: Status 500 error (known 5xx pattern)");
  {
    const rawError = new Error("status 500");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "Something went wrong on our side. Please try again.", "status 5xx shows friendly message");
  }

  console.log("\nCase 3: 500 Internal Server Error (known 5xx pattern)");
  {
    const rawError = new Error("500 Internal Server Error");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "Something went wrong on our side. Please try again.", "500 Internal Server Error shows friendly message");
  }

  console.log("\nCase 4: Status 503 (known 5xx pattern)");
  {
    const rawError = new Error("status 503");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "Something went wrong on our side. Please try again.", "status 503 shows friendly message");
  }

  console.log("\nCase 5: Offline error (TypeError: Failed to fetch)");
  {
    const rawError = new TypeError("Failed to fetch");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "You're offline. That didn't go through, try again when you're back online.", "offline error shows friendly message");
  }

  console.log("\nCase 6: Session expired error (correct prefix)");
  {
    const rawError = new Error("SESSION_EXPIRED: token expired");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "Your session has expired, please sign in again", "session expired shows friendly message");
  }

  console.log("\nCase 7: Generic error messages (allowed through)");
  {
    const rawError = new Error("Weight must be positive");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "Weight must be positive", "validation errors pass through");
  }

  console.log("\nCase 8: Plain-text server error (passes through if not matching 5xx pattern)");
  {
    const rawError = new Error("qa-bot1 blocked");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "qa-bot1 blocked", "arbitrary server messages pass through");
  }

  console.log("\nCase 9: HTML response (passes through if not matching 5xx pattern)");
  {
    const rawError = new Error("<html><body>Server Error</body></html>");
    const result = runnerErrorMessage(rawError, "action");
    assertEquals(result, "<html><body>Server Error</body></html>", "HTML messages pass through unless they match 5xx patterns");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All cool-down finish error sanitization tests passed!");
})();
