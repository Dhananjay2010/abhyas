/**
 * Test swap path excludes all 6 excluded exercises.
 * 
 * Verifies that actions.ts swap flow (buildPatternList → isEligible → rankAlternatives)
 * correctly excludes all 6 dangerous exercises through rankAlternatives filter.
 */

import { readFileSync } from "fs";
import { buildPatternList, rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";
import { isEligible, score, hashString, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

let failures = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
  }
}

// Simulate the exact swap path from actions.ts:
// 1. buildPatternList
// 2. filter by pattern
// 3. filter by isEligible
// 4. rankAlternatives

console.log("\n1. Bench Press swaps (horizontal_press pattern)");
{
  const current = catalogue.find(e => e.slug === "barbell-bench-press-medium-grip");
  if (!current) {
    console.log("  ✗ Current exercise not found");
    process.exit(1);
  }
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
  
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue: [],
  };
  
  const eligible = pool.filter(e => isEligible(e, input));
  
  const wantCompound = current.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives = rankAlternatives(current, eligible, ctx);
  const slugs = alternatives.map(e => e.slug);
  
  check("guillotine-press not in swaps", !slugs.includes("barbell-guillotine-bench-press"));
  check("neck-press not in swaps", !slugs.includes("neck-press"));
}

console.log("\n2. Lat Pulldown swaps (vertical_pull pattern)");
{
  const current = catalogue.find(e => e.slug === "wide-grip-lat-pulldown");
  if (!current) {
    console.log("  ✗ Current exercise not found");
    process.exit(1);
  }
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
  
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue: [],
  };
  
  const eligible = pool.filter(e => isEligible(e, input));
  
  const wantCompound = current.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives = rankAlternatives(current, eligible, ctx);
  const slugs = alternatives.map(e => e.slug);
  
  check("behind-the-neck pulldown not in swaps", !slugs.includes("wide-grip-pulldown-behind-the-neck"));
  check("wide-grip-rear-pull-up not in swaps", !slugs.includes("wide-grip-rear-pull-up"));
}

console.log("\n3. Cable Row swaps (horizontal_pull pattern)");
{
  const current = catalogue.find(e => e.slug === "seated-cable-rows");
  if (!current) {
    console.log("  ✗ Current exercise not found");
    process.exit(1);
  }
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
  
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue: [],
  };
  
  const eligible = pool.filter(e => isEligible(e, input));
  
  const wantCompound = current.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives = rankAlternatives(current, eligible, ctx);
  const slugs = alternatives.map(e => e.slug);
  
  check("low-pulley-row-to-neck not in swaps", !slugs.includes("low-pulley-row-to-neck"));
}

console.log("\n4. Shoulder Press swaps (vertical_press pattern)");
{
  const current = catalogue.find(e => e.slug === "dumbbell-shoulder-press");
  if (!current) {
    console.log("  ✗ Current exercise not found");
    process.exit(1);
  }
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
  
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue: [],
  };
  
  const eligible = pool.filter(e => isEligible(e, input));
  
  const wantCompound = current.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives = rankAlternatives(current, eligible, ctx);
  const slugs = alternatives.map(e => e.slug);
  
  check("behind-neck-press not in swaps", !slugs.includes("standing-barbell-press-behind-neck"));
}

console.log("");
if (failures === 0) {
  console.log("✓ All swap path exclusions pass\n");
  process.exit(0);
} else {
  console.log(`✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
