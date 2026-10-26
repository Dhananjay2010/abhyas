#!/usr/bin/env -S npx tsx
/**
 * Verify package.json test chain structure
 * 
 * Checks that:
 * 1. Main's 360 tests are an exact prefix of the current chain
 * 2. All test chain entries have corresponding script definitions
 * 3. No duplicate entries in the chain
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Read current package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// Get main's package.json
const mainPkg = JSON.parse(
  execSync("git show origin/main:package.json", { encoding: "utf8" })
);

// Extract test chains
function extractTestChain(testScript: string): string[] {
  const matches = testScript.match(/npm run test:[^\s&]+/g);
  if (!matches) return [];
  return matches.map(m => m.replace("npm run ", ""));
}

const currentChain = extractTestChain(pkg.scripts.test);
const mainChain = extractTestChain(mainPkg.scripts.test);

console.log(`Main chain: ${mainChain.length} entries`);
console.log(`Current chain: ${currentChain.length} entries`);

let failures = 0;

// Check 1: Main's chain is an exact prefix
console.log("\nChecking main's chain is an exact prefix...");
for (let i = 0; i < mainChain.length; i++) {
  if (currentChain[i] !== mainChain[i]) {
    console.error(`❌ Position ${i}: expected ${mainChain[i]}, got ${currentChain[i]}`);
    failures++;
    if (failures >= 5) {
      console.error("... (stopping after 5 failures)");
      break;
    }
  }
}

if (failures === 0) {
  console.log(`✓ All ${mainChain.length} main entries are an exact prefix`);
}

// Check 2: All entries have script definitions
console.log("\nChecking all entries have script definitions...");
const missingScripts: string[] = [];
for (const entry of currentChain) {
  if (!pkg.scripts[entry]) {
    missingScripts.push(entry);
    console.error(`❌ ${entry} is in chain but not defined in scripts`);
    failures++;
  }
}

if (missingScripts.length === 0) {
  console.log(`✓ All ${currentChain.length} entries are defined`);
}

// Check 3: No duplicates
console.log("\nChecking for duplicates...");
const seen = new Set<string>();
const duplicates: string[] = [];
for (const entry of currentChain) {
  if (seen.has(entry)) {
    duplicates.push(entry);
    console.error(`❌ Duplicate entry: ${entry}`);
    failures++;
  }
  seen.add(entry);
}

if (duplicates.length === 0) {
  console.log(`✓ No duplicates`);
}

// Summary
console.log("\n" + "=".repeat(60));
if (failures > 0) {
  console.error(`❌ FAILED: ${failures} issue(s) found`);
  process.exit(1);
} else {
  console.log(`✅ PASSED: Test chain is valid`);
  console.log(`   Main's ${mainChain.length} entries + ${currentChain.length - mainChain.length} new = ${currentChain.length} total`);
}
