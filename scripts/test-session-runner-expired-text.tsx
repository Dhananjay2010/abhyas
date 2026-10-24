#!/usr/bin/env tsx
/**
 * Test: Session runner expired-session text (L1)
 * 
 * Tests that the session runner shows a friendly message when session expires,
 * not the raw "SESSION_EXPIRED: ..." text.
 * 
 * Unit test: tests the runnerErrorMessage helper directly.
 */

import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';
import { runnerErrorMessage } from '../src/lib/session/runner-error-message';

interface TestResult {
  passed: boolean;
  message: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: SESSION_EXPIRED error returns friendly message
  {
    const sessionError = new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
    const result = runnerErrorMessage(sessionError);
    
    const isFriendly = result === "Your session has expired, please sign in again";
    const containsRaw = result.includes("SESSION_EXPIRED");
    
    if (!isFriendly) {
      results.push({
        passed: false,
        message: `Test 1: FAILED - Expected friendly message, got: "${result}"`
      });
    } else if (containsRaw) {
      results.push({
        passed: false,
        message: `Test 1: FAILED - Friendly message should not contain "SESSION_EXPIRED"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 1: PASSED - SESSION_EXPIRED error returns friendly message without raw code'
      });
    }
  }

  // Test 2: Normal Error returns its message
  {
    const normalError = new Error("Network timeout");
    const result = runnerErrorMessage(normalError);
    
    if (result !== "Network timeout") {
      results.push({
        passed: false,
        message: `Test 2: FAILED - Expected "Network timeout", got: "${result}"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 2: PASSED - Normal Error returns its message'
      });
    }
  }

  // Test 3: Non-Error object returns generic message
  {
    const nonError = { code: 500, message: "Server error" };
    const result = runnerErrorMessage(nonError);
    
    if (result !== "Network error. Check your connection.") {
      results.push({
        passed: false,
        message: `Test 3: FAILED - Expected generic message, got: "${result}"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 3: PASSED - Non-Error returns generic message'
      });
    }
  }

  // Test 4: String (non-Error) returns generic message
  {
    const stringError = "Something went wrong";
    const result = runnerErrorMessage(stringError);
    
    if (result !== "Network error. Check your connection.") {
      results.push({
        passed: false,
        message: `Test 4: FAILED - Expected generic message for string, got: "${result}"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 4: PASSED - String returns generic message'
      });
    }
  }

  return results;
}

runTests()
  .then((results) => {
    console.log('\n=== Session Runner Expired Text Tests (L1) ===\n');
    
    let passed = 0;
    let failed = 0;

    for (const result of results) {
      if (result.passed) {
        passed++;
        console.log(`✓ ${result.message}`);
      } else {
        failed++;
        console.log(`✗ ${result.message}`);
      }
    }

    console.log(`\nTotal: ${results.length}, Passed: ${passed}, Failed: ${failed}\n`);

    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n✗ Test suite crashed:', error);
    process.exit(1);
  });
