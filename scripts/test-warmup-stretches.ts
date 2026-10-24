#!/usr/bin/env tsx
/**
 * Test that all warmup exercises with type 'stretch' are actually static stretches,
 * not dynamic mobility flows.
 * 
 * Dynamic movements like Cat-Cow should be type 'mobility', not 'stretch'.
 */

import warmups from "./fixtures/warmups.json" assert { type: "json" };

// Known dynamic movements that should NOT be type 'stretch'
const DYNAMIC_MOVEMENTS = [
  "cat-cow",
  "cat-cow-stretch",  // After our fix, this should be 'mobility'
  "flow",
  "circles",
  "swings",
  "rocks",
  "rotations"
];

const violations: Array<{ slug: string; name: string; reason: string }> = [];

for (const warmup of warmups) {
  if (warmup.type !== "stretch") {
    continue; // Only checking stretches
  }
  
  // Check if the slug or name indicates it's a dynamic movement
  const isDynamic = DYNAMIC_MOVEMENTS.some(
    (keyword) =>
      warmup.slug.includes(keyword) ||
      warmup.name.toLowerCase().includes(keyword)
  );
  
  if (isDynamic) {
    violations.push({
      slug: warmup.slug,
      name: warmup.name,
      reason: `Dynamic movement labeled as 'stretch'`
    });
    continue;
  }
  
  // Check instructions for dynamic cues
  const instructions = warmup.instructions.join(" ").toLowerCase();
  const dynamicCues = [
    "move between",
    "move slowly between",
    "circles",
    "rotations",
    "rock",
    "swing",
    "flow",
    "repeat"
  ];
  
  const hasDynamicInstructions = dynamicCues.some((cue) => 
    instructions.includes(cue)
  );
  
  if (hasDynamicInstructions) {
    violations.push({
      slug: warmup.slug,
      name: warmup.name,
      reason: `Instructions suggest dynamic movement, not static stretch`
    });
  }
}

if (violations.length > 0) {
  console.error(`❌ Found ${violations.length} warmup stretches that appear to be dynamic:\n`);
  
  for (const violation of violations) {
    console.error(`  ${violation.slug} (${violation.name})`);
    console.error(`    ${violation.reason}`);
    console.error();
  }
  
  process.exit(1);
}

console.log("✅ All warmup stretches are static (no dynamic movements)!");
process.exit(0);
