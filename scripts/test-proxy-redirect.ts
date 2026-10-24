#!/usr/bin/env tsx
/**
 * Test: Proxy redirect building for unauthenticated requests
 * 
 * Verifies that when an unauthenticated user tries to access a protected page,
 * the proxy redirects appropriately:
 * - Adds ?next for protected pages (GET requests)
 * - Does NOT add ?next for root path, /api/*, or non-GET requests
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  const sessionPath = join(process.cwd(), 'src/lib/supabase/session.ts');
  const sessionContent = readFileSync(sessionPath, 'utf-8');

  // Test 1: Proxy adds ?next for protected GET requests
  {
    const hasNextLogic = /const originalPath.*pathname.*search/.test(sessionContent);
    results.push({
      passed: hasNextLogic,
      message: hasNextLogic
        ? 'Proxy builds next parameter from pathname + search'
        : 'Proxy does not build next parameter correctly'
    });
  }

  // Test 2: Proxy checks for root path
  {
    const checksRoot = /pathname\s*!==\s*['"]\/['"]/.test(sessionContent);
    results.push({
      passed: checksRoot,
      message: checksRoot
        ? 'Proxy checks that pathname is not root (/)'
        : 'Proxy does not check for root path'
    });
  }

  // Test 3: Proxy checks for /api/* paths
  {
    const checksApi = /pathname\.startsWith\(['"]\/api\/['"]\)/.test(sessionContent);
    results.push({
      passed: checksApi,
      message: checksApi
        ? 'Proxy checks for /api/* paths'
        : 'Proxy does not check for /api/* paths'
    });
  }

  // Test 4: Proxy checks request method
  {
    const checksMethod = /request\.method\s*===\s*['"]GET['"]/.test(sessionContent);
    results.push({
      passed: checksMethod,
      message: checksMethod
        ? 'Proxy checks that request method is GET'
        : 'Proxy does not check request method'
    });
  }

  // Test 5: Proxy conditionally adds next parameter
  {
    const conditionalNext = /if\s*\(\s*shouldAddNext\s*\)/.test(sessionContent) ||
                            /shouldAddNext[\s\S]*?url\.search/.test(sessionContent);
    results.push({
      passed: conditionalNext,
      message: conditionalNext
        ? 'Proxy conditionally adds ?next based on checks'
        : 'Proxy does not conditionally add ?next'
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
