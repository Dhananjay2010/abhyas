#!/usr/bin/env tsx
/**
 * Test: redirect origin builder and next path validator for auth callbacks
 * 
 * Validates that the redirect origin is built safely from headers,
 * with an allowlist to prevent open redirects, and that the next path
 * validator rejects malicious inputs.
 */

import { getRedirectOrigin, safeNextPath } from '../src/lib/auth/redirect-origin';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // ===================================================================
  // safeNextPath tests
  // ===================================================================

  // Test: Valid paths are accepted
  {
    const cases = [
      ['/today', '/today'],
      ['/settings', '/settings'],
      ['/today?x=1', '/today?x=1'],
      ['/breathe/box-breathing', '/breathe/box-breathing'],
      ['/session/abc123?from=history', '/session/abc123?from=history'],
    ];
    for (const [input, expected] of cases) {
      const result = safeNextPath(input);
      if (result === expected) {
        results.push({ passed: true, message: `safeNextPath('${input}') = '${expected}'` });
      } else {
        results.push({ passed: false, message: `safeNextPath('${input}'): expected '${expected}', got '${result}'` });
      }
    }
  }

  // Test: Malicious paths are rejected
  {
    const malicious: Array<string | null | undefined> = [
      '//evil.com',
      '//evil.com/path',
      '/\\evil.com',
      '/\\\\evil.com',
      '\\evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://evil.com',
      'https://evil.com',
      '/path\\with\\backslash',
      '/path\x00null',
      '/path\x1Fcontrol',
      null,
      undefined,
      '',
    ];
    for (const input of malicious) {
      const result = safeNextPath(input);
      if (result === '/today') {
        results.push({ passed: true, message: `safeNextPath(${JSON.stringify(input)}) = '/today' (rejected)` });
      } else {
        results.push({ passed: false, message: `safeNextPath(${JSON.stringify(input)}): expected '/today', got '${result}'` });
      }
    }
  }

  // Test: Paths longer than 512 characters are rejected
  {
    const longPath = '/history' + '?x=' + 'a'.repeat(600);
    const result = safeNextPath(longPath);
    if (result === '/today') {
      results.push({ passed: true, message: `safeNextPath(${longPath.length}-char path) = '/today' (rejected, too long)` });
    } else {
      results.push({ passed: false, message: `safeNextPath(${longPath.length}-char path): expected '/today', got '${result}'` });
    }
  }

  // Test: Paths at or under 512 characters are accepted
  {
    const acceptablePath = '/history' + '?x=' + 'a'.repeat(500);
    const result = safeNextPath(acceptablePath);
    if (result === acceptablePath) {
      results.push({ passed: true, message: `safeNextPath(${acceptablePath.length}-char path) accepted` });
    } else {
      results.push({ passed: false, message: `safeNextPath(${acceptablePath.length}-char path): expected path to be accepted, got '${result}'` });
    }
  }

  // ===================================================================
  // getRedirectOrigin tests
  // ===================================================================

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

  // Test 8: Localhost ignores x-forwarded headers (forwarded host not brand host)
  {
    const request = new Request('http://localhost:3000/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'abhyas-indol.vercel.app',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'http://localhost:3000') {
      results.push({ passed: true, message: 'Localhost ignores x-forwarded headers (forwarded host is brand host)' });
    } else {
      results.push({ passed: false, message: `Localhost with forwarded brand host: expected http://localhost:3000, got ${origin}` });
    }
  }

  // Test 9: Brand host in request trusts x-forwarded headers when forwarded host is brand host
  {
    const request = new Request('http://internal.vercel.com/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'abhyas-indol.vercel.app',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'https://abhyas-indol.vercel.app') {
      results.push({ passed: true, message: 'Brand host in forwarded-host: trusts x-forwarded headers' });
    } else {
      results.push({ passed: false, message: `Brand host with forwarded headers: expected https://abhyas-indol.vercel.app, got ${origin}` });
    }
  }

  // Test 10: Request host == forwarded host (not brand) uses request origin
  {
    const request = new Request('https://staging.example.com/auth/callback', {
      headers: {
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'staging.example.com',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'https://staging.example.com') {
      results.push({ passed: true, message: 'Forwarded host == request host (not brand): uses request origin (ignores forwarded proto)' });
    } else {
      results.push({ passed: false, message: `Forwarded host == request host: expected https://staging.example.com, got ${origin}` });
    }
  }

  // Test 11: IPv6 localhost (::1) ignores x-forwarded headers
  {
    const request = new Request('http://[::1]:3000/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'abhyas-indol.vercel.app',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'http://[::1]:3000') {
      results.push({ passed: true, message: 'IPv6 localhost [::1] ignores x-forwarded headers' });
    } else {
      results.push({ passed: false, message: `IPv6 localhost [::1]: expected http://[::1]:3000, got ${origin}` });
    }
  }

  // Test 12: 127.x.x.x ignores x-forwarded headers
  {
    const request = new Request('http://127.0.0.1:3000/auth/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'abhyas-indol.vercel.app',
      },
    });
    const origin = getRedirectOrigin(request);
    if (origin === 'http://127.0.0.1:3000') {
      results.push({ passed: true, message: '127.0.0.1 ignores x-forwarded headers' });
    } else {
      results.push({ passed: false, message: `127.0.0.1: expected http://127.0.0.1:3000, got ${origin}` });
    }
  }

  return results;
}

// Run the tests
console.log('=======================================================');
console.log('Testing redirect origin builder and next path validator');
console.log('=======================================================\n');

const results = runTests();
let allPassed = true;

for (const result of results) {
  const status = result.passed ? '✓' : '✗';
  console.log(`${status} ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('\n=======================================================');
if (allPassed) {
  console.log('All redirect origin and next path tests passed\n');
  process.exit(0);
} else {
  console.log('Some redirect origin or next path tests failed\n');
  process.exit(1);
}
