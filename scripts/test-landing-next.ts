#!/usr/bin/env tsx
/**
 * Test: Landing page next parameter handling
 * 
 * Verifies that:
 * 1. The landing page passes the next parameter to SignInButton
 * 2. A signed-in user with a next parameter is redirected to the safe path
 * 3. The next parameter goes through safeNextPath validation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];
  
  const pagePath = join(process.cwd(), 'src/app/page.tsx');
  const pageContent = readFileSync(pagePath, 'utf-8');
  
  const signInButtonPath = join(process.cwd(), 'src/app/sign-in-button.tsx');
  const signInButtonContent = readFileSync(signInButtonPath, 'utf-8');

  // Test 1: Landing page imports safeNextPath
  {
    const hasSafeNextPathImport = /import.*safeNextPath.*from.*redirect-origin/i.test(pageContent);
    results.push({
      passed: hasSafeNextPathImport,
      message: hasSafeNextPathImport 
        ? 'Landing page imports safeNextPath'
        : 'Landing page does not import safeNextPath'
    });
  }

  // Test 2: Landing page accepts next in searchParams
  {
    const hasNextParam = /searchParams[\s\S]*?Promise[\s\S]*?\{\s*error[\s\S]*?next/.test(pageContent);
    results.push({
      passed: hasNextParam,
      message: hasNextParam
        ? 'Landing page accepts next parameter in searchParams'
        : 'Landing page does not accept next parameter in searchParams'
    });
  }

  // Test 3: Landing page passes next to SignInButton
  {
    const passesNext = /<SignInButton\s+next=\{next\}\s*\/>/i.test(pageContent);
    results.push({
      passed: passesNext,
      message: passesNext
        ? 'Landing page passes next to SignInButton'
        : 'Landing page does not pass next to SignInButton'
    });
  }

  // Test 4: SignInButton accepts next prop
  {
    const acceptsNext = /function\s+SignInButton\s*\(\s*\{\s*next\s*\}/i.test(signInButtonContent);
    results.push({
      passed: acceptsNext,
      message: acceptsNext
        ? 'SignInButton accepts next prop'
        : 'SignInButton does not accept next prop'
    });
  }

  // Test 5: SignInButton includes next in redirectTo URL
  {
    const includesNext = /const\s+callbackUrl\s*=\s*next[\s\S]*?encodeURIComponent\(next\)/.test(signInButtonContent) ||
                         /redirectTo[\s\S]*?\?\s*next[\s\S]*?encodeURIComponent\(next\)/.test(signInButtonContent);
    results.push({
      passed: includesNext,
      message: includesNext
        ? 'SignInButton includes next in redirectTo with encoding'
        : 'SignInButton does not include next in redirectTo'
    });
  }

  // Test 6: Landing page redirects signed-in users to safe next path
  {
    const redirectsToNext = /if\s*\(\s*next\s*\)[\s\S]*?safeNextPath\(next\)[\s\S]*?redirect/i.test(pageContent);
    results.push({
      passed: redirectsToNext,
      message: redirectsToNext
        ? 'Landing page redirects signed-in users to safe next path'
        : 'Landing page does not redirect signed-in users to next path'
    });
  }

  // Test 7: Landing page maintains existing onboarding vs today routing when no next
  {
    const hasDefaultRouting = /profile\?.onboarding_completed_at[\s\S]*?\?[\s\S]*?\/today[\s\S]*?:[\s\S]*?\/onboarding/.test(pageContent);
    results.push({
      passed: hasDefaultRouting,
      message: hasDefaultRouting
        ? 'Landing page maintains default onboarding vs today routing'
        : 'Landing page changed default routing behavior'
    });
  }

  return results;
}

// Run the tests
console.log('==========================================');
console.log('Testing landing page next parameter handling');
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
  console.log('All landing page next tests passed\n');
  process.exit(0);
} else {
  console.log('Some landing page next tests failed\n');
  process.exit(1);
}
