/**
 * Sissy Squat Ban Test (PR #73 Run 20)
 * 
 * Verifies that weighted-sissy-squat is excluded from plans AND swap lists
 * for ANY knee injury (current or past).
 * 
 * The explicit ban at generate.ts:570 is ESSENTIAL for past-knee injuries because:
 * - isEligible() only filters contraindications against currentInjuryRegions
 * - For past-knee (anyKneeInjury=true, currentInjuryRegions=[]), line 570 is
 *   the ONLY barrier preventing weighted-sissy-squat from appearing in swaps
 * - With the guard disabled, sissy variants appear in past-knee swap lists
 */

import { readFileSync } from "node:fs";
import {
  generateProgram,
  isEligible,
  type GeneratorInput,
  type CandidateExercise,
} from "../src/lib/program/generate";
import { buildSwapContext } from "../src/lib/program/swap-context";
import { rankAlternatives, buildPatternList } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

if (!Array.isArray(catalogue) || catalogue.length === 0) {
  console.error("❌ FATAL: catalogue.json is empty or invalid");
  process.exit(1);
}

console.log("Sissy Squat Ban Test (PR #73 Run 20)");
console.log("─".repeat(60));

let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const byId = new Map(catalogue.map((e) => [e.id, e]));
const sissy = catalogue.find((e) => e.slug.includes("sissy"));

if (!sissy) {
  console.error("❌ FATAL: No sissy exercise found in catalogue");
  process.exit(1);
}

console.log(`Testing sissy exercise: ${sissy.slug} (id=${sissy.id})`);
console.log(
  `  contraindicated_regions: ${JSON.stringify(sissy.contraindicated_regions)}`
);
console.log("");

// Test comprehensive grid: past-knee AND current-knee across equipment/days/minutes
const testProfiles: GeneratorInput[] = [];

for (const current of [true, false]) {
  for (const hasAll of [true, false]) {
    for (const days of [3, 5]) {
      for (const minutes of [60, 75]) {
        testProfiles.push({
          userId: `test-${current ? "current" : "past"}-${hasAll ? "all" : "limited"}-${days}d-${minutes}m`,
          blockNumber: 1,
          goal: "muscle_gain",
          level: "expert",
          primaryTrack: "weights",
          daysPerWeek: days,
          yogaDaysPerWeek: 0,
          age: 30,
          bmi: 22,
          hasAllEquipment: hasAll,
          equipmentIds: hasAll ? [] : ["dumbbell", "flat_bench"],
          currentInjuryRegions: current ? ["knee"] : [],
          anyKneeInjury: true,
          preferredSessionMinutes: minutes,
          catalogue,
        });
      }
    }
  }
}

console.log(`Testing ${testProfiles.length} profiles (current/past × equipment × days × minutes):`);
console.log("");

// Test 0: isEligible should reject sissy for past-knee (kills generate.ts:570 mutant)
console.log("Testing isEligible (direct API):");
{
  const pastKneeInput: GeneratorInput = {
    userId: "test-past-knee-eligible",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "expert",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],  // Past-knee: no current injuries
    anyKneeInjury: true,       // Past-knee: anyKneeInjury = true
    preferredSessionMinutes: 60,
    catalogue,
  };
  
  const eligible = isEligible(sissy, pastKneeInput);
  check(
    `isEligible(weighted-sissy-squat, past-knee) = false`,
    !eligible,
    eligible ? "CRITICAL: sissy eligible for past-knee (generate.ts:570 mutant survived)" : undefined
  );
}
console.log("");

// Test 1: Plans should not have sissy
for (const input of testProfiles) {
  const plan = generateProgram(input);
  const hasSissy = plan.days.some((day) =>
    day.exercises.some((ex) => {
      const e = byId.get(ex.exerciseId);
      return e?.slug.includes("sissy");
    })
  );
  
  check(
    `${input.userId}: no sissy in plan`,
    !hasSissy,
    hasSissy ? "Found sissy in plan" : undefined
  );
}

// Test 2: SWAPS should not have sissy (the critical test)
console.log("");
console.log("Testing swap lists (using real swap generation API):");

for (const input of testProfiles) {
  const plan = generateProgram(input);
  
  // Build swap context using the real API
  const scoreFn = (e: CandidateExercise) => e.id ? 1.0 : 1.0;
  const tieBreakFn = (slug: string) => slug ? 0 : 0;
  const baseContext = buildSwapContext(input, scoreFn, tieBreakFn);
  
  let swapListsWithSissy = 0;
  
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (!exercise) continue;
      
      // Build alternatives using the real swap API
      const patternPriority = buildPatternList(
        exercise.movement_pattern,
        input.anyKneeInjury ?? false
      );
      
      const ctx = {
        ...baseContext,
        pattern: patternPriority,
        limit: 100, // Check full swap list, not just top 5
      };
      
      const candidates = catalogue.filter(e => 
        e.id !== exercise.id &&
        e.tracks.includes(input.primaryTrack)
      );
      
      const swaps = rankAlternatives(exercise, candidates, ctx);
      
      const hasSissy = swaps.some((swap) => swap.slug.includes("sissy"));
      
      if (hasSissy) {
        swapListsWithSissy++;
        const sissyNames = swaps
          .filter((s) => s.slug.includes("sissy"))
          .map((s) => s.slug);
        console.log(
          `  ✗ ${input.userId} ${day.label} ${exercise.slug}: sissy in swaps: ${sissyNames.join(", ")}`
        );
      }
    }
  }
  
  check(
    `${input.userId}: no sissy in any swap list`,
    swapListsWithSissy === 0,
    swapListsWithSissy > 0
      ? `Found sissy in ${swapListsWithSissy} swap lists`
      : undefined
  );
}

// Final report
console.log("");
console.log("─".repeat(60));
if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log(`PASSED: All ${testProfiles.length * 2} checks verified - no sissy squats in plans or swaps`);
  process.exit(0);
}
