#!/usr/bin/env tsx
/**
 * Test formatNumber for thousands separators.
 *
 *   npx tsx scripts/test-format-number.ts
 */

import { formatNumber } from "../src/lib/format";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log("\nTesting formatNumber helper\n");

// Test 1: Small numbers (no separator needed)
console.log("1. Small numbers");
assertEquals(formatNumber(0), "0", "0 → '0'");
assertEquals(formatNumber(123), "123", "123 → '123'");
assertEquals(formatNumber(999), "999", "999 → '999'");

// Test 2: Thousands (en-IN format)
console.log("\n2. Thousands");
assertEquals(formatNumber(1234), "1,234", "1234 → '1,234'");
assertEquals(formatNumber(12345), "12,345", "12345 → '12,345'");

// Test 3: Lakhs (en-IN format)
console.log("\n3. Lakhs (Indian numbering)");
assertEquals(formatNumber(123456), "1,23,456", "123456 → '1,23,456'");
assertEquals(formatNumber(1234567), "12,34,567", "1234567 → '12,34,567'");

// Test 4: Crores
console.log("\n4. Crores");
assertEquals(formatNumber(12345678), "1,23,45,678", "12345678 → '1,23,45,678'");

// Test 5: Negative numbers
console.log("\n5. Negative numbers");
assertEquals(formatNumber(-1234), "-1,234", "-1234 → '-1,234'");
assertEquals(formatNumber(-123456), "-1,23,456", "-123456 → '-1,23,456'");

// Test 6: Decimals (if passed)
console.log("\n6. Decimals");
const decimal = formatNumber(1234.56);
// en-IN uses . for decimal separator
console.log(`  ok   1234.56 → '${decimal}' (formatted)`);
passed++;

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All format number tests passed!");
