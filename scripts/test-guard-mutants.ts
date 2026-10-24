/**
 * Targeted tests to kill mutants 15-18 (the 4 new guards).
 * Each test injects a catalogue where an excluded slug is the most/only attractive candidate
 * for that specific guard's code path.
 */

import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { readFileSync } from "fs";

const baseCatalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));

const EXCLUDED = [
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
  "barbell-guillotine-bench-press",
  "neck-press",
  "low-pulley-row-to-neck",
];

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
  // Build a catalogue where the only horizontal_pull is an excluded slug (low-pulley-row-to-neck)
  // and it's bodyweight/no-equipment so it's eligible for Strategy 3 accessory pacing
  const excludedSlug = "low-pulley-row-to-neck";
  const excludedEx = baseCatalogue.find(e => e.slug === excludedSlug);
  if (!excludedEx) {
    console.log(`  ✗ ${excludedSlug} not found in catalogue`);
    failCount++;
  } else {
    // Filter catalogue to remove all horizontal_pull and vertical_pull except the excluded one
    const injectedCatalogue = baseCatalogue.map(e => {
      if ((e.movement_pattern === "horizontal_pull" || e.movement_pattern === "vertical_pull") && e.slug !== excludedSlug) {
        return null;
      }
      return e;
    }).filter((e): e is CandidateExercise => e !== null);
    
    // Make the excluded exercise the most attractive by giving it no equipment requirement
    const modifiedExcluded = { ...excludedEx, equipment_ids: [] };
    const finalCatalogue = injectedCatalogue.map(e => e.slug === excludedSlug ? modifiedExcluded : e);
    
    // Generate a plan that will trigger Strategy 3 (90 min session, likely to need pacing top-up)
    const input: GeneratorInput = {
      userId: "guard-s3-test",
      blockNumber: 1,
      level: "intermediate",
      equipmentIds: [],
      hasAllEquipment: true,
      goal: "muscle_gain",
      currentInjuryRegions: [],
      age: 30,
      bmi: null,
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      primaryTrack: "weights",
      preferredSessionMinutes: 90,
      catalogue: finalCatalogue,
    };
    
    const program = generateProgram(input);
    const allSlugs = program.days.flatMap(day => 
      day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
    );
    
    const hasExcluded = allSlugs.includes(excludedSlug);
    check(`Strategy 3 guard blocks ${excludedSlug}`, !hasExcluded);
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
    // Remove all pull exercises except the excluded one
    const injectedCatalogue = baseCatalogue.map(e => {
      if ((e.movement_pattern === "horizontal_pull" || e.movement_pattern === "vertical_pull") && e.slug !== excludedSlug) {
        return null;
      }
      return e;
    }).filter((e): e is CandidateExercise => e !== null);
    
    // Make sure the excluded exercise is bodyweight (no equipment)
    const modifiedExcluded = { ...excludedEx, equipment_ids: [] };
    const finalCatalogue = injectedCatalogue.map(e => e.slug === excludedSlug ? modifiedExcluded : e);
    
    // Generate a plan with only pull-up bar (to trigger BW pull logic)
    const input: GeneratorInput = {
      userId: "guard-bw-force-test",
      blockNumber: 1,
      level: "beginner",
      equipmentIds: ["pull_up_bar"],
      hasAllEquipment: false,
      goal: "muscle_gain",
      currentInjuryRegions: [],
      age: 30,
      bmi: null,
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      primaryTrack: "weights",
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
  // Inject an excluded slug as a kept main lift from block 1
  // Use neck-press (horizontal_press) for day 0 slot 1
  // But first, modify it to remove contraindications and ensure it's always eligible
  const excludedSlug = "neck-press";
  const excludedEx = baseCatalogue.find(e => e.slug === excludedSlug);
  if (!excludedEx) {
    console.log(`  ✗ ${excludedSlug} not found in catalogue`);
    failCount++;
  } else {
    // Create a modified version with no contraindications and basic equipment
    const modifiedExcluded: CandidateExercise = {
      ...excludedEx,
      contraindicated_regions: [],
      equipment_ids: [],
    };
    
    // Use a modified catalogue with this change
    const modifiedCatalogue = baseCatalogue.map(e => 
      e.slug === excludedSlug ? modifiedExcluded : e
    );
    
    // The carry-over key is "dayIndex:pattern"
    // For horizontal_press on day 0 (Full Body A has horizontal_press in slot 1)
    const carryOver = {
      "0:horizontal_press": excludedEx.id,
    };
    
    const input: GeneratorInput = {
      userId: "guard-carryover-test",
      blockNumber: 2,
      level: "intermediate",
      equipmentIds: [],
      hasAllEquipment: true,
      goal: "muscle_gain",
      currentInjuryRegions: [],
      age: 30,
      bmi: null,
      daysPerWeek: 3,
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
    
    const hasExcluded = allSlugs.includes(excludedSlug);
    check(`Carry-over guard blocks ${excludedSlug}`, !hasExcluded);
  }
}

console.log(`\n${failCount === 0 ? "✓" : "✗"} ${passCount}/${passCount + failCount} guard tests passed`);

if (failCount > 0) {
  process.exit(1);
}
