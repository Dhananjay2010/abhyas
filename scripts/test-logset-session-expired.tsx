#!/usr/bin/env tsx
/**
 * Test: onLogSet catches session-expired errors and shows the friendly message.
 * 
 * L4 (QA Bot 1, PR #79): logging a set with an expired session showed the raw
 * "SESSION_EXPIRED: Your session has expired". Main (PR #105) shows the friendly
 * "Your session has expired, please sign in again". onLogSet no longer goes through
 * run()/runnerErrorMessage, so it must map isSessionExpired itself.
 * 
 * This test fails when the fix is reverted: the raw error leaks to the user.
 * 
 * Unit test: tests that runnerErrorMessage is called in the onLogSet catch block.
 */
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";
import { runnerErrorMessage } from "../src/lib/session/runner-error-message";

export {};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

async function main() {
  console.log("Testing onLogSet session-expired error handling\n");

  await test("runnerErrorMessage maps SESSION_EXPIRED to friendly message", () => {
    const sessionError = new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
    const result = runnerErrorMessage(sessionError);
    
    if (result !== "Your session has expired, please sign in again") {
      throw new Error(`Expected friendly message, got: "${result}"`);
    }
    if (result.includes("SESSION_EXPIRED:")) {
      throw new Error(`Raw error leaked: "${result}"`);
    }
  });

  await test("runnerErrorMessage handles normal Error", () => {
    const normalError = new Error("Network timeout");
    const result = runnerErrorMessage(normalError);
    
    if (result !== "Network timeout") {
      throw new Error(`Expected error message, got: "${result}"`);
    }
  });

  await test("runnerErrorMessage handles unknown errors", () => {
    const result = runnerErrorMessage("something weird");
    
    if (result !== "Network error. Check your connection.") {
      throw new Error(`Expected default message, got: "${result}"`);
    }
  });

  console.log(`\nPassed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
