#!/usr/bin/env tsx
/**
 * Test: Sign-in redirect helpers (behavioral tests)
 * 
 * Tests the pure helper functions that build redirect URLs and determine
 * redirect targets based on inputs and outputs.
 */

import { buildSignInRedirectSearch, getLandingRedirectTarget, buildOAuthRedirectUrl } from '../src/lib/auth/sign-in-redirect';
import { safeNextPath } from '../src/lib/safe-next-path';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // ===================================================================
  // buildSignInRedirectSearch tests
  // ===================================================================

  // Test 1: Root path gives no next
  {
    const result = buildSignInRedirectSearch('/', '', 'GET');
    results.push({
      passed: result === '',
      message: result === ''
        ? "Root path '/' returns empty string (no next)"
        : `Root path: expected '', got '${result}'`
    });
  }

  // Test 2: /api/* gives no next
  {
    const result = buildSignInRedirectSearch('/api/diag', '', 'GET');
    results.push({
      passed: result === '',
      message: result === ''
        ? "/api/* returns empty string (no next)"
        : `/api/*: expected '', got '${result}'`
    });
  }

  // Test 3: POST request gives no next
  {
    const result = buildSignInRedirectSearch('/settings', '', 'POST');
    results.push({
      passed: result === '',
      message: result === ''
        ? "POST request returns empty string (no next)"
        : `POST: expected '', got '${result}'`
    });
  }

  // Test 4: Protected GET gives encoded next
  {
    const result = buildSignInRedirectSearch('/history', '?d=1', 'GET');
    const expected = '?next=' + encodeURIComponent('/history?d=1');
    results.push({
      passed: result === expected,
      message: result === expected
        ? "GET /history?d=1 returns properly encoded next"
        : `GET /history?d=1: expected '${expected}', got '${result}'`
    });
  }

  // Test 5: Protected path without query
  {
    const result = buildSignInRedirectSearch('/settings', '', 'GET');
    const expected = '?next=' + encodeURIComponent('/settings');
    results.push({
      passed: result === expected,
      message: result === expected
        ? "GET /settings returns ?next=%2Fsettings"
        : `GET /settings: expected '${expected}', got '${result}'`
    });
  }

  // Test 6: PUT request gives no next
  {
    const result = buildSignInRedirectSearch('/settings', '', 'PUT');
    results.push({
      passed: result === '',
      message: result === ''
        ? "PUT request returns empty string (no next)"
        : `PUT: expected '', got '${result}'`
    });
  }

  // ===================================================================
  // getLandingRedirectTarget tests
  // ===================================================================

  // Test 7: Not onboarded + next → /onboarding (ignores next)
  {
    const result = getLandingRedirectTarget(null, '/history', safeNextPath);
    results.push({
      passed: result === '/onboarding',
      message: result === '/onboarding'
        ? "Not onboarded + next '/history' → /onboarding (doesn't skip)"
        : `Not onboarded: expected '/onboarding', got '${result}'`
    });
  }

  // Test 8: Onboarded + malicious next → /today
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', '//evil.com', safeNextPath);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? "Onboarded + '//evil.com' → /today (rejected)"
        : `Onboarded + malicious: expected '/today', got '${result}'`
    });
  }

  // Test 9: Onboarded + valid next → safe path
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', '/history', safeNextPath);
    results.push({
      passed: result === '/history',
      message: result === '/history'
        ? "Onboarded + '/history' → /history"
        : `Onboarded + valid next: expected '/history', got '${result}'`
    });
  }

  // Test 10: Onboarded + no next → /today
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', null, safeNextPath);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? "Onboarded + no next → /today"
        : `Onboarded + no next: expected '/today', got '${result}'`
    });
  }

  // Test 11: Onboarded + empty string next → /today
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', '', safeNextPath);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? "Onboarded + empty string → /today"
        : `Onboarded + empty: expected '/today', got '${result}'`
    });
  }

  // ===================================================================
  // buildOAuthRedirectUrl tests
  // ===================================================================

  // Test 12: No next → base callback URL
  {
    const result = buildOAuthRedirectUrl('http://localhost:3000', null, safeNextPath);
    results.push({
      passed: result === 'http://localhost:3000/auth/callback',
      message: result === 'http://localhost:3000/auth/callback'
        ? "No next → base callback URL"
        : `No next: expected base URL, got '${result}'`
    });
  }

  // Test 13: Valid next → callback with encoded next
  {
    const result = buildOAuthRedirectUrl('http://localhost:3000', '/history', safeNextPath);
    const expected = 'http://localhost:3000/auth/callback?next=' + encodeURIComponent('/history');
    results.push({
      passed: result === expected,
      message: result === expected
        ? "Valid next '/history' → callback?next=%2Fhistory"
        : `Valid next: expected '${expected}', got '${result}'`
    });
  }

  // Test 14: Malicious next drops (client validation)
  {
    const result = buildOAuthRedirectUrl('http://localhost:3000', 'https://evil.com', safeNextPath);
    results.push({
      passed: result === 'http://localhost:3000/auth/callback',
      message: result === 'http://localhost:3000/auth/callback'
        ? "Malicious 'https://evil.com' drops (client-side validation)"
        : `Malicious next: expected base URL, got '${result}'`
    });
  }

  // Test 15: Double-slash next drops
  {
    const result = buildOAuthRedirectUrl('http://localhost:3000', '//evil.com', safeNextPath);
    results.push({
      passed: result === 'http://localhost:3000/auth/callback',
      message: result === 'http://localhost:3000/auth/callback'
        ? "Malicious '//evil.com' drops (client-side validation)"
        : `Double-slash: expected base URL, got '${result}'`
    });
  }

  // Test 16: Next with query params preserved
  {
    const result = buildOAuthRedirectUrl('http://localhost:3000', '/session/123?from=today', safeNextPath);
    const expected = 'http://localhost:3000/auth/callback?next=' + encodeURIComponent('/session/123?from=today');
    results.push({
      passed: result === expected,
      message: result === expected
        ? "Next with query params preserved and encoded"
        : `Query params: expected '${expected}', got '${result}'`
    });
  }

  return results;
}

// Run the tests
console.log('================================================');
console.log('Testing sign-in redirect helpers (behavioral)');
console.log('================================================\n');

const results = runTests();
let allPassed = true;

for (const result of results) {
  const status = result.passed ? '✓' : '✗';
  console.log(`${status} ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('\n================================================');
if (allPassed) {
  console.log('All sign-in redirect tests passed\n');
  process.exit(0);
} else {
  console.log('Some sign-in redirect tests failed\n');
  process.exit(1);
}
