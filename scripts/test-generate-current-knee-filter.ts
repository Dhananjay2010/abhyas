#!/usr/bin/env npx tsx
/**
 * Test that generate.ts:828 has the current-knee filter.
 * This is the mutant-killer for M9.
 */

import { readFileSync } from "fs";

const generateTs = readFileSync("src/lib/program/generate.ts", "utf-8");

const requiredLine = '.filter((item) => !(hasCurrentKnee && (isExcludedForPastKnee(item.e) || isExcludedForCurrentKneeOnly(item.e))));';

if (!generateTs.includes(requiredLine)) {
  console.error("✗ FAIL: generate.ts:828 missing current-knee filter");
  process.exit(1);
}

console.log("✓ PASS: generate.ts:828 has current-knee filter");
