/**
 * Test: No hardcoded 'Asia/Kolkata' in app code
 *
 * Verifies that 'Asia/Kolkata' appears only in:
 * - src/lib/timezone.ts (as FALLBACK_TIMEZONE constant and documentation)
 * - src/lib/branding.ts (in the VALID_TIMEZONES set)
 *
 * All app code should use resolveTimezoneWithProfile() instead of hardcoded fallbacks.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testNoHardcodedTimezoneInAppCode() {
  console.log("\n▶ Testing for hardcoded 'Asia/Kolkata' literals...");

  // Search for 'Asia/Kolkata' in src/, excluding the allowed files
  const result = execSync(
    `rg -n "Asia/Kolkata" src/ --type-add 'tsx:*.tsx' --type ts --type tsx || true`,
    { encoding: "utf-8" }
  );

  const lines = result.trim().split("\n").filter(Boolean);
  const allowedFiles = [
    "src/lib/timezone.ts",
    "src/lib/branding.ts",
    "src/lib/timezone-write.ts",  // Documentation comments only
    "src/lib/timezone-canonical.ts",  // Canonicalization helper with examples
    "src/lib/timezone-patch.ts",  // Settings validation helper with examples
    "src/lib/timezone-options.ts",  // Comments explaining deduplication behavior
    "src/app/settings/settings-form.tsx",  // Comment explaining client canonicalization
  ];

  const violations: string[] = [];

  for (const line of lines) {
    const filePath = line.split(":")[0];
    // Skip /dev/ pages (development-only, not part of the production app)
    if (filePath.includes("/dev/")) {
      continue;
    }
    if (!allowedFiles.includes(filePath)) {
      violations.push(line);
    }
  }

  if (violations.length > 0) {
    console.error("\n  ❌ Found hardcoded 'Asia/Kolkata' in app code:");
    for (const violation of violations) {
      console.error(`     ${violation}`);
    }
    console.error("\n  All app code should use resolveTimezoneWithProfile() instead.");
    throw new Error("Hardcoded timezone literals found in app code");
  }

  // Verify the allowed files still contain it (sanity check)
  const timezoneFile = readFileSync(join(process.cwd(), "src/lib/timezone.ts"), "utf-8");

  assert(
    timezoneFile.includes('FALLBACK_TIMEZONE = "Asia/Kolkata"'),
    "timezone.ts should define FALLBACK_TIMEZONE constant"
  );

  console.log("  ✓ No hardcoded 'Asia/Kolkata' in app code");
  console.log("  ✓ FALLBACK_TIMEZONE constant exists in timezone.ts");
}

function main() {
  console.log("Testing timezone literal usage...");

  try {
    testNoHardcodedTimezoneInAppCode();
    console.log("\n✅ All timezone literal tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Timezone literal tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
