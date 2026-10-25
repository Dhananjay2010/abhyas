#!/usr/bin/env tsx
/**
 * Test: signInAgainHref URL generation
 * 
 * Tests that signInAgainHref correctly:
 * - Encodes the next parameter
 * - Rejects protocol-relative URLs (//evil.com)
 * - Rejects absolute URLs (https://evil.com)
 * - Rejects invalid paths
 * - Handles valid relative paths correctly
 * 
 * All tests must FAIL when run against main's implementation (before the fix).
 */

import { signInAgainHref } from '../src/lib/auth/session-expired';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Valid path with encoding
  {
    const result = signInAgainHref('/settings?tab=profile');
    const expected = '/?next=' + encodeURIComponent('/settings?tab=profile');
    const passed = result === expected;
    results.push({
      passed,
      message: passed
        ? `Encodes path with query: "${result}"`
        : `FAILED: Expected "${expected}", got "${result}"`
    });
  }

  // Test 2: Simple path
  {
    const result = signInAgainHref('/history');
    const expected = '/?next=%2Fhistory';
    const passed = result === expected;
    results.push({
      passed,
      message: passed
        ? `Encodes simple path: "${result}"`
        : `FAILED: Expected "${expected}", got "${result}"`
    });
  }

  // Test 3: Protocol-relative URL (should reject)
  {
    const result = signInAgainHref('//evil.com');
    const isRejected = result === '/';
    results.push({
      passed: isRejected,
      message: isRejected
        ? `Rejects protocol-relative URL: returns "/"`
        : `FAILED: Accepted "//evil.com", returned "${result}"`
    });
  }

  // Test 4: Absolute URL with https (should reject)
  {
    const result = signInAgainHref('https://evil.com/steal');
    const isRejected = result === '/';
    results.push({
      passed: isRejected,
      message: isRejected
        ? `Rejects absolute HTTPS URL: returns "/"`
        : `FAILED: Accepted "https://evil.com/steal", returned "${result}"`
    });
  }

  // Test 5: Absolute URL with http (should reject)
  {
    const result = signInAgainHref('http://evil.com');
    const isRejected = result === '/';
    results.push({
      passed: isRejected,
      message: isRejected
        ? `Rejects absolute HTTP URL: returns "/"`
        : `FAILED: Accepted "http://evil.com", returned "${result}"`
    });
  }

  // Test 6: Path with backslash (should reject)
  {
    const result = signInAgainHref('/settings/evil');
    const isRejected = result === '/';
    results.push({
      passed: isRejected,
      message: isRejected
        ? `Rejects path with backslash: returns "/"`
        : `FAILED: Accepted path with backslash, returned "${result}"`
    });
  }

  // Test 7: Path longer than 512 characters (should reject)
  {
    const longPath = '/path' + 'a'.repeat(510);
    const result = signInAgainHref(longPath);
    const isRejected = result === '/';
    results.push({
      passed: isRejected,
      message: isRejected
        ? `Rejects path longer than 512 chars: returns "/"`
        : `FAILED: Accepted path longer than 512 chars, returned "${result}"`
    });
  }

  // Test 8: Root path (edge case)
  {
    const result = signInAgainHref('/');
    const expected = '/?next=%2F';
    const passed = result === expected;
    results.push({
      passed,
      message: passed
        ? `Handles root path: "${result}"`
        : `FAILED: Expected "${expected}", got "${result}"`
    });
  }

  // Test 9: Path with hash
  {
    const result = signInAgainHref('/settings#profile');
    const expected = '/?next=' + encodeURIComponent('/settings#profile');
    const passed = result === expected;
    results.push({
      passed,
      message: passed
        ? `Encodes path with hash: "${result}"`
        : `FAILED: Expected "${expected}", got "${result}"`
    });
  }

  // Test 10: Empty string (should reject or handle gracefully)
  {
    const result = signInAgainHref('');
    const isRejected = result === '/';
    results.push({
      passed: isRejected,
      message: isRejected
        ? `Handles empty string: returns "/"`
        : `FAILED: Empty string returned "${result}"`
    });
  }

  return results;
}

function main() {
  console.log('==========================================');
  console.log('Testing signInAgainHref URL generation');
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
    console.log('All signInAgainHref tests passed\n');
    process.exit(0);
  } else {
    console.log('Some signInAgainHref tests FAILED\n');
    process.exit(1);
  }
}

main();
