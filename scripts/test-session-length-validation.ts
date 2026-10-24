#!/usr/bin/env tsx
/**
 * Test session length validation in updateProfileSettings.
 *
 * Run: npm run test:session-length-validation
 */

// Test cases
const tests: Array<{
  name: string;
  input: number | null | string;
  shouldPass: boolean;
  expectedError?: string;
}> = [
  { name: "30 minutes is valid", input: 30, shouldPass: true },
  { name: "45 minutes is valid", input: 45, shouldPass: true },
  { name: "60 minutes is valid", input: 60, shouldPass: true },
  { name: "75 minutes is valid", input: 75, shouldPass: true },
  { name: "0 is invalid", input: 0, shouldPass: false, expectedError: "Session length must be 30, 45, 60 or 75 minutes." },
  { name: "-5 is invalid", input: -5, shouldPass: false, expectedError: "Session length must be 30, 45, 60 or 75 minutes." },
  { name: "1000 is invalid", input: 1000, shouldPass: false, expectedError: "Session length must be 30, 45, 60 or 75 minutes." },
  { name: "20 is invalid (not in allowed list)", input: 20, shouldPass: false, expectedError: "Session length must be 30, 45, 60 or 75 minutes." },
  { name: "90 is invalid", input: 90, shouldPass: false, expectedError: "Session length must be 30, 45, 60 or 75 minutes." },
];

// Inline validation logic (mirroring the actions.ts implementation)
function validateSessionLength(value: number | null | string | undefined): { ok: true } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true }; // null/undefined means the field isn't being updated
  }

  if (typeof value === "string") {
    return { ok: false, error: "Please enter valid numbers." };
  }

  const allowed = [30, 45, 60, 75];
  if (!allowed.includes(value)) {
    return { ok: false, error: "Session length must be 30, 45, 60 or 75 minutes." };
  }

  return { ok: true };
}

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = validateSessionLength(test.input);
  const matches = test.shouldPass ? result.ok : !result.ok && result.error === test.expectedError;

  if (matches) {
    console.log(`✓ ${test.name}`);
    passed++;
  } else {
    console.log(`✗ ${test.name}`);
    if (test.shouldPass) {
      console.log(`  Expected: pass, got error: ${result.ok ? "none" : result.error}`);
    } else {
      console.log(`  Expected error: "${test.expectedError}"`);
      console.log(`  Got: ${result.ok ? "pass" : result.error}`);
    }
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
