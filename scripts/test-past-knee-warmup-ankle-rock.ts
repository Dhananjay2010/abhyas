#!/usr/bin/env -S npx tsx
/**
 * Test: Past-knee Lower warmup can select ankle-rock from production warmup.ts
 * 
 * Requirements:
 * - For past-knee users on Lower days with excluded drills, the replacement pool
 *   can include ankle-rock from the kneeSafeLowerDrills list in warmup.ts:157
 * - Fallback logic at warmup.ts:218 also includes ankle-rock
 * 
 * Strategy:
 * - Call selectWarmup with past-knee Lower muscle groups
 * - Check that ankle-rock can appear in the warmup mobility drills
 */

import { readFileSync, existsSync } from "node:fs";
import { selectWarmup, type WarmupRow } from "../src/lib/program/warmup";

const warmupsPath = "scripts/fixtures/warmups.json";
if (!existsSync(warmupsPath)) {
  console.error(`FATAL: ${warmupsPath} does not exist - warmup tests cannot run`);
  process.exit(1);
}
const warmups = JSON.parse(readFileSync(warmupsPath, "utf8")) as WarmupRow[];

console.log("Testing past-knee Lower warmup for ankle-rock...\n");

// Try multiple muscle combinations common on Lower days
const lowerMuscleGroups = [
  ["quads", "glutes", "hamstrings", "calves"],
  ["quads", "glutes", "hamstrings"],
  ["quads", "calves"],
  ["quads", "lower_back", "calves", "abs"],
];

let foundAnkleRock = false;

for (const muscles of lowerMuscleGroups) {
  const warmup = selectWarmup({
    warmups,
    trainingMuscles: muscles,
    injuryRegions: [],
    prehabRegions: ["knee"], // Past knee
    track: "weights",
    hasAllEquipment: true,
    availableEquipment: null,
  });
  
  const mobilityDrills = warmup.filter(w => w.phase === "mobility");
  const hasAnkleRock = mobilityDrills.some(d => d.slug === "ankle-rock");
  
  if (hasAnkleRock) {
    foundAnkleRock = true;
    console.log(`✅ Found ankle-rock for ${muscles.join(", ")}`);
    console.log(`Mobility drills:`);
    mobilityDrills.forEach(d => {
      console.log(`  - ${d.slug} (${d.duration_seconds}s)`);
    });
    break;
  }
}

if (!foundAnkleRock) {
  console.error("❌ FAILED: ankle-rock not found in any past-knee Lower warmup");
  console.error("This suggests ankle-rock is not in the production warmup.ts lists");
  process.exit(1);
}

console.log("\n✅ PASSED: ankle-rock is accessible from production warmup.ts");
