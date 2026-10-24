#!/usr/bin/env tsx
/**
 * Test: Proxy uses sign-in redirect helper
 * 
 * Verifies that the session proxy uses the buildSignInRedirectSearch helper
 * for consistent redirect behavior. The helper's behavior is tested separately
 * in test-sign-in-redirect.ts.
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

  // Test 1: Proxy imports buildSignInRedirectSearch
  {
    const importsHelper = /import[\s\S]*?buildSignInRedirectSearch[\s\S]*?from[\s\S]*?sign-in-redirect/.test(sessionContent);
    results.push({
      passed: importsHelper,
      message: importsHelper
        ? 'Proxy imports buildSignInRedirectSearch helper'
        : 'Proxy does not import buildSignInRedirectSearch'
    });
  }

  // Test 2: Proxy uses the helper to build search string
  {
    const usesHelper = /buildSignInRedirectSearch\(/.test(sessionContent);
    results.push({
      passed: usesHelper,
      message: usesHelper
        ? 'Proxy calls buildSignInRedirectSearch to build search string'
        : 'Proxy does not use buildSignInRedirectSearch'
    });
  }

  // Test 3: Proxy passes pathname, search, and method to helper
  {
    const passesArgs = /buildSignInRedirectSearch\([^)]*pathname[^)]*search[^)]*method[^)]*\)/.test(sessionContent);
    results.push({
      passed: passesArgs,
      message: passesArgs
        ? 'Proxy passes pathname, search, method to helper'
        : 'Proxy does not pass correct arguments to helper'
    });
  }

  // Test 4: Proxy assigns helper result to url.search
  {
    const assignsToSearch = /url\.search\s*=\s*buildSignInRedirectSearch/.test(sessionContent);
    results.push({
      passed: assignsToSearch,
      message: assignsToSearch
        ? 'Proxy assigns helper result to url.search'
        : 'Proxy does not assign helper result correctly'
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
