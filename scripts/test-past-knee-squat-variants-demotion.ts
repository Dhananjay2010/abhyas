#!/usr/bin/env tsx
/**
 * Step 6: Squat variant demotion test for past-knee swap ranking.
 * 
 * Verifies that wide-stance-barbell-squat, jefferson-squats, and barbell-squat-to-a-bench
 * are demoted in past-knee squat swap ranking using kneeFriendlyBonus.
 * 
 * These variants should rank below goblet-squat and box-squat in swap suggestions.
 */

import { kneeFriendlyBonus } from "../src/lib/program/past-knee";
import catalogue from "./fixtures/catalogue.json";
import type { CandidateExercise } from "../src/lib/program/generate";

const exercises = catalogue as unknown as CandidateExercise[];
const bySlug = new Map(exercises.map(e => [e.slug, e]));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("Testing past-knee squat variant demotion...\n");

// The three variants that should be demoted
const demotedSlugs = ["wide-stance-barbell-squat", "jefferson-squats", "barbell-squat-to-a-bench"];

// Preferred alternatives that should rank higher
const preferredSlugs = ["goblet-squat", "box-squat"];

console.log("1. Verify demoted variants receive penalty in primary slots (slot 0-1)");
for (const slug of demotedSlugs) {
  const ex = bySlug.get(slug);
  if (!ex) {
    check(`${slug} exists in catalogue`, false);
    continue;
  }
  
  // Slot 0 and 1 are primary slots
  for (const slotIndex of [0, 1]) {
    const bonus = kneeFriendlyBonus(ex, slotIndex, true);
    check(
      `${slug} at slot ${slotIndex} gets penalty (bonus < 0)`,
      bonus < 0,
      `got bonus=${bonus}`
    );
  }
}

console.log("\n2. Verify preferred variants receive bonus in primary slots (slot 0-1)");
for (const slug of preferredSlugs) {
  const ex = bySlug.get(slug);
  if (!ex) {
    check(`${slug} exists in catalogue`, false);
    continue;
  }
  
  // Slot 0 and 1 are primary slots
  for (const slotIndex of [0, 1]) {
    const bonus = kneeFriendlyBonus(ex, slotIndex, true);
    check(
      `${slug} at slot ${slotIndex} gets bonus (bonus > 0)`,
      bonus > 0,
      `got bonus=${bonus}`
    );
  }
}

console.log("\n3. Verify relative ranking: preferred > demoted");
// Get a representative slot (slot 0)
const slotIndex = 0;

for (const preferredSlug of preferredSlugs) {
  const preferredEx = bySlug.get(preferredSlug);
  if (!preferredEx) continue;
  
  const preferredBonus = kneeFriendlyBonus(preferredEx, slotIndex, true);
  
  for (const demotedSlug of demotedSlugs) {
    const demotedEx = bySlug.get(demotedSlug);
    if (!demotedEx) continue;
    
    const demotedBonus = kneeFriendlyBonus(demotedEx, slotIndex, true);
    
    check(
      `${preferredSlug} (bonus=${preferredBonus}) ranks above ${demotedSlug} (bonus=${demotedBonus})`,
      preferredBonus > demotedBonus
    );
  }
}

console.log("\n4. Verify demoted variants get NO penalty without past-knee flag");
for (const slug of demotedSlugs) {
  const ex = bySlug.get(slug);
  if (!ex) continue;
  
  const bonusNoPastKnee = kneeFriendlyBonus(ex, 0, false);
  check(
    `${slug} without past-knee flag gets no penalty`,
    bonusNoPastKnee === 0,
    `got bonus=${bonusNoPastKnee}`
  );
}

console.log("\n5. Verify demoted variants get NO penalty in accessory slots (slot 4+)");
for (const slug of demotedSlugs) {
  const ex = bySlug.get(slug);
  if (!ex) continue;
  
  const bonusAccessory = kneeFriendlyBonus(ex, 4, true);
  check(
    `${slug} in accessory slot (4) gets no penalty`,
    bonusAccessory === 0,
    `got bonus=${bonusAccessory}`
  );
}

console.log("\n=== Summary ===");
if (failures > 0) {
  console.log(`❌ ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("✅ All checks passed");
}
