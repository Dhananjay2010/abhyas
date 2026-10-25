#!/usr/bin/env tsx
/**
 * Test: safeNextPath validation logic
 * 
 * Verifies that:
 * 1. Valid paths are accepted
 * 2. Malicious paths are rejected
 * 3. Encoded slashes are only checked in PATH part (not query strings)
 * 4. 512 character limit is enforced
 */

import { safeNextPath } from '../src/lib/safe-next-path';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // ===================================================================
  // Valid paths should be accepted
  // ===================================================================

  const validPaths = [
    '/today',
    '/settings',
    '/yoga',
    '/breathe',
    '/history',
    '/session/123',
    '/today?x=1',
    '/today?x=1&y=2',
    '/session/123?from=history',
    '/history#top',
    '/history?d=1#top',
  ];

  for (const path of validPaths) {
    const result = safeNextPath(path);
    results.push({
      passed: result === path,
      message: result === path
        ? `Valid path accepted: ${path}`
        : `Valid path rejected: ${path}, got '${result}'`
    });
  }

  // ===================================================================
  // Malicious paths should be rejected
  // ===================================================================

  const maliciousPaths: Array<[string | null | undefined, string]> = [
    ['//evil.com', '//evil.com (protocol-relative)'],
    ['//evil.com/path', '//evil.com/path (protocol-relative)'],
    ['//evil.com', '//evil.com (backslash)'],
    ['///evil.com', '///evil.com (double backslash)'],
    ['/evil.com', '/evil.com (starts with backslash)'],
    ['javascript:alert(1)', 'javascript:alert(1) (javascript URI)'],
    ['data:text/html,<script>alert(1)</script>', 'data:text/html (data URI)'],
    ['http://evil.com', 'http://evil.com (absolute URL)'],
    ['https://evil.com', 'https://evil.com (absolute URL)'],
    ['/path/with/backslash', '/path/with/backslash (backslashes)'],
    ['/path\x00null', '/path/x00null (null byte)'],
    ['/path\x1Fcontrol', '/path/x1Fcontrol (control char)'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['', 'empty string'],
  ];

  for (const [input, label] of maliciousPaths) {
    const result = safeNextPath(input);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? `Rejected ${label} → /today`
        : `Failed to reject ${label}, got '${result}'`
    });
  }

  // ===================================================================
  // Encoded slashes in PATH should be rejected
  // ===================================================================

  const encodedSlashesInPath = [
    ['/%2F%2Fevil.com', '/%2F%2Fevil.com (uppercase encoded)'],
    ['/%2f%2fevil.com', '/%2f%2fevil.com (lowercase encoded)'],
    ['/%2F%2Fpath', '/%2F%2Fpath (uppercase)'],
    ['/%2f%2fpath', '/%2f%2fpath (lowercase)'],
    ['/path%2f%2f', '/path%2f%2f (at end)'],
    ['/a%2f%2fb', '/a%2f%2fb (in middle)'],
  ];

  for (const [path, label] of encodedSlashesInPath) {
    const result = safeNextPath(path);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? `Rejected encoded slashes in path: ${label}`
        : `Failed to reject ${label}, got '${result}'`
    });
  }

  // ===================================================================
  // Encoded backslashes in PATH should be rejected
  // ===================================================================

  const encodedBackslashesInPath = [
    ['/%5Cevil.com', '/%5Cevil.com (uppercase %5C)'],
    ['/%5cevil.com', '/%5cevil.com (lowercase %5c)'],
    ['/path%5Cmore', '/path%5Cmore (uppercase)'],
    ['/path%5cmore', '/path%5cmore (lowercase)'],
  ];

  for (const [path, label] of encodedBackslashesInPath) {
    const result = safeNextPath(path);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? `Rejected encoded backslash in path: ${label}`
        : `Failed to reject ${label}, got '${result}'`
    });
  }

  // ===================================================================
  // Encoded slashes in QUERY strings should be ACCEPTED
  // ===================================================================

  const encodedSlashesInQuery = [
    ['/history?ref=a%2F%2Fb', '/history?ref=a%2F%2Fb'],
    ['/history?url=http%3A%2F%2Fexample.com', '/history?url=http%3A%2F%2Fexample.com'],
    ['/session/123?return=%2Ftoday%2F%2F', '/session/123?return=%2Ftoday%2F%2F'],
    ['/page?data=%2f%2f', '/page?data=%2f%2f (lowercase in query)'],
  ];

  for (const [path, label] of encodedSlashesInQuery) {
    const result = safeNextPath(path);
    results.push({
      passed: result === path,
      message: result === path
        ? `Accepted encoded slashes in query: ${label}`
        : `Incorrectly rejected ${label}, got '${result}'`
    });
  }

  // ===================================================================
  // Encoded slashes in FRAGMENT should be ACCEPTED
  // ===================================================================

  const encodedSlashesInFragment = [
    ['/page#section%2F%2Fpart', '/page#section%2F%2Fpart'],
    ['/history#%2f%2f', '/history#%2f%2f (lowercase in fragment)'],
  ];

  for (const [path, label] of encodedSlashesInFragment) {
    const result = safeNextPath(path);
    results.push({
      passed: result === path,
      message: result === path
        ? `Accepted encoded slashes in fragment: ${label}`
        : `Incorrectly rejected ${label}, got '${result}'`
    });
  }

  // ===================================================================
  // Encoded backslashes in QUERY strings should be ACCEPTED
  // ===================================================================

  const encodedBackslashesInQuery = [
    ['/history?path=C%5CUsers', '/history?path=C%5CUsers (uppercase in query)'],
    ['/history?path=C%5cusers', '/history?path=C%5cusers (lowercase in query)'],
  ];

  for (const [path, label] of encodedBackslashesInQuery) {
    const result = safeNextPath(path);
    results.push({
      passed: result === path,
      message: result === path
        ? `Accepted encoded backslash in query: ${label}`
        : `Incorrectly rejected ${label}, got '${result}'`
    });
  }

  // ===================================================================
  // 512 character limit
  // ===================================================================

  // Test: Path longer than 512 characters is rejected
  {
    const longPath = '/history?x=' + 'a'.repeat(600);
    const result = safeNextPath(longPath);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? `Rejected path > 512 chars (${longPath.length} chars)`
        : `Failed to reject long path, got '${result}'`
    });
  }

  // Test: Path at 512 characters is accepted
  {
    const maxPath = '/history?x=' + 'a'.repeat(500);
    const result = safeNextPath(maxPath);
    results.push({
      passed: result === maxPath,
      message: result === maxPath
        ? `Accepted path at 512 chars (${maxPath.length} chars)`
        : `Incorrectly rejected valid 512-char path, got '${result}'`
    });
  }

  // Test: Path just under 512 characters is accepted
  {
    const underLimitPath = '/history?x=' + 'a'.repeat(499);
    const result = safeNextPath(underLimitPath);
    results.push({
      passed: result === underLimitPath,
      message: result === underLimitPath
        ? `Accepted path < 512 chars (${underLimitPath.length} chars)`
        : `Incorrectly rejected valid path, got '${result}'`
    });
  }

  // ===================================================================
  // Custom fallback
  // ===================================================================

  {
    const result = safeNextPath('//evil.com', '/custom');
    results.push({
      passed: result === '/custom',
      message: result === '/custom'
        ? 'Custom fallback works: //evil.com → /custom'
        : `Custom fallback failed: expected '/custom', got '${result}'`
    });
  }

  return results;
}

// Run the tests
console.log('===================================');
console.log('Testing safeNextPath validation');
console.log('===================================\n');

const results = runTests();
let allPassed = true;

for (const result of results) {
  const status = result.passed ? '✓' : '✗';
  console.log(`${status} ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('\n===================================');
if (allPassed) {
  console.log('All safeNextPath tests passed\n');
  process.exit(0);
} else {
  console.log('Some safeNextPath tests failed\n');
  process.exit(1);
}
