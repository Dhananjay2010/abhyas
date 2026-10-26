#!/usr/bin/env npx tsx
/**
 * Identity test: prove non-knee and current-knee users get identical output to main.
 * Compare generated plans and swap lists against baseline fixture from main.
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import { hashString, score, isEligible } from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const baseline = JSON.parse(
  readFileSync("scripts/fixtures/identity-baseline-main.json", "utf-8")
);

const testCases: Array<{
  id: string;
  injuries: Array<{ region: string; severity: string }>;
  level: string;
}> = [
  // No injury
  { id: "no-injury-intermediate", injuries: [], level: "intermediate" },
  { id: "no-injury-beginner", injuries: [], level: "beginner" },
  
  // Current knee (not past)
  { id: "current-knee-intermediate", injuries: [{ region: "knee", severity: "current" }], level: "intermediate" },
  { id: "current-knee-beginner", injuries: [{ region: "knee", severity: "current" }], level: "beginner" },
  
  // Other injuries (not knee)
  { id: "shoulder-past", injuries: [{ region: "shoulder", severity: "past" }], level: "intermediate" },
  { id: "lower-back-past", injuries: [{ region: "lower_back", severity: "past" }], level: "intermediate" },
];

let failures = 0;
const turkishGetUpChanges: string[] = [];

function fail(message: string) {
  console.error(`  ✗ ${message}`);
  failures++;
}

console.log("Identity Test: Non-Knee and Current-Knee vs Main");
console.log("─".repeat(60));

for (const testCase of testCases) {
  console.log(`\n${testCase.id}:`);
  
  const currentInjuryRegions = testCase.injuries
    .filter(i => i.severity === "current")
    .map(i => i.region as "knee" | "lower_back" | "shoulder");
  
  const anyKneeInjury = testCase.injuries.some(i => i.region === "knee");
  
  const input: GeneratorInput = {
    userId: `test-${testCase.id}`,
    blockNumber: 1,
    goal: "muscle_gain" as const,
    level: testCase.level as "beginner" | "intermediate" | "expert",
    primaryTrack: "weights" as const,
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions,
    anyKneeInjury,
    preferredSessionMinutes: 60,
    catalogue,
  };
  
  const program = generateProgram(input);
  const expected = baseline[testCase.id];
  
  if (!expected) {
    fail(`Baseline missing for ${testCase.id}`);
    continue;
  }
  
  // Compare program structure
  if (program.days.length !== expected.program.days.length) {
    fail(`Day count mismatch: ${program.days.length} vs ${expected.program.days.length}`);
  }
  
  let programMatch = true;
  for (let i = 0; i < Math.min(program.days.length, expected.program.days.length); i++) {
    const day = program.days[i];
    const expDay = expected.program.days[i];
    
    if (day.dayType !== expDay.dayType || day.focus !== expDay.focus) {
      fail(`Day ${i+1} structure mismatch: ${day.dayType}/${day.focus} vs ${expDay.dayType}/${expDay.focus}`);
      programMatch = false;
    }
    
    if (day.exercises.length !== expDay.exercises.length) {
      fail(`Day ${i+1} exercise count: ${day.exercises.length} vs ${expDay.exercises.length}`);
      programMatch = false;
      continue;
    }
    
    for (let j = 0; j < day.exercises.length; j++) {
      const ex = day.exercises[j];
      const expEx = expDay.exercises[j];
      
      if (ex.name !== expEx.name || ex.targetSets !== expEx.targetSets) {
        fail(`Day ${i+1} ex ${j+1}: ${ex.name} (${ex.targetSets} sets) vs ${expEx.name} (${expEx.targetSets} sets)`);
        programMatch = false;
      }
    }
  }
  
  if (programMatch) {
    console.log(`  ✓ Program identical to main`);
  }
  
  // Generate swap lists
  const barbellSquat = catalogue.find(e => e.slug === "barbell-squat");
  const spanishSquat = catalogue.find(e => e.slug === "spanish-squat");
  const splitSquat = catalogue.find(e => e.slug === "split-squat-with-dumbbells");
  
  const exercises: Array<{ name: string; ex: CandidateExercise | undefined }> = [
    { name: "barbell-squat", ex: barbellSquat },
    { name: "spanish-squat", ex: spanishSquat },
    { name: "split-squat-with-dumbbells", ex: splitSquat },
  ];
  
  for (const { name, ex } of exercises) {
    if (!ex) continue;
    
    const patterns = getSwapPatterns(ex.movement_pattern, input);
    const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    const eligible = pool.filter(e => isEligible(e, input));
    
    const wantCompound = ex.mechanic !== "isolation";
    const tieBreak = (slug: string) => hashString(`test:${slug}`);
    const scoreFn = (e: CandidateExercise) => score(e, wantCompound, input.level, input.primaryTrack);
    
    const ranked = rankAlternatives(
      ex,
      eligible,
      {
        level: input.level,
        availableEquipment: null,
        injuryRegions: input.currentInjuryRegions,
        anyKneeInjury: input.anyKneeInjury,
        limit: 10,
        scoreFn,
        tieBreakFn: tieBreak,
      }
    );
    
    const current = ranked.map(e => e.slug);
    const expected = baseline[testCase.id].swaps[name] || [];
    
    // Check if lists are identical or only differ by Turkish Get-Up removal
    const currentSet = new Set(current);
    const expectedSet = new Set(expected);
    
    const onlyInExpected = expected.filter((s: string) => !currentSet.has(s));
    const onlyInCurrent = current.filter((s: string) => !expectedSet.has(s));
    
    const turkishGetUpSlugs = ["kettlebell-turkish-get-up-lunge-style", "kettlebell-turkish-get-up-squat-style"];
    const isTurkishGetUpChange = 
      onlyInExpected.every((s: string) => turkishGetUpSlugs.includes(s)) &&
      onlyInCurrent.length === 0;
    
    if (current.length === expected.length && current.every((s, i) => s === expected[i])) {
      console.log(`  ✓ ${name} swaps identical (${current.length} items)`);
    } else if (isTurkishGetUpChange) {
      console.log(`  ✓ ${name} swaps: Turkish Get-Up removed (expected change)`);
      turkishGetUpChanges.push(`${testCase.id}:${name}`);
    } else {
      fail(`${name} swaps differ: current ${current.length} items, expected ${expected.length} items`);
      if (onlyInExpected.length > 0) {
        console.error(`    Removed: ${onlyInExpected.join(", ")}`);
      }
      if (onlyInCurrent.length > 0) {
        console.error(`    Added: ${onlyInCurrent.join(", ")}`);
      }
    }
  }
}

console.log("\n" + "─".repeat(60));
console.log("Turkish Get-Up Changes (Expected):");
if (turkishGetUpChanges.length > 0) {
  for (const change of turkishGetUpChanges) {
    console.log(`  - ${change}`);
  }
} else {
  console.log("  (None)");
}

console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log("✓ Identity test passed");
  console.log(`  All ${testCases.length} test cases match main (except Turkish Get-Up removal)`);
  process.exit(0);
} else {
  console.log(`✗ ${failures} identity failures`);
  process.exit(1);
}
