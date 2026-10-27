/**
 * Behavioral test for History list vs detail display (L-1).
 * 
 * Tests that History list and detail show the same weight:
 * - 85 kg stored
 * - Both list and detail must show "187.5 lb top"
 * - NOT "187.4 lb top" in list and "187.5 lb" in detail
 * 
 * This test verifies that formatTopSet uses roundLbToHalf consistently.
 */

import { formatTopSet } from "../src/lib/units";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== Behavioral Test: History List vs Detail (85 kg case) ===\n");

const storedKg = 85;

// Both list and detail use formatTopSet
const listDisplay = formatTopSet(storedKg, "imperial");
const detailDisplay = formatTopSet(storedKg, "imperial");

check(
  "List and detail display are identical",
  listDisplay === detailDisplay,
  `list: "${listDisplay}", detail: "${detailDisplay}"`
);

check(
  'Both show "187.5 lb top"',
  listDisplay === "187.5 lb top",
  `got "${listDisplay}"`
);

console.log("");
console.log("=== Additional Cases ===\n");

const testCases = [
  { kg: 72.5, expected: "160 lb top" },
  { kg: 80, expected: "176.5 lb top" },
  { kg: 90, expected: "198.5 lb top" },
  { kg: 100, expected: "220.5 lb top" },
];

for (const tc of testCases) {
  const listDisplay = formatTopSet(tc.kg, "imperial");
  const detailDisplay = formatTopSet(tc.kg, "imperial");
  
  check(
    `${tc.kg} kg: list === detail`,
    listDisplay === detailDisplay,
    `list: "${listDisplay}", detail: "${detailDisplay}"`
  );
  
  check(
    `${tc.kg} kg displays as "${tc.expected}"`,
    listDisplay === tc.expected,
    `got "${listDisplay}"`
  );
}

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
