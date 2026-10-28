#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 5: Finish error messages ONLY show fixed friendly copy.
 * 
 * Item 5 scope (narrowed): Fixed copy applies ONLY to finish-path failures:
 * - Cool-down Done
 * - Skip cool-down
 * - finish (early exercises completion)
 * - end early
 * 
 * Log set, undo, and skip-exercise errors keep main's behavior (show validation).
 * 
 * This test verifies that:
 * 1. finishErrorMessage (used by finish paths) ALWAYS returns fixed copy, even for HTML/server text
 * 2. runnerErrorMessage (used by Log set) still returns validation messages
 * 
 *   npx tsx scripts/test-pr169-finish-error-text.tsx
 */

import { finishErrorMessage } from "../src/lib/session/finish-error-message";
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
  console.log("\nPR #169 follow-up item 5: Finish error sanitization\n");

  console.log("Item 5: finishErrorMessage ALWAYS returns fixed copy (mutant 5b)");
  {
    // HTML body (502 Bad Gateway)
    const htmlError = new Error("<html><body><h1>502 Bad Gateway</h1></body></html>");
    const htmlResult = finishErrorMessage(htmlError);
    assertEquals(htmlResult, "That didn't save. Try again.", "HTML error → fixed copy");

    // Arbitrary server text (duplicate key)
    const serverError = new Error("duplicate key value violates unique constraint users_email_key");
    const serverResult = finishErrorMessage(serverError);
    assertEquals(serverResult, "That didn't save. Try again.", "Server error → fixed copy");

    // Generic error
    const genericError = new Error("Something went wrong");
    const genericResult = finishErrorMessage(genericError);
    assertEquals(genericResult, "That didn't save. Try again.", "Generic error → fixed copy");
  }

  console.log("\nItem 5: runnerErrorMessage still returns validation messages for Log set");
  {
    // Validation message (weight limit)
    const validationError = new Error("Weight 500 kg is above the max");
    const validationResult = runnerErrorMessage(validationError, 'set');
    assertEquals(validationResult, "Weight 500 kg is above the max", "Validation message passes through");

    // Another validation message
    const validationError2 = new Error("Reps must be between 1 and 100");
    const validationResult2 = runnerErrorMessage(validationError2, 'set');
    assertEquals(validationResult2, "Reps must be between 1 and 100", "Validation message passes through");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All finish error tests passed!");
})();
