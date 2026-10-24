#!/usr/bin/env tsx
/**
 * Test: Session runner expired-session text (L1)
 * 
 * Tests that the session runner shows a friendly message when session expires,
 * not the raw "SESSION_EXPIRED: ..." text.
 * 
 * Minimal test scope: only checks the displayed error text.
 */

import './helpers/setup-jsdom';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';

interface TestResult {
  passed: boolean;
  message: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: isSessionExpired detects SESSION_EXPIRED error thrown as Error
  {
    const { isSessionExpired } = await import('../src/lib/auth/session-expired');
    
    const sessionError = new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
    const regularError = new Error("Network error");
    const nonError = { ok: false, error: "Something failed" };

    if (!isSessionExpired(sessionError)) {
      results.push({
        passed: false,
        message: 'Test 1a: FAILED - isSessionExpired did not detect SESSION_EXPIRED Error'
      });
    } else if (isSessionExpired(regularError)) {
      results.push({
        passed: false,
        message: 'Test 1b: FAILED - isSessionExpired false positive on regular error'
      });
    } else if (isSessionExpired(nonError)) {
      results.push({
        passed: false,
        message: 'Test 1c: FAILED - isSessionExpired false positive on non-Error object'
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 1: PASSED - isSessionExpired correctly detects session expired errors'
      });
    }
  }

  // Test 2: Runner error display uses friendly message for session expired
  {
    // Read the session-runner source to verify it handles session expired errors
    const fs = await import('fs');
    const path = await import('path');
    const runnerPath = path.join(process.cwd(), 'src/app/session/[id]/session-runner.tsx');
    const runnerSource = fs.readFileSync(runnerPath, 'utf-8');

    // Check that isSessionExpired is imported
    const hasImport = /import.*isSessionExpired.*from.*session-expired/.test(runnerSource);
    
    // Check that the catch block uses isSessionExpired
    const hasCheck = /isSessionExpired\(err\)/.test(runnerSource);
    
    // Check that it sets a friendly message
    const hasFriendlyMessage = /Your session has expired, please sign in again/.test(runnerSource);
    
    // Check that it doesn't just pass through the raw error message when session expired
    const catchBlock = runnerSource.match(/catch \(err\)\s*\{[\s\S]*?(?=finally|$)/);
    const hasConditional = catchBlock && /if\s*\(\s*isSessionExpired\(err\)/.test(catchBlock[0]);

    if (!hasImport) {
      results.push({
        passed: false,
        message: 'Test 2: FAILED - session-runner does not import isSessionExpired'
      });
    } else if (!hasCheck) {
      results.push({
        passed: false,
        message: 'Test 2: FAILED - session-runner does not check isSessionExpired(err)'
      });
    } else if (!hasFriendlyMessage) {
      results.push({
        passed: false,
        message: 'Test 2: FAILED - session-runner does not show friendly message'
      });
    } else if (!hasConditional) {
      results.push({
        passed: false,
        message: 'Test 2: FAILED - session-runner does not conditionally handle expired errors'
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 2: PASSED - session-runner shows friendly message for expired sessions'
      });
    }
  }

  return results;
}

runTests()
  .then((results) => {
    console.log('\n=== Session Runner Expired Text Tests (L1) ===\n');
    
    let passed = 0;
    let failed = 0;

    for (const result of results) {
      if (result.passed) {
        passed++;
        console.log(`✓ ${result.message}`);
      } else {
        failed++;
        console.log(`✗ ${result.message}`);
      }
    }

    console.log(`\nTotal: ${results.length}, Passed: ${passed}, Failed: ${failed}\n`);

    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n✗ Test suite crashed:', error);
    process.exit(1);
  });
