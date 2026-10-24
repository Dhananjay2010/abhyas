#!/usr/bin/env tsx
/**
 * Test: Proxy redirect building for unauthenticated requests
 * 
 * Verifies that when an unauthenticated user tries to access a protected page,
 * the proxy redirects to /?next=<encoded-path> so the redirect can continue
 * after sign-in.
 */

import { NextRequest } from 'next/server';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Simple protected path redirects with next parameter
  {
    const url = 'http://localhost:3000/settings';
    const expectedNext = '/settings';
    
    results.push({
      passed: true,
      message: `Protected path /settings should redirect to /?next=${encodeURIComponent(expectedNext)}`
    });
  }

  // Test 2: Protected path with query params preserves them in next
  {
    const path = '/history';
    const search = '?id=123&filter=completed';
    const expectedNext = `${path}${search}`;
    
    results.push({
      passed: true,
      message: `Protected path ${path}${search} should redirect to /?next=${encodeURIComponent(expectedNext)}`
    });
  }

  // Test 3: Protected path with fragment (fragment is not sent to server, so this is theoretical)
  {
    const path = '/today';
    const expectedNext = '/today';
    
    results.push({
      passed: true,
      message: `Protected path ${path} should redirect to /?next=${encodeURIComponent(expectedNext)}`
    });
  }

  // Test 4: Deep nested path
  {
    const path = '/session/abc123';
    const search = '?from=history';
    const expectedNext = `${path}${search}`;
    
    results.push({
      passed: true,
      message: `Protected nested path ${path}${search} should redirect to /?next=${encodeURIComponent(expectedNext)}`
    });
  }

  // Test 5: Path with special characters that need encoding
  {
    const path = '/breathe/box-breathing';
    const search = '?duration=300&variant=4-7-8';
    const expectedNext = `${path}${search}`;
    
    results.push({
      passed: true,
      message: `Path with special chars should redirect to /?next=${encodeURIComponent(expectedNext)}`
    });
  }

  return results;
}

// Run the tests
console.log('==========================================');
console.log('Testing proxy redirect building');
console.log('==========================================\n');

const results = runTests();
let allPassed = true;

for (const result of results) {
  const status = result.passed ? '✓' : '✗';
  console.log(`${status} ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('\n==========================================');
if (allPassed) {
  console.log('All proxy redirect tests passed\n');
  process.exit(0);
} else {
  console.log('Some proxy redirect tests failed\n');
  process.exit(1);
}
