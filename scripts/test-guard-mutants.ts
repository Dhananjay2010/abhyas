/**
 * Targeted tests to kill mutants 15-18 (the 4 new guards).
 * Each test injects a catalogue where an excluded slug is the most/only attractive candidate
 * for that specific guard's code path.
 */

import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { readFileSync } from "fs";

const baseCatalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));

const idToSlug = new Map(baseCatalogue.map(e => [e.id, e.slug]));

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passCount++;
  } else {
    console.log(`  ✗ ${name}`);
    failCount++;
  }
}

console.log("1. Strategy 3 accessory top-up guard (mutant 15)");
{
  // Profiles that leak when ONLY :1266 is removed (Strategy 3 pacing path)
  const testProfiles: Array<{
    name: string;
    equipmentIds: string[];
    level: "beginner" | "intermediate" | "expert";
    daysPerWeek: number;
    expectedSlug: string;
  }> = [
    {
      name: "pull-up-bar-intermediate-2d",
      equipmentIds: ["pull_up_bar"],
      level: "intermediate",
      daysPerWeek: 2,
      expectedSlug: "wide-grip-rear-pull-up",
    },
    {
      name: "cable-beginner-3d",
      equipmentIds: ["cable_machine"],
      level: "beginner",
      daysPerWeek: 3,
      expectedSlug: "low-pulley-row-to-neck",
    },
  ];
  
  let s3Checks = 0;
  let s3Fails = 0;
  
  for (const profile of testProfiles) {
    const input: GeneratorInput = {
      userId: "11111111-1111-1111-1111-111111111111",
      blockNumber: 1,
      level: profile.level,
      equipmentIds: profile.equipmentIds,
      hasAllEquipment: false,
      goal: "general_fitness",
      currentInjuryRegions: [],
      age: 35,
      bmi: 24,
      daysPerWeek: profile.daysPerWeek,
      yogaDaysPerWeek: 0,
      primaryTrack: "weights",
      preferredSessionMinutes: 90,
      catalogue: baseCatalogue,
    };
    
    const program = generateProgram(input);
    const allSlugs = program.days.flatMap(day => 
      day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
    );
    
    if (allSlugs.includes(profile.expectedSlug)) {
      console.log(`  ✗ ${profile.name}: found ${profile.expectedSlug}`);
      s3Fails++;
    }
    s3Checks++;
  }
  
  if (s3Fails === 0) {
    passCount += s3Checks;
    console.log(`  ✓ Strategy 3 guard blocks excluded slugs (${s3Checks} profiles)`);
  } else {
    failCount += s3Fails;
    passCount += s3Checks - s3Fails;
  }
}

console.log("\n2. Bodyweight-pull force-add guard (mutant 16)");
{
  // Build a catalogue where there's no pull in the initial picks, and the only pull option is excluded
  const excludedSlug = "wide-grip-rear-pull-up";
  const excludedEx = baseCatalogue.find(e => e.slug === excludedSlug);
  if (!excludedEx) {
    console.log(`  ✗ ${excludedSlug} not found in catalogue`);
    failCount++;
  } else {
    // Keep most exercises but remove all other horizontal_pull and vertical_pull
    const injectedCatalogue = baseCatalogue.filter(e => {
      if ((e.movement_pattern === "horizontal_pull" || e.movement_pattern === "vertical_pull") && e.slug !== excludedSlug) {
        return false;
      }
      return true;
    });
    
    // Make the excluded exercise bodyweight-friendly with no contraindications
    const modifiedExcluded: CandidateExercise = {
      ...excludedEx,
      equipment_ids: [],
      mechanic: "compound",
      contraindicated_regions: [],
      tracks: ["bodyweight", "weights"],
    };
    const finalCatalogue = injectedCatalogue.map(e => e.slug === excludedSlug ? modifiedExcluded : e);
    
    // Generate a BODYWEIGHT plan to trigger BW pull force-add logic at :905
    const input: GeneratorInput = {
      userId: "guard-bw-force-test",
      blockNumber: 1,
      level: "intermediate",
      equipmentIds: [],
      hasAllEquipment: true,
      goal: "muscle_gain",
      currentInjuryRegions: [],
      age: 30,
      bmi: null,
      daysPerWeek: 6,
      yogaDaysPerWeek: 0,
      primaryTrack: "bodyweight",
      preferredSessionMinutes: 60,
      catalogue: finalCatalogue,
    };
    
    const program = generateProgram(input);
    const allSlugs = program.days.flatMap(day => 
      day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
    );
    
    const hasExcluded = allSlugs.includes(excludedSlug);
    check(`BW force-add guard blocks ${excludedSlug}`, !hasExcluded);
  }
}

console.log("\n3. Post-pacing bodyweight-pull guard (mutant 17)");
{
  // Build a catalogue where post-pacing pull addition would pick an excluded slug
  // Use wide-grip-rear-pull-up which is a bodyweight pull exercise
  const excludedSlug = "wide-grip-rear-pull-up";
  const excludedEx = baseCatalogue.find(e => e.slug === excludedSlug);
  if (!excludedEx) {
    console.log(`  ✗ ${excludedSlug} not found in catalogue`);
    failCount++;
  } else {
    // Keep most exercises but remove all other horizontal_pull and vertical_pull
    const injectedCatalogue = baseCatalogue.filter(e => {
      if ((e.movement_pattern === "horizontal_pull" || e.movement_pattern === "vertical_pull") && e.slug !== excludedSlug) {
        return false;
      }
      return true;
    });
    
    // Make the excluded exercise bodyweight-friendly with no contraindications
    const modifiedExcluded: CandidateExercise = {
      ...excludedEx,
      equipment_ids: [],
      mechanic: "compound",
      contraindicated_regions: [],
      tracks: ["bodyweight", "weights"],
    };
    const finalCatalogue = injectedCatalogue.map(e => e.slug === excludedSlug ? modifiedExcluded : e);
    
    // Generate a BODYWEIGHT plan that will trigger post-pacing pull addition
    // The post-pacing code only runs for bodyweight upper/pull/push days (not full_body)
    // Use 5-6 days to get upper/lower split instead of full body
    const input: GeneratorInput = {
      userId: "guard-post-pacing-test",
      blockNumber: 1,
      level: "intermediate",
      equipmentIds: [],
      hasAllEquipment: true,
      goal: "muscle_gain",
      currentInjuryRegions: [],
      age: 30,
      bmi: null,
      daysPerWeek: 6,
      yogaDaysPerWeek: 0,
      primaryTrack: "bodyweight",
      preferredSessionMinutes: 60,
      catalogue: finalCatalogue,
    };
    
    const program = generateProgram(input);
    const allSlugs = program.days.flatMap(day => 
      day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
    );
    
    const hasExcluded = allSlugs.includes(excludedSlug);
    check(`Post-pacing guard blocks ${excludedSlug}`, !hasExcluded);
  }
}

console.log("\n4. Carry-over guard (mutant 18)");
{
  // Test all 6 excluded slugs, each under its own movement pattern
  // Days are numbered 1-7, not 0-indexed
  const excludedTests = [
    { slug: "neck-press", pattern: "horizontal_press", day: 1 },
    { slug: "standing-barbell-press-behind-neck", pattern: "vertical_press", day: 3 },
    { slug: "wide-grip-pulldown-behind-the-neck", pattern: "vertical_pull", day: 3 },
    { slug: "wide-grip-rear-pull-up", pattern: "vertical_pull", day: 5 },
    { slug: "barbell-guillotine-bench-press", pattern: "horizontal_press", day: 5 },
    { slug: "low-pulley-row-to-neck", pattern: "horizontal_pull", day: 1 },
  ];
  
  let carryoverChecks = 0;
  let carryoverFails = 0;
  
  for (const test of excludedTests) {
    const excludedEx = baseCatalogue.find(e => e.slug === test.slug);
    if (!excludedEx) {
      console.log(`  ✗ ${test.slug} not found in catalogue`);
      carryoverFails++;
      carryoverChecks++;
      continue;
    }
    
    // Create a modified version with no contraindications and basic equipment
    const modifiedExcluded: CandidateExercise = {
      ...excludedEx,
      contraindicated_regions: [],
      equipment_ids: [],
    };
    
    // Use a modified catalogue with this change
    const modifiedCatalogue = baseCatalogue.map(e => 
      e.slug === test.slug ? modifiedExcluded : e
    );
    
    // The carry-over key is "dayIndex:pattern" where dayIndex is 1-7
    const carryOver = {
      [`${test.day}:${test.pattern}`]: excludedEx.id,
    };
    
    const input: GeneratorInput = {
      userId: `guard-carryover-${test.slug}`,
      blockNumber: 2,
      level: "intermediate",
      equipmentIds: [],
      hasAllEquipment: true,
      goal: "muscle_gain",
      currentInjuryRegions: [],
      age: 30,
      bmi: null,
      daysPerWeek: 6,
      yogaDaysPerWeek: 0,
      primaryTrack: "weights",
      preferredSessionMinutes: 75,
      catalogue: modifiedCatalogue,
      carryOver,
    };
    
    const program = generateProgram(input);
    const allSlugs = program.days.flatMap(day => 
      day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
    );
    
    const hasExcluded = allSlugs.includes(test.slug);
    if (hasExcluded) {
      carryoverFails++;
    }
    carryoverChecks++;
  }
  
  if (carryoverFails === 0) {
    passCount += carryoverChecks;
    console.log(`  ✓ Carry-over guard blocks all excluded slugs (${carryoverChecks} tests)`);
  } else {
    failCount += carryoverFails;
    passCount += carryoverChecks - carryoverFails;
    console.log(`  ✗ ${carryoverFails}/${carryoverChecks} carry-over tests failed`);
  }
}

console.log("\n5. Empty-day backfill guard (mutant 20)");
{
  // Filter catalogue to only pull exercises to trigger empty-day backfill
  const pullOnlyCatalogue = baseCatalogue.filter(e => 
    e.movement_pattern === "vertical_pull" || e.movement_pattern === "horizontal_pull"
  );
  
  // Test with pull-up bar (weights + bodyweight)
  const profile1: GeneratorInput = {
    userId: "33333333-3333-3333-3333-333333333333",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["pull_up_bar"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: 35,
    bmi: 24,
    daysPerWeek: 5,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 60,
    catalogue: pullOnlyCatalogue,
  };
  
  // Test with cable machine (weights)
  const profile2: GeneratorInput = {
    ...profile1,
    equipmentIds: ["cable_machine"],
    primaryTrack: "weights",
  };
  
  let backfillChecks = 0;
  let backfillFails = 0;
  
  for (const input of [profile1, profile2]) {
    const program = generateProgram(input);
    
    // Check if at least one day is labeled "Full body" (backfill ran)
    const hasFullBody = program.days.some(d => d.label === "Full body");
    
    if (hasFullBody) {
      const allSlugs = program.days.flatMap(day => 
        day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
      );
      
      const excludedSlugs = [
        "wide-grip-pulldown-behind-the-neck",
        "wide-grip-rear-pull-up",
        "low-pulley-row-to-neck",
      ];
      
      const foundExcluded = allSlugs.filter(slug => excludedSlugs.includes(slug));
      if (foundExcluded.length > 0) {
        backfillFails++;
      }
      backfillChecks++;
    } else {
      backfillFails++;
    }
  }
  
  if (backfillFails === 0) {
    passCount += backfillChecks;
    console.log(`  ✓ Backfill guard blocks excluded slugs (${backfillChecks} profiles with Full body days)`);
  } else {
    failCount += backfillFails;
    passCount += backfillChecks - backfillFails;
  }
}

console.log(`\n${failCount === 0 ? "✓" : "✗"} ${passCount}/${passCount + failCount} guard tests passed`);

if (failCount > 0) {
  process.exit(1);
}
