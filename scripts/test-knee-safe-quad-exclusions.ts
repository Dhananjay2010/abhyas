/**
 * Knee-Safe Quad Exclusions Static Test (PR #73 Run 18)
 * 
 * Verifies that KNEE_SAFE_QUAD_EXERCISES and PAST_KNEE_LUNGE_EXERCISES
 * do not overlap with EXCLUDED_EXERCISE_SLUGS.
 * 
 * If an exercise is knee-safe, it must not be in the exclusion list.
 */

import { readFileSync } from "node:fs";

// Read the generate.ts file to extract the constants
const generateTs = readFileSync("src/lib/program/generate.ts", "utf8");

// Extract KNEE_SAFE_QUAD_EXERCISES
const kneeSafeMatch = generateTs.match(/export const KNEE_SAFE_QUAD_EXERCISES[^=]+=\s*new Set\(\[([\s\S]*?)\]\);/);
if (!kneeSafeMatch) {
  console.log("✗ Could not find KNEE_SAFE_QUAD_EXERCISES");
  process.exit(1);
}
const kneeSafeSlugs = kneeSafeMatch[1]
  .split(",")
  .map(s => s.trim().replace(/['"]/g, ""))
  .filter(s => s.length > 0);

// Extract PAST_KNEE_LUNGE_EXERCISES
const pastKneeMatch = generateTs.match(/export const PAST_KNEE_LUNGE_EXERCISES[^=]+=\s*new Set\(\[([\s\S]*?)\]\);/);
if (!pastKneeMatch) {
  console.log("✗ Could not find PAST_KNEE_LUNGE_EXERCISES");
  process.exit(1);
}
const pastKneeSlugs = pastKneeMatch[1]
  .split(",")
  .map(s => s.trim().replace(/['"]/g, ""))
  .filter(s => s.length > 0);

// Read exclusions.ts to extract EXCLUDED_EXERCISE_SLUGS
const exclusionsTs = readFileSync("src/lib/program/exclusions.ts", "utf8");
const excludedMatch = exclusionsTs.match(/export const EXCLUDED_EXERCISE_SLUGS[^=]+=\s*new Set\(\[([\s\S]*?)\]\);/);
if (!excludedMatch) {
  console.log("✗ Could not find EXCLUDED_EXERCISE_SLUGS");
  process.exit(1);
}
const excludedSlugs = excludedMatch[1]
  .split(",")
  .map(s => s.trim().replace(/['"]/g, ""))
  .filter(s => s.length > 0);

console.log("Knee-Safe Quad Exclusions Static Test");
console.log("─".repeat(60));

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Check KNEE_SAFE_QUAD_EXERCISES intersection
const kneeSafeExcluded = kneeSafeSlugs.filter(s => excludedSlugs.includes(s));
check(
  "KNEE_SAFE_QUAD_EXERCISES ∩ EXCLUDED_EXERCISE_SLUGS = ∅",
  kneeSafeExcluded.length === 0,
  kneeSafeExcluded.length > 0 ? `Found: ${kneeSafeExcluded.join(", ")}` : undefined
);

// Check PAST_KNEE_LUNGE_EXERCISES intersection
const pastKneeExcluded = pastKneeSlugs.filter(s => excludedSlugs.includes(s));
check(
  "PAST_KNEE_LUNGE_EXERCISES ∩ EXCLUDED_EXERCISE_SLUGS = ∅",
  pastKneeExcluded.length === 0,
  pastKneeExcluded.length > 0 ? `Found: ${pastKneeExcluded.join(", ")}` : undefined
);

console.log(`\n${failed === 0 ? "✓ All tests passed!" : `✗ ${failed} test(s) failed`}`);
process.exit(failed > 0 ? 1 : 0);
