#!/usr/bin/env tsx
/**
 * Test: Session length validation
 * 
 * Run: npm run test:session-length-validation
 */

import { SESSION_LENGTH_OPTIONS, isAllowedSessionLength } from "../src/lib/onboarding/session-length";

export {};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${(e as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Display available options
console.log(`Session length options: ${SESSION_LENGTH_OPTIONS.join(", ")}`);

SESSION_LENGTH_OPTIONS.forEach((minutes) => {
  test(`${minutes} minutes is valid`, () => {
    assert(isAllowedSessionLength(minutes), `${minutes} should be valid`);
  });
});

// Test invalid values
const invalidValues = [0, -5, 1000, 20, 90];
invalidValues.forEach((value) => {
  test(`${value} is invalid`, () => {
    assert(!isAllowedSessionLength(value), `${value} should be invalid`);
  });
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
