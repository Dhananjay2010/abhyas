#!/usr/bin/env npx tsx
/**
 * Pin test that kettlebell-thruster is in CURRENT_KNEE_ONLY_EXCLUDED_SLUGS.
 * Killed by M5 mutant (removing thruster from that list).
 * 
 * WHY THIS TEST IS NEEDED:
 * Decision (a): kettlebell-thruster does NOT have the knee contraindication tag
 * in catalogue.json (only wrist). It's banned for current-knee users via the
 * CURRENT_KNEE_ONLY_EXCLUDED_SLUGS list. This test ensures the list contains
 * the slug, and M5 removes it to verify behavioural tests catch the exclusion.
 */

import { getCurrentKneeOnlyExcludedSlugs } from "../src/lib/program/past-knee";

const currentKneeExcluded = getCurrentKneeOnlyExcludedSlugs();

if (!currentKneeExcluded.has("kettlebell-thruster")) {
  console.error("✗ FAIL: kettlebell-thruster missing from CURRENT_KNEE_ONLY_EXCLUDED_SLUGS");
  console.error("  Current list:", Array.from(currentKneeExcluded));
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster is in CURRENT_KNEE_ONLY_EXCLUDED_SLUGS");
