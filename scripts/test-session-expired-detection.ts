#!/usr/bin/env tsx
/**
 * Test: isSessionExpired detection
 * 
 * Tests that isSessionExpired correctly identifies session expiration from:
 * - Error thrown by Next.js action client with SESSION_EXPIRED prefix
 * - Response with 401 status
 * - Result object with ok: false and code: 'SESSION_EXPIRED'
 * 
 * All tests must FAIL when run against main's implementation (before the fix).
 */

import { isSessionExpired, SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Error with SESSION_EXPIRED prefix (thrown by action client)
  {
    const error = new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
    const passed = isSessionExpired(error);
    results.push({
      passed,
      message: passed
        ? 'Detects Error with SESSION_EXPIRED prefix'
        : 'FAILED: Does not detect Error with SESSION_EXPIRED prefix'
    });
  }

  // Test 2: Error without SESSION_EXPIRED prefix (should not match)
  {
    const error = new Error('Network error');
    const passed = !isSessionExpired(error);
    results.push({
      passed,
      message: passed
        ? 'Rejects Error without SESSION_EXPIRED prefix'
        : 'FAILED: False positive for generic Error'
    });
  }

  // Test 3: Response with 401 status
  {
    const response = new Response('Unauthorized', { status: 401 });
    const passed = isSessionExpired(response);
    results.push({
      passed,
      message: passed
        ? 'Detects Response with status 401'
        : 'FAILED: Does not detect Response with status 401'
    });
  }

  // Test 4: Response with 200 status (should not match)
  {
    const response = new Response('OK', { status: 200 });
    const passed = !isSessionExpired(response);
    results.push({
      passed,
      message: passed
        ? 'Rejects Response with status 200'
        : 'FAILED: False positive for Response with status 200'
    });
  }

  // Test 5: Result object with ok: false and code: SESSION_EXPIRED
  {
    const result = { ok: false, code: SESSION_EXPIRED_CODE };
    const passed = isSessionExpired(result);
    results.push({
      passed,
      message: passed
        ? 'Detects Result with ok: false and code: SESSION_EXPIRED'
        : 'FAILED: Does not detect Result with ok: false and code: SESSION_EXPIRED'
    });
  }

  // Test 6: Result object with ok: false but different code (should not match)
  {
    const result = { ok: false, error: 'Some other error' };
    const passed = !isSessionExpired(result);
    results.push({
      passed,
      message: passed
        ? 'Rejects Result with ok: false but no SESSION_EXPIRED code'
        : 'FAILED: False positive for Result with different error'
    });
  }

  // Test 7: Result object with ok: true (should not match)
  {
    const result = { ok: true };
    const passed = !isSessionExpired(result);
    results.push({
      passed,
      message: passed
        ? 'Rejects Result with ok: true'
        : 'FAILED: False positive for Result with ok: true'
    });
  }

  // Test 8: null/undefined (should not match)
  {
    const passed1 = !isSessionExpired(null);
    const passed2 = !isSessionExpired(undefined);
    results.push({
      passed: passed1 && passed2,
      message: passed1 && passed2
        ? 'Rejects null and undefined'
        : 'FAILED: False positive for null or undefined'
    });
  }

  // Test 9: String (should not match)
  {
    const passed = !isSessionExpired('SESSION_EXPIRED');
    results.push({
      passed,
      message: passed
        ? 'Rejects plain string'
        : 'FAILED: False positive for string'
    });
  }

  // Test 10: Number (should not match)
  {
    const passed = !isSessionExpired(401);
    results.push({
      passed,
      message: passed
        ? 'Rejects plain number'
        : 'FAILED: False positive for number'
    });
  }

  return results;
}

function main() {
  console.log('==========================================');
  console.log('Testing isSessionExpired detection');
  console.log('==========================================\n');

  const results = runTests();
  let allPassed = true;

  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  console.log('\n==========================================');
  if (allPassed) {
    console.log('All isSessionExpired detection tests passed\n');
    process.exit(0);
  } else {
    console.log('Some isSessionExpired detection tests FAILED\n');
    process.exit(1);
  }
}

main();
