#!/usr/bin/env tsx
/**
 * Test: Landing page and SignInButton use redirect helpers
 * 
 * Verifies that the landing page and SignInButton use the helper functions
 * for consistent redirect behavior. The helpers' behavior is tested separately
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
  
  const pagePath = join(process.cwd(), 'src/app/page.tsx');
  const pageContent = readFileSync(pagePath, 'utf-8');
  
  const signInButtonPath = join(process.cwd(), 'src/app/sign-in-button.tsx');
  const signInButtonContent = readFileSync(signInButtonPath, 'utf-8');

  // Test 1: Landing page imports getLandingRedirectTarget
  {
    const importsHelper = /import[\s\S]*?getLandingRedirectTarget[\s\S]*?from[\s\S]*?sign-in-redirect/.test(pageContent);
    results.push({
      passed: importsHelper,
      message: importsHelper 
        ? 'Landing page imports getLandingRedirectTarget helper'
        : 'Landing page does not import getLandingRedirectTarget'
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

  // Test 5: SignInButton uses buildOAuthRedirectUrl helper
  {
    const usesHelper = /buildOAuthRedirectUrl[\s\S]*?window\.location\.origin[\s\S]*?next[\s\S]*?safeNextPath/.test(signInButtonContent);
    results.push({
      passed: usesHelper,
      message: usesHelper
        ? 'SignInButton uses buildOAuthRedirectUrl helper with client-side validation'
        : 'SignInButton does not use buildOAuthRedirectUrl helper'
    });
  }

  // Test 6: SignInButton imports from safe-next-path
  {
    const importsFromSafe = /import[\s\S]*?safeNextPath[\s\S]*?from[\s\S]*?safe-next-path/.test(signInButtonContent);
    results.push({
      passed: importsFromSafe,
      message: importsFromSafe
        ? 'SignInButton imports safeNextPath from safe-next-path module'
        : 'SignInButton does not import from safe-next-path'
    });
  }

  // Test 7: Landing page checks onboarding_completed_at
  {
    const checksOnboarding = /profile\?.onboarding_completed_at/.test(pageContent);
    results.push({
      passed: checksOnboarding,
      message: checksOnboarding
        ? 'Landing page checks onboarding_completed_at'
        : 'Landing page does not check onboarding_completed_at'
    });
  }

  // Test 8: Landing page uses getLandingRedirectTarget
  {
    const usesHelper = /getLandingRedirectTarget\([\s\S]*?profile\?.onboarding_completed_at[\s\S]*?next[\s\S]*?safeNextPath/.test(pageContent);
    results.push({
      passed: usesHelper,
      message: usesHelper
        ? 'Landing page uses getLandingRedirectTarget with onboarding check'
        : 'Landing page does not use getLandingRedirectTarget'
    });
  }

  // Test 9: Landing page redirects to helper result
  {
    const redirectsToTarget = /const\s+target\s*=\s*getLandingRedirectTarget[\s\S]*?redirect\(target\)/.test(pageContent);
    results.push({
      passed: redirectsToTarget,
      message: redirectsToTarget
        ? 'Landing page redirects to helper result'
        : 'Landing page does not redirect to helper result'
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
