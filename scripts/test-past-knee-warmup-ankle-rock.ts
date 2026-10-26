#!/usr/bin/env -S npx tsx
/**
 * Test: Past-knee Lower warmup selects ankle-rock from production warmup.ts
 * 
 * Requirements:
 * - For past-knee users on Lower days, ankle-rock must be in the kneeSafeLowerDrills list (warmup.ts:157)
 * - It must be in fallbacks (warmup.ts:218)
 * - The test must assert the exact list that differs from main
 * - Test must fail when ankle-rock is removed from those lists
 * 
 * Strategy:
 * - Use input where main (without ankle-rock) gives [leg-swing-front, glute-bridge, leg-swing-side, hip-circles]
 * - PR with ankle-rock gives [ankle-rock, glute-bridge, leg-swing-front, hip-circles]
 * - Assert the exact PR list
 */

import { readFileSync, existsSync } from "node:fs";
import { selectWarmup, type WarmupRow } from "../src/lib/program/warmup";
import type { Database } from "../src/lib/database.types";

type Muscle = Database["public"]["Enums"]["muscle"];

const warmupsPath = "scripts/fixtures/warmups.json";
if (!existsSync(warmupsPath)) {
  console.error(`FATAL: ${warmupsPath} does not exist - warmup tests cannot run`);
  process.exit(1);
}
const warmups: WarmupRow[] = JSON.parse(readFileSync(warmupsPath, "utf8"));

console.log("Testing past-knee Lower warmup for ankle-rock...\n");

// Input that differs from main: quads+glutes+hamstrings, weights, all equipment, prehab knee
// Main gives: [leg-swing-front, glute-bridge, leg-swing-side, hip-circles]
// PR gives: [ankle-rock, glute-bridge, leg-swing-front, hip-circles]
const muscles: Muscle[] = ["quads", "glutes", "hamstrings"];

const warmup = selectWarmup({
  warmups,
  trainingMuscles: muscles,
  injuryRegions: [],
  prehabRegions: ["knee"],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const mobilityDrills = warmup.filter(w => w.phase === "mobility");
const mobilitySlugs = mobilityDrills.map(d => d.slug);

console.log(`Input: quads+glutes+hamstrings, prehab knee, all equipment`);
console.log(`Mobility drills: [${mobilitySlugs.join(", ")}]`);
console.log("");

// Assert the exact PR list (with ankle-rock from warmup.ts:157)
const expectedPRList = ["ankle-rock", "glute-bridge", "leg-swing-front", "hip-circles"];
const actualList = JSON.stringify(mobilitySlugs);
const expectedList = JSON.stringify(expectedPRList);

if (actualList !== expectedList) {
  console.error(`❌ FAILED: Expected ${expectedList}`);
  console.error(`           Got      ${actualList}`);
  process.exit(1);
}

console.log(`✅ PASSED: ankle-rock is selected from production warmup.ts`);
console.log(`           Expected (PR): ${expectedList}`);
console.log(`           Actual:        ${actualList}`);

// Verify ankle-rock is actually in the list
if (!mobilitySlugs.includes("ankle-rock")) {
  console.error(`\n❌ FAILED: ankle-rock not found in mobility drills`);
  console.error(`This suggests ankle-rock was removed from warmup.ts:157 or :218`);
  process.exit(1);
}

console.log(`\n✅ PASSED: ankle-rock is accessible from production warmup.ts`);
