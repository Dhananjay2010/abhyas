#!/usr/bin/env tsx
/**
 * Behavioral test: Timezone picker options and canonicalization.
 * 
 * QA-confirmed runtime bugs fixed here:
 * 1. Picker options list contains canonical names only, so stored values match
 * 2. saveAboutYou canonicalizes browser timezone input before storing
 * 
 * Tests that for each test case (Asia/Calcutta, Asia/Kolkata, UTC, Etc/UTC, 
 * Asia/Katmandu, Europe/Kiev, America/Buenos_Aires):
 * - The built options contain the canonical value exactly once
 * - The picker's selected value equals the canonical stored value
 * - saveAboutYou normalizes input correctly
 */

import { buildTimezoneOptions } from "../src/lib/timezone-options";
import { canonicalizeTimezone } from "../src/lib/timezone-canonical";
import { validateTimezone } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\nTimezone Picker Canonical Options Test");
console.log("======================================\n");

// Test cases: [input, canonical expected]
const testCases: Array<[string, string]> = [
  ["Asia/Calcutta", "Asia/Kolkata"],
  ["Asia/Kolkata", "Asia/Kolkata"],
  ["UTC", "UTC"],
  ["Etc/UTC", "UTC"],
  ["Asia/Katmandu", "Asia/Kathmandu"],
  ["Europe/Kiev", "Europe/Kyiv"],
  ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
];

console.log("1. Picker options contain canonical values exactly once\n");

for (const [input, expected] of testCases) {
  const options = buildTimezoneOptions(input);
  const count = options.filter((opt) => opt === expected).length;
  const inputInList = options.includes(input);
  const inputIsCanonical = input === expected;
  
  // If input is already canonical, it's OK for it to be in the list
  // If input is non-canonical, it should NOT be in the list (only canonical should be)
  const isCorrect = count === 1 && (inputIsCanonical || !inputInList);
  
  check(
    `${input} → ${expected}`,
    isCorrect,
    isCorrect
      ? inputIsCanonical
        ? "canonical in list once"
        : "canonical in list once, non-canonical not in list"
      : count !== 1
      ? `ERROR: canonical appears ${count} times`
      : `ERROR: non-canonical ${input} also in list`
  );
}

console.log("\n2. Stored value always appears selected (matches an option)\n");

for (const [input, expected] of testCases) {
  const stored = canonicalizeTimezone(input);
  const options = buildTimezoneOptions(stored);
  const isSelectable = stored !== null && options.includes(stored);
  
  check(
    `Stored ${stored} from ${input}`,
    isSelectable,
    isSelectable ? "appears in options" : "ERROR: not in options"
  );
}

console.log("\n3. saveAboutYou timezone normalization\n");

// Test validateTimezone (used by saveAboutYou) correctly canonicalizes
const saveAboutYouTestCases: Array<[string, string | null]> = [
  ["EST", null], // abbreviation → rejected
  ["asia/kolkata", "Asia/Kolkata"], // case-fixed
  ["Etc/GMT+5", null], // offset → rejected
  ["Asia/Calcutta", "Asia/Kolkata"], // alias → canonical
  ["UTC", "UTC"], // already canonical
  ["+05:30", null], // offset → rejected
];

for (const [input, expected] of saveAboutYouTestCases) {
  const result = validateTimezone(input);
  const matches = result === expected;
  
  check(
    `validateTimezone("${input}")`,
    matches,
    matches
      ? `→ ${expected === null ? "null (rejected)" : expected}`
      : `ERROR: got ${result}, expected ${expected}`
  );
}

console.log("\n4. UTC is always present in options\n");

const optionsWithNull = buildTimezoneOptions(null);
const optionsWithKolkata = buildTimezoneOptions("Asia/Kolkata");
const optionsWithCustom = buildTimezoneOptions("Custom/Zone");

check("UTC in options (null stored)", optionsWithNull.includes("UTC"));
check("UTC in options (Asia/Kolkata stored)", optionsWithKolkata.includes("UTC"));
check("UTC in options (Custom/Zone stored)", optionsWithCustom.includes("UTC"));

console.log("\n5. Options list has no duplicates\n");

for (const [input] of testCases) {
  const options = buildTimezoneOptions(input);
  const unique = new Set(options);
  check(
    `No duplicates with ${input} stored`,
    unique.size === options.length,
    unique.size === options.length
      ? `${options.length} unique options`
      : `ERROR: ${options.length} options, ${unique.size} unique`
  );
}

console.log(
  `\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`
);
process.exit(failures === 0 ? 0 : 1);
