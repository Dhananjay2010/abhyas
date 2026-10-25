#!/usr/bin/env tsx
/**
 * Test: Auth callback next parameter handling and onboarding flow
 * 
 * Verifies that:
 * 1. The callback route uses safeNextPath and getLandingRedirectTarget
 * 2. The callback uses getRedirectOrigin for both success and error paths
 * 3. The callback redirects based on onboarding status (behavioral tests)
 * 4. The callback loads profile to check onboarding_completed_at
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getLandingRedirectTarget } from '../src/lib/auth/sign-in-redirect';
import { safeNextPath } from '../src/lib/safe-next-path';

interface TestResult {
  passed: boolean;
  message: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];
  
  const callbackPath = join(process.cwd(), 'src/app/auth/callback/route.ts');
  const callbackContent = readFileSync(callbackPath, 'utf-8');

  // Test 1: Callback imports required functions
  {
    const hasRedirectOriginImports = /import[\s\S]*?\{[\s\S]*?getRedirectOrigin[\s\S]*?safeNextPath[\s\S]*?\}[\s\S]*?from[\s\S]*?redirect-origin/.test(callbackContent);
    const hasLandingRedirectImport = /import[\s\S]*?\{[\s\S]*?getLandingRedirectTarget[\s\S]*?\}[\s\S]*?from[\s\S]*?sign-in-redirect/.test(callbackContent);
    const passed = hasRedirectOriginImports && hasLandingRedirectImport;
    results.push({
      passed,
      message: passed
        ? 'Callback imports getRedirectOrigin, safeNextPath, and getLandingRedirectTarget'
        : 'Callback missing required imports'
    });
  }

  // Test 2: Callback loads profile onboarding_completed_at
  {
    const loadsProfile = /from\(['"]profiles['"]\)/.test(callbackContent) &&
                        /select\(['"]onboarding_completed_at['"]\)/.test(callbackContent);
    results.push({
      passed: loadsProfile,
      message: loadsProfile
        ? 'Callback loads profile onboarding_completed_at'
        : 'Callback does not load profile onboarding status'
    });
  }

  // Test 3: Callback uses getLandingRedirectTarget with all three parameters
  {
    const usesHelper = /getLandingRedirectTarget\(\s*onboardingCompletedAt[\s\S]*?nextParam[\s\S]*?safeNextPath/.test(callbackContent);
    results.push({
      passed: usesHelper,
      message: usesHelper
        ? 'Callback uses getLandingRedirectTarget(onboardingCompletedAt, nextParam, safeNextPath)'
        : 'Callback does not use getLandingRedirectTarget with correct parameters'
    });
  }

  // Test 4: Callback uses getRedirectOrigin for success redirect
  {
    const usesGetRedirectOrigin = /const\s+base\s*=\s*getRedirectOrigin\(request\)/i.test(callbackContent);
    results.push({
      passed: usesGetRedirectOrigin,
      message: usesGetRedirectOrigin
        ? 'Callback uses getRedirectOrigin for success redirect base'
        : 'Callback does not use getRedirectOrigin'
    });
  }

  // Test 5: Callback success redirects to base + redirectPath
  {
    const redirectsToPath = /NextResponse\.redirect\(`\$\{base\}\$\{redirectPath\}`\)/i.test(callbackContent);
    results.push({
      passed: redirectsToPath,
      message: redirectsToPath
        ? 'Callback success redirects to base + redirectPath (from getLandingRedirectTarget)'
        : 'Callback does not redirect to base + redirectPath'
    });
  }

  // Test 6: Callback error path uses getRedirectOrigin (not raw origin)
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

  // Test 7: Callback does not destructure origin from URL anymore
  {
    const noOriginDestructure = !/const\s*\{[^}]*origin[^}]*\}\s*=\s*new URL\(request\.url\)/i.test(callbackContent);
    results.push({
      passed: noOriginDestructure,
      message: noOriginDestructure
        ? 'Callback does not destructure raw origin'
        : 'Callback still destructures raw origin (should use getRedirectOrigin instead)'
    });
  }

  // ===================================================================
  // Behavioral tests for callback redirect decision logic
  // (These test getLandingRedirectTarget which the callback uses)
  // ===================================================================

  // Test 8: Fresh user + /yoga → /onboarding (doesn't skip onboarding)
  {
    const result = getLandingRedirectTarget(null, '/yoga', safeNextPath);
    results.push({
      passed: result === '/onboarding',
      message: result === '/onboarding'
        ? 'Fresh user (no onboarding_completed_at) + /yoga → /onboarding'
        : `Fresh user + /yoga: expected '/onboarding', got '${result}'`
    });
  }

  // Test 9: Onboarded user + /yoga → /yoga
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', '/yoga', safeNextPath);
    results.push({
      passed: result === '/yoga',
      message: result === '/yoga'
        ? 'Onboarded user + /yoga → /yoga'
        : `Onboarded user + /yoga: expected '/yoga', got '${result}'`
    });
  }

  // Test 10: Onboarded user + //evil → /today (rejects malicious next)
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', '//evil', safeNextPath);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? 'Onboarded user + //evil → /today (malicious next rejected)'
        : `Onboarded user + //evil: expected '/today', got '${result}'`
    });
  }

  // Test 11: Fresh user + /breathe → /onboarding (doesn't skip with breathe)
  {
    const result = getLandingRedirectTarget(null, '/breathe', safeNextPath);
    results.push({
      passed: result === '/onboarding',
      message: result === '/onboarding'
        ? 'Fresh user + /breathe → /onboarding'
        : `Fresh user + /breathe: expected '/onboarding', got '${result}'`
    });
  }

  // Test 12: Onboarded user + no next → /today
  {
    const result = getLandingRedirectTarget('2024-01-01T00:00:00Z', null, safeNextPath);
    results.push({
      passed: result === '/today',
      message: result === '/today'
        ? 'Onboarded user + no next → /today'
        : `Onboarded user + no next: expected '/today', got '${result}'`
    });
  }

  return results;
}

// Run the tests
console.log('=======================================================');
console.log('Testing auth callback next parameter and onboarding flow');
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
  console.log('All callback next and onboarding tests passed\n');
  process.exit(0);
} else {
  console.log('Some callback next or onboarding tests failed\n');
  process.exit(1);
}
