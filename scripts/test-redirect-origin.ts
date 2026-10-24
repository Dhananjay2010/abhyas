#!/usr/bin/env tsx
/**
 * Test: redirect origin builder for auth callbacks
 * 
 * Validates that the redirect origin is built safely from headers,
 * with an allowlist to prevent open redirects.
 */

import { getRedirectOrigin } from '../src/lib/auth/redirect-origin';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Vercel prod (x-forwarded-proto https, host abhyas-indol.vercel.app)
  {
    const request = new Request('http://internal.vercel.com/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'abhyas-indol.vercel.app',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'https://abhyas-indol.vercel.app') {
      results.push({ passed: true, message: 'Vercel prod: https://abhyas-indol.vercel.app' });
    } else {
      results.push({ passed: false, message: `Vercel prod: expected https://abhyas-indol.vercel.app, got ${origin}` });
    }
  }

  // Test 2: Local next start (http localhost:3100, no forwarded headers)
  {
    const request = new Request('http://localhost:3100/auth/callback');
    const origin = getRedirectOrigin(request);
    if (origin === 'http://localhost:3100') {
      results.push({ passed: true, message: 'Local next start: http://localhost:3100' });
    } else {
      results.push({ passed: false, message: `Local next start: expected http://localhost:3100, got ${origin}` });
    }
  }

  // Test 3: Next dev (http localhost:3000, no forwarded headers)
  {
    const request = new Request('http://localhost:3000/auth/callback');
    const origin = getRedirectOrigin(request);
    if (origin === 'http://localhost:3000') {
      results.push({ passed: true, message: 'Next dev: http://localhost:3000' });
    } else {
      results.push({ passed: false, message: `Next dev: expected http://localhost:3000, got ${origin}` });
    }
  }

  // Test 4: Spoofed x-forwarded-host not in allowlist (falls back to request host)
  {
    const request = new Request('http://localhost:3000/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'evil.com',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'http://localhost:3000') {
      results.push({ passed: true, message: 'Spoofed host not in allowlist: falls back to request host' });
    } else {
      results.push({ passed: false, message: `Spoofed host: expected http://localhost:3000, got ${origin}` });
    }
  }

  // Test 5: x-forwarded-proto uses the forwarded protocol
  {
    const request = new Request('http://internal.vercel.com/auth/callback', {
      headers: {
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'abhyas-indol.vercel.app',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'http://abhyas-indol.vercel.app') {
      results.push({ passed: true, message: 'x-forwarded-proto: uses forwarded protocol (http)' });
    } else {
      results.push({ passed: false, message: `x-forwarded-proto: expected http://abhyas-indol.vercel.app, got ${origin}` });
    }
  }

  // Test 6: Request's own host is always in the allowlist
  {
    const request = new Request('https://staging.example.com/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'staging.example.com',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'https://staging.example.com') {
      results.push({ passed: true, message: 'Request host is always allowed' });
    } else {
      results.push({ passed: false, message: `Request host: expected https://staging.example.com, got ${origin}` });
    }
  }

  // Test 7: No x-forwarded-proto falls back to request protocol
  {
    const request = new Request('https://example.com/auth/callback', {
      headers: {
        'x-forwarded-host': 'example.com',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'https://example.com') {
      results.push({ passed: true, message: 'No x-forwarded-proto: uses request protocol' });
    } else {
      results.push({ passed: false, message: `No x-forwarded-proto: expected https://example.com, got ${origin}` });
    }
  }

  return results;
}

// Run the tests
console.log('=====================================');
console.log('Testing redirect origin builder');
console.log('=====================================\n');

const results = runTests();
let allPassed = true;

for (const result of results) {
  const status = result.passed ? '✓' : '✗';
  console.log(`${status} ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('\n=====================================');
if (allPassed) {
  console.log('All redirect origin tests passed\n');
  process.exit(0);
} else {
  console.log('Some redirect origin tests failed\n');
  process.exit(1);
}
