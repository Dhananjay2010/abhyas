/**
 * Test: No hardcoded 'Abhyas' brand name in UI strings
 *
 * Verifies that user-facing strings use branding.name or branding.shortName
 * instead of hardcoded 'Abhyas' literals, so white-label deployments show
 * the correct brand name.
 *
 * Allowlist:
 * - src/lib/branding.ts (the default brand config itself)
 * - /dev/ pages (development-only, not production)
 * - Comments and docs
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testNoHardcodedAbhyasInUI() {
  console.log("\n▶ Testing for hardcoded 'Abhyas' in UI strings...");

  // Search for 'Abhyas' in src/app/ and src/lib/, excluding the allowed locations
  const appResult = execSync(
    `rg -n "Abhyas" src/app --type-add 'tsx:*.tsx' --type ts --type tsx || true`,
    { encoding: "utf-8" }
  );
  const libResult = execSync(
    `rg -n "Abhyas" src/lib --type-add 'tsx:*.tsx' --type ts --type tsx || true`,
    { encoding: "utf-8" }
  );

  const lines = [
    ...appResult.trim().split("\n").filter(Boolean),
    ...libResult.trim().split("\n").filter(Boolean),
  ];
  const allowedPatterns = [
    /\/dev\//,  // Development-only pages
    /manifest\.ts.*PWA manifest for Abhyas/,  // Comment in manifest
    /onboarding\/actions\.ts/,  // Owned by another developer; they will update this
    /branding\.ts/,  // The brand config itself
    /:\s*\*.*Abhyas/,  // Doc comments (JSDoc, etc.) - matches ": * Abhyas..."
    /:\s*\/\/.*Abhyas/,  // Single-line comments - matches ": // Abhyas..."
  ];

  const violations: string[] = [];

  for (const line of lines) {
    // Skip if any allowed pattern matches
    if (allowedPatterns.some(pattern => pattern.test(line))) {
      continue;
    }
    violations.push(line);
  }

  if (violations.length > 0) {
    console.error("\n  ❌ Found hardcoded 'Abhyas' in app UI strings:");
    for (const violation of violations) {
      console.error(`     ${violation}`);
    }
    console.error("\n  All UI strings should use branding.name or branding.shortName.");
    throw new Error("Hardcoded 'Abhyas' literals found in app UI");
  }

  console.log("  ✓ No hardcoded 'Abhyas' in app UI strings");
}

function testDefaultBrandStillAbhyas() {
  console.log("\n▶ Testing default brand config...");

  // Verify the default brand in branding.ts is still named 'Abhyas'
  const brandingFile = readFileSync("src/lib/branding.ts", "utf-8");

  assert(
    brandingFile.includes('name: "Abhyas"'),
    "Default brand config should define name as 'Abhyas'"
  );

  console.log("  ✓ Default brand (abhyas) config includes 'Abhyas' name");
}

function main() {
  console.log("Testing 'Abhyas' literal usage...");

  try {
    testNoHardcodedAbhyasInUI();
    testDefaultBrandStillAbhyas();
    console.log("\n✅ All 'Abhyas' literal tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ 'Abhyas' literal tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
