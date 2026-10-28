#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 5: Cool-down finish error call site sanitizes.
 * 
 * Page-level test that verifies session-runner.tsx run() function
 * wraps errors through runnerErrorMessage at the call site.
 * 
 *   npx tsx scripts/test-pr169-runner-finish-error-call.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

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
  console.log("\nPR #169 follow-up item 5: Cool-down finish error call site sanitization\n");

  const runnerPath = join(process.cwd(), "src/app/session/[id]/session-runner.tsx");
  const content = readFileSync(runnerPath, "utf-8");

  console.log("Case 1: run() function imports runnerErrorMessage");
  {
    const hasImport = content.includes("import") && 
                       content.includes("runnerErrorMessage") &&
                       content.includes("from") &&
                       content.includes("runner-error-message");
    assertEquals(hasImport, true, "runnerErrorMessage is imported");
  }

  console.log("\nCase 2: run() wraps !r.ok error through runnerErrorMessage");
  {
    // Look for the pattern where we call runnerErrorMessage on the error
    const hasWrappedError = content.includes("runnerErrorMessage(new Error(rawError)") ||
                             content.includes("runnerErrorMessage(new Error(") && content.includes("setError(runnerErrorMessage");
    assertEquals(hasWrappedError, true, "error is wrapped through runnerErrorMessage");
  }

  console.log("\nCase 3: run() creates rawError variable from result");
  {
    const hasRawError = content.includes("const rawError =") && 
                         content.includes('"error" in r');
    assertEquals(hasRawError, true, "raw error is extracted from result");
  }

  console.log("\nCase 4: run() catch block still uses runnerErrorMessage");
  {
    const catchBlock = content.match(/catch \(err\) \{[\s\S]*?setError\(runnerErrorMessage\(err, 'action'\)\);/);
    assertEquals(catchBlock !== null, true, "catch block uses runnerErrorMessage");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All runner finish error call tests passed!");
})();
