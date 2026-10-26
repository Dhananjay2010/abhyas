#!/usr/bin/env npx tsx
/**
 * Test past-knee squat swap list lengths after PR #152 slice-order fix.
 * 
 * Bug: Lists were sliced to 5 BEFORE filtering, so when knee-risk exercises
 * were filtered out, lists ended up with only 2-4 options. Hinges rarely appeared.
 * 
 * Fix: Collect enough candidates (20) for past-knee squat swaps, apply ordering,
 * THEN slice to 5. This ensures we get both quad isolation AND hinge fallbacks.
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Real equipment profiles from seed data
const FULL_GYM = new Set([
  "00000000-0000-4000-8000-000000000001", // barbell
  "00000000-0000-4000-8000-000000000002", // dumbbell
  "00000000-0000-4000-8000-000000000003", // flat_bench
  "00000000-0000-4000-8000-000000000004", // squat_rack
  "00000000-0000-4000-8000-000000000005", // pull_up_bar
  "00000000-0000-4000-8000-000000000006", // cable_machine
  "00000000-0000-4000-8000-000000000009", // leg_extension
  "00000000-0000-4000-8000-00000000000a", // leg_curl
]);

const DUMBBELLS_BENCH = new Set([
  "00000000-0000-4000-8000-000000000002", // dumbbell
  "00000000-0000-4000-8000-000000000003", // flat_bench
]);

const HOME_BODYWEIGHT = new Set<string>([]);

console.log("=== Past-Knee Squat Swap List Lengths ===\n");

type TestCase = {
  name: string;
  current: string;
  equipment: Set<string> | null;
  hasAll: boolean;
};

const testCases: TestCase[] = [
  { name: "Full gym, barbell-squat", current: "barbell-squat", equipment: FULL_GYM, hasAll: true },
  { name: "Full gym, goblet-squat", current: "goblet-squat", equipment: FULL_GYM, hasAll: true },
  { name: "Full gym, box-squat", current: "box-squat", equipment: FULL_GYM, hasAll: true },
  { name: "Dumbbells, goblet-squat", current: "goblet-squat", equipment: DUMBBELLS_BENCH, hasAll: false },
  { name: "Dumbbells, dumbbell-squat", current: "dumbbell-squat", equipment: DUMBBELLS_BENCH, hasAll: false },
  { name: "Home bodyweight, bodyweight-squat", current: "bodyweight-squat", equipment: HOME_BODYWEIGHT, hasAll: false },
  { name: "Home bodyweight, spanish-squat", current: "spanish-squat", equipment: HOME_BODYWEIGHT, hasAll: false },
];

let failures = 0;
const lengthCounts = new Map<number, number>();

for (const tc of testCases) {
  const current = catalogue.find(e => e.slug === tc.current);
  if (!current) {
    console.log(`✗ FAIL: ${tc.name} - current exercise not found`);
    failures++;
    continue;
  }
  
  const ranked = rankAlternatives(current, catalogue, {
    level: "intermediate",
    availableEquipment: tc.equipment,
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 5,
    scoreFn: () => 100,
    tieBreakFn: (slug: string) => {
      // Deterministic hash
      let hash = 0;
      for (let i = 0; i < slug.length; i++) {
        hash = ((hash << 5) - hash) + slug.charCodeAt(i);
        hash = hash & hash;
      }
      return hash;
    },
  });
  
  lengthCounts.set(ranked.length, (lengthCounts.get(ranked.length) || 0) + 1);
  
  // Verify length
  const expectedMaxLength = 5;
  if (ranked.length > expectedMaxLength) {
    console.log(`✗ FAIL: ${tc.name} - length ${ranked.length} > ${expectedMaxLength}`);
    failures++;
  }
  
  // Verify we got a reasonable number of options
  // For full gym, we should get exactly 5 (to catch slice-before-filter bugs)
  // For limited equipment, we should still try to get as many as eligible
  if (tc.hasAll && ranked.length !== 5) {
    console.log(`✗ FAIL: ${tc.name} - got ${ranked.length} options (expected exactly 5 for full gym)`);
    console.log(`  List: ${ranked.map(e => e.slug).join(", ")}`);
    failures++;
  }
  
  // Verify order: quad isolation first, then hinges
  const quadIsolationSlugs = new Set(["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"]);
  let lastQuadIndex = -1;
  let firstHingeIndex = -1;
  
  for (let i = 0; i < ranked.length; i++) {
    if (quadIsolationSlugs.has(ranked[i].slug)) {
      lastQuadIndex = i;
    } else if (ranked[i].movement_pattern === "hinge" && firstHingeIndex === -1) {
      firstHingeIndex = i;
    }
  }
  
  // If we have both quads and hinges, quads should come before hinges (except wall-sit exception)
  if (lastQuadIndex !== -1 && firstHingeIndex !== -1) {
    const quadsBeforeHinges = lastQuadIndex < firstHingeIndex || 
      (ranked[lastQuadIndex].slug === "wall-sit" && lastQuadIndex === firstHingeIndex + 1);
    if (!quadsBeforeHinges) {
      console.log(`✗ FAIL: ${tc.name} - hinges before quads (last quad at ${lastQuadIndex}, first hinge at ${firstHingeIndex})`);
      console.log(`  List: ${ranked.map(e => e.slug).join(", ")}`);
      failures++;
    }
  }
  
  // Verify wall-sit is never first (unless it's the only option)
  if (ranked.length > 1 && ranked[0].slug === "wall-sit") {
    console.log(`✗ FAIL: ${tc.name} - wall-sit is first`);
    console.log(`  List: ${ranked.map(e => e.slug).join(", ")}`);
    failures++;
  }
  
  console.log(`✓ ${tc.name}: ${ranked.length} options - ${ranked.slice(0, 5).map(e => e.slug).join(", ")}`);
}

console.log(`\n=== Length Distribution ===`);
const sortedLengths = Array.from(lengthCounts.entries()).sort((a, b) => a[0] - b[0]);
for (const [len, count] of sortedLengths) {
  const pct = Math.round(count / testCases.length * 100);
  console.log(`Length ${len}: ${count} cases (${pct}%)`);
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "PASSED" : `FAILED: ${failures} failures`}`);
process.exit(failures === 0 ? 0 : 1);
