#!/usr/bin/env tsx
/**
 * Test: Auth callback next parameter handling
 * 
 * Verifies that:
 * 1. The callback route uses safeNextPath for the next parameter
 * 2. The callback uses getRedirectOrigin for both success and error paths
 * 3. The callback redirects to the safe next path on success
 * 4. The callback uses getRedirectOrigin (not raw origin) for error redirects
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];
  
  const callbackPath = join(process.cwd(), 'src/app/auth/callback/route.ts');
  const callbackContent = readFileSync(callbackPath, 'utf-8');

  // Test 1: Callback imports both safeNextPath and getRedirectOrigin
  {
    const hasBothImports = /import[\s\S]*?\{[\s\S]*?getRedirectOrigin[\s\S]*?safeNextPath[\s\S]*?\}[\s\S]*?from[\s\S]*?redirect-origin/.test(callbackContent);
    results.push({
      passed: hasBothImports,
      message: hasBothImports
        ? 'Callback imports getRedirectOrigin and safeNextPath'
        : 'Callback does not import both required functions'
    });
  }

  // Test 2: Callback calls safeNextPath on the next parameter
  {
    const callsSafeNext = /const\s+next\s*=\s*safeNextPath\(searchParams\.get\(['"]next['"]\)\)/i.test(callbackContent);
    results.push({
      passed: callsSafeNext,
      message: callsSafeNext
        ? 'Callback validates next parameter with safeNextPath'
        : 'Callback does not validate next parameter with safeNextPath'
    });
  }

  // Test 3: Callback uses getRedirectOrigin for success redirect
  {
    const usesGetRedirectOrigin = /const\s+base\s*=\s*getRedirectOrigin\(request\)/i.test(callbackContent);
    results.push({
      passed: usesGetRedirectOrigin,
      message: usesGetRedirectOrigin
        ? 'Callback uses getRedirectOrigin for success redirect base'
        : 'Callback does not use getRedirectOrigin'
    });
  }

  // Test 4: Callback success redirects to base + next
  {
    const redirectsToNext = /NextResponse\.redirect\(`\$\{base\}\$\{next\}`\)/i.test(callbackContent);
    results.push({
      passed: redirectsToNext,
      message: redirectsToNext
        ? 'Callback success redirects to base + next'
        : 'Callback does not redirect to base + next'
    });
  }

  // Test 5: Callback error path uses getRedirectOrigin (not raw origin)
  {
    const errorUsesGetRedirect = /NextResponse\.redirect\(`\$\{base\}\/\?error=auth_failed`\)/i.test(callbackContent);
    const noRawOrigin = !/NextResponse\.redirect\(`\$\{origin\}\/\?error=auth_failed`\)/i.test(callbackContent);
    const passed = errorUsesGetRedirect && noRawOrigin;
    results.push({
      passed,
      message: passed
        ? 'Callback error path uses getRedirectOrigin (not raw origin)'
        : 'Callback error path does not use getRedirectOrigin'
    });
  }

  // Test 6: Callback does not destructure origin from URL anymore
  {
    const noOriginDestructure = !/const\s*\{[^}]*origin[^}]*\}\s*=\s*new URL\(request\.url\)/i.test(callbackContent);
    results.push({
      passed: noOriginDestructure,
      message: noOriginDestructure
        ? 'Callback does not destructure raw origin'
        : 'Callback still destructures raw origin (should use getRedirectOrigin instead)'
    });
  }

  return results;
}

// Run the tests
console.log('==========================================');
console.log('Testing auth callback next parameter handling');
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
  console.log('All callback next tests passed\n');
  process.exit(0);
} else {
  console.log('Some callback next tests failed\n');
  process.exit(1);
}
