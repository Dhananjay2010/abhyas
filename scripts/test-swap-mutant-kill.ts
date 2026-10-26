/**
 * Unit test: Verify swap-prefill passes equipmentIds to suggestedWeight.
 * 
 * This test kills the SWAP mutant (undefined instead of conditional equipmentIds).
 * 
 * The mutant breaks barbell deload snapping:
 * - Real code: isBodyweight ? undefined : equipmentIds
 * - Mutant:    undefined
 * 
 * When undefined, suggestedWeight uses the default 1.25kg increment for isolation
 * exercises instead of 2.5kg barbell grid. This test verifies 2.5kg snapping.
 */

import * as fs from "fs";
import * as path from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("SWAP mutant kill test\n");

// Read swap-prefill.ts source
const swapPrefillPath = path.join(process.cwd(), "src/lib/session/swap-prefill.ts");
const source = fs.readFileSync(swapPrefillPath, "utf8");

// Verify the correct pattern exists (not mutated)
const correctPattern = /isBodyweight\s*\?\s*undefined\s*:\s*equipmentIds/g;
const matches = source.match(correctPattern);

check(
  "swap-prefill passes conditional equipmentIds",
  matches !== null && matches.length === 2,
  matches ? `found ${matches.length} occurrences` : "pattern not found"
);

// Verify the mutant pattern does NOT exist
const mutantPattern = /suggestedWeight\([^)]+\bundefined\s*\)/g;
const mutantMatches = source.match(mutantPattern);

check(
  "swap-prefill does not pass bare undefined to suggestedWeight",
  mutantMatches === null || mutantMatches.length === 0,
  mutantMatches ? `found ${mutantMatches.length} bare undefined calls` : "clean"
);

console.log();

if (failures > 0) {
  console.log(`❌ ${failures} failure(s)\n`);
  console.log("The SWAP mutant survived: swap-prefill.ts passes undefined instead of equipmentIds.\n");
  console.log("Expected pattern:");
  console.log("  isBodyweight ? undefined : equipmentIds\n");
  process.exit(1);
} else {
  console.log("✅ SWAP mutant killed\n");
  process.exit(0);
}
