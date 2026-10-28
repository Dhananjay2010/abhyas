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

  // Test 2: Normal Error returns fixed friendly copy (item 5 decision)
  {
    const normalError = new Error("Network timeout");
    const result = runnerErrorMessage(normalError);
    
    // Item 5 decision: ALWAYS show fixed friendly copy, never pass through arbitrary text
    const expectedSet = "That set wasn't saved. Please try again.";
    if (result !== expectedSet) {
      results.push({
        passed: false,
        message: `Test 2: FAILED - Expected fixed copy, got: "${result}"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 2: PASSED - Normal Error returns fixed friendly copy (item 5)'
      });
    }
  }

  // Test 3: Non-Error object returns fixed friendly copy (item 5 decision)
  {
    const nonError = { code: 500, message: "Server error" };
    const result = runnerErrorMessage(nonError);
    
    const expectedSet = "That set wasn't saved. Please try again.";
    if (result !== expectedSet) {
      results.push({
        passed: false,
        message: `Test 3: FAILED - Expected fixed copy, got: "${result}"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 3: PASSED - Non-Error returns fixed friendly copy (item 5)'
      });
    }
  }

  // Test 4: String returns fixed friendly copy (item 5 decision)
  {
    const stringError = "Something went wrong";
    const result = runnerErrorMessage(stringError);
    
    const expectedSet = "That set wasn't saved. Please try again.";
    if (result !== expectedSet) {
      results.push({
        passed: false,
        message: `Test 4: FAILED - Expected fixed copy, got: "${result}"`
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 4: PASSED - String returns fixed friendly copy (item 5)'
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
