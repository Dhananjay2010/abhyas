/**
 * Test that Today page wires StrengthDoneBanner correctly.
 * 
 * Verifies that page.tsx:
 * 1. Renders StrengthDoneBanner component
 * 2. Passes endedEarlySummary?.endedEarly to the component
 * 3. Does not hardcode endedEarly={false}
 * 
 * Run: npx tsx scripts/test-today-ended-early-page-wiring.ts
 */

import fs from "fs";
import path from "path";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test Today page wiring of StrengthDoneBanner\n");

// Read page.tsx
const pagePath = path.join(__dirname, "../src/app/today/page.tsx");
const pageContent = fs.readFileSync(pagePath, "utf-8");

// Check 1: Uses StrengthDoneBanner component
check(
  "Renders StrengthDoneBanner",
  pageContent.includes("<StrengthDoneBanner") || pageContent.includes("StrengthDoneBanner({")
);

// Check 2: Passes endedEarlySummary?.endedEarly
const hasCorrectProp = pageContent.includes("endedEarly={endedEarlySummary?.endedEarly");
check(
  "Passes endedEarlySummary?.endedEarly prop",
  hasCorrectProp,
  hasCorrectProp ? "" : "page.tsx should pass endedEarly={endedEarlySummary?.endedEarly ?? false}"
);

// Check 3: Does not hardcode endedEarly={false}
const hardcodesFalse = /endedEarly=\{false\}/.test(pageContent);
check(
  "Does not hardcode endedEarly={false}",
  !hardcodesFalse,
  hardcodesFalse ? "Found hardcoded endedEarly={false}" : ""
);

// Check 4: Passes workingSets and plannedSets from summary
check(
  "Passes workingSets from summary",
  pageContent.includes("workingSets={endedEarlySummary?.workingSets")
);

check(
  "Passes plannedSets from summary",
  pageContent.includes("plannedSets={endedEarlySummary?.plannedSets")
);

console.log("\n✅ All page wiring tests passed\n");
