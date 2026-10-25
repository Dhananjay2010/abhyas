/**
 * Test that Bradford and behind-the-neck exercises are excluded from plans and swaps.
 * 
 * Covers:
 * 1. Bradford presses (bradford-rocky-presses, standing-bradford-press)
 * 2. Comprehensive profile grid (no injury + all injuries, all levels, all equipment sets)
 * 3. Pinned case: Standing Military Press swaps for uninjured full-gym user
 */

import { readFileSync } from "fs";
import { generateProgram, isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext, type ExerciseRow } from "../src/lib/program/alternatives";
import { score, hashString } from "../src/lib/program/generate";
import { EXCLUDED_EXERCISE_SLUGS } from "../src/lib/program/exclusions";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));
const idToSlug = new Map(catalogue.map(e => [e.id, e.slug]));

const BRADFORD_SLUGS = [
  "bradford-rocky-presses",
  "standing-bradford-press",
];

const ALL_EXCLUDED_SLUGS = Array.from(EXCLUDED_EXERCISE_SLUGS);

const SHOULDER_CONTRAINDICATED_SLUG = "around-the-worlds";

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, failMsg?: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passCount++;
  } else {
    console.log(`  ✗ ${name}${failMsg ? ": " + failMsg : ""}`);
    failCount++;
  }
}

function find(slug: string): ExerciseRow {
  const ex = catalogue.find(e => e.slug === slug);
  if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
  return ex;
}

console.log("\n1. Pinned case: Standing Military Press swaps for uninjured full-gym user");
{
  const current = find("standing-military-press");
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
  
  const wantCompound = current.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    anyKneeInjury: false,
    limit: 10,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test-bradford:${slug}`),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  const slugs = alternatives.map(e => e.slug);
  
  console.log(`  Swap options (top 10): ${slugs.slice(0, 10).join(", ")}`);
  
  check("bradford-rocky-presses not in swaps", !slugs.includes("bradford-rocky-presses"));
  check("standing-bradford-press not in swaps", !slugs.includes("standing-bradford-press"));
  check("no excluded slugs in swaps", slugs.every(s => !ALL_EXCLUDED_SLUGS.includes(s)));
}

console.log("\n2. Profile grid: Bradford exercises never appear in generated plans");
{
  const injuries: Array<Array<"lower_back" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "hip" | "knee" | "ankle" | "core">> = [
    [],
    ["lower_back"],
    ["neck"],
    ["shoulder"],
    ["elbow"],
    ["wrist"],
    ["upper_back"],
    ["hip"],
    ["knee"],
    ["ankle"],
    ["core"],
  ];
  
  const levels: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
  
  const equipmentSets: Array<{ name: string; ids: string[]; hasAll: boolean }> = [
    { name: "full-gym", ids: [], hasAll: true },
    { name: "barbell", ids: ["barbell", "squat_rack", "flat_bench"], hasAll: false },
    { name: "dumbbells", ids: ["dumbbell"], hasAll: false },
    { name: "bodyweight", ids: [], hasAll: false },
  ];
  
  let gridPassCount = 0;
  let gridFailCount = 0;
  
  for (const injurySet of injuries) {
    for (const level of levels) {
      for (const eqSet of equipmentSets) {
        const input: GeneratorInput = {
          userId: `grid-${injurySet.length ? injurySet.join("-") : "none"}-${level}-${eqSet.name}`,
          blockNumber: 1,
          level,
          equipmentIds: eqSet.ids,
          hasAllEquipment: eqSet.hasAll,
          goal: "muscle_gain",
          currentInjuryRegions: injurySet,
          anyKneeInjury: false,
          age: 30,
          bmi: null,
          daysPerWeek: 4,
          yogaDaysPerWeek: 0,
          primaryTrack: "weights",
          preferredSessionMinutes: 75,
          catalogue,
        };
        
        const program = generateProgram(input);
        const allExerciseSlugs = program.days.flatMap(day => 
          day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
        );
        
        const foundBradford = allExerciseSlugs.filter(slug => BRADFORD_SLUGS.includes(slug));
        const foundExcluded = allExerciseSlugs.filter(slug => ALL_EXCLUDED_SLUGS.includes(slug));
        
        if (foundBradford.length > 0 || foundExcluded.length > 0) {
          console.log(`  ✗ ${input.userId}: found ${[...foundBradford, ...foundExcluded].join(", ")}`);
          gridFailCount++;
        } else {
          gridPassCount++;
        }
      }
    }
  }
  
  console.log(`  ${gridFailCount === 0 ? "✓" : "✗"} ${gridPassCount}/${gridPassCount + gridFailCount} profiles clean`);
  passCount += gridPassCount;
  failCount += gridFailCount;
}

console.log("\n3. Profile grid: Bradford exercises never appear in swap lists");
{
  const testExercises = [
    "standing-military-press",
    "barbell-shoulder-press",
    "dumbbell-shoulder-press",
  ];
  
  const injuries: Array<Array<"lower_back" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "hip" | "knee" | "ankle" | "core">> = [
    [],
    ["lower_back"],
    ["neck"],
    ["shoulder"],
    ["elbow"],
  ];
  
  const levels: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
  
  const equipmentSets: Array<{ name: string; ids: string[] | null }> = [
    { name: "full-gym", ids: null },
    { name: "barbell", ids: ["barbell", "squat_rack", "flat_bench"] },
    { name: "dumbbells", ids: ["dumbbell"] },
  ];
  
  let swapPassCount = 0;
  let swapFailCount = 0;
  
  for (const exerciseSlug of testExercises) {
    const current = find(exerciseSlug);
    
    for (const injurySet of injuries) {
      for (const level of levels) {
        for (const eqSet of equipmentSets) {
          const patterns = buildPatternList(current.movement_pattern, injurySet.includes("knee"));
          const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
          
          const wantCompound = current.mechanic !== "isolation";
          const ctx: AlternativesContext = {
            level,
            availableEquipment: eqSet.ids ? new Set(eqSet.ids) : null,
            injuryRegions: injurySet,
            anyKneeInjury: injurySet.includes("knee"),
            limit: 10,
            scoreFn: (e) => score(e, wantCompound, level, "weights"),
            tieBreakFn: (slug) => hashString(`test-bradford:${exerciseSlug}:${slug}`),
          };
          
          const alternatives = rankAlternatives(current, pool, ctx);
          const slugs = alternatives.map(e => e.slug);
          
          const foundBradford = slugs.filter(s => BRADFORD_SLUGS.includes(s));
          const foundExcluded = slugs.filter(s => ALL_EXCLUDED_SLUGS.includes(s));
          
          if (foundBradford.length > 0 || foundExcluded.length > 0) {
            console.log(`  ✗ ${exerciseSlug} (${injurySet.length ? injurySet.join(",") : "none"}, ${level}, ${eqSet.name}): found ${[...foundBradford, ...foundExcluded].join(", ")}`);
            swapFailCount++;
          } else {
            swapPassCount++;
          }
        }
      }
    }
  }
  
  console.log(`  ${swapFailCount === 0 ? "✓" : "✗"} ${swapPassCount}/${swapPassCount + swapFailCount} swap tests clean`);
  passCount += swapPassCount;
  failCount += swapFailCount;
}

console.log("\n4. Around The Worlds contraindication: never appears for shoulder-injured users");
{
  const goals: Array<"fat_loss" | "muscle_gain" | "strength" | "general_fitness"> = ["fat_loss", "muscle_gain", "strength", "general_fitness"];
  const levels: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
  const equipmentSets: Array<{ name: string; ids: string[]; hasAll: boolean }> = [
    { name: "full-gym", ids: [], hasAll: true },
    { name: "barbell-setup", ids: ["barbell", "squat_rack", "flat_bench", "dumbbell"], hasAll: false },
    { name: "dumbbell-bench", ids: ["dumbbell", "adjustable_bench"], hasAll: false },
    { name: "bodyweight", ids: [], hasAll: false },
  ];
  const daysOptions = [3, 4, 5];
  const minutesOptions = [45, 75];
  
  let aroundWorldsPassCount = 0;
  let aroundWorldsFailCount = 0;
  
  for (const goal of goals) {
    for (const level of levels) {
      for (const eqSet of equipmentSets) {
        for (const days of daysOptions) {
          for (const minutes of minutesOptions) {
            const input: GeneratorInput = {
              userId: `shoulder-${goal}-${level}-${eqSet.name}-${days}d-${minutes}m`,
              blockNumber: 1,
              level,
              equipmentIds: eqSet.ids,
              hasAllEquipment: eqSet.hasAll,
              goal,
              currentInjuryRegions: ["shoulder"],
              anyKneeInjury: false,
              age: 30,
              bmi: null,
              daysPerWeek: days,
              yogaDaysPerWeek: 0,
              primaryTrack: "weights",
              preferredSessionMinutes: minutes,
              catalogue,
            };
            
            const program = generateProgram(input);
            const allExerciseSlugs = program.days.flatMap(day => 
              day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
            );
            
            // Check ATW not in plan
            if (allExerciseSlugs.includes(SHOULDER_CONTRAINDICATED_SLUG)) {
              console.log(`  ✗ ${input.userId}: found ${SHOULDER_CONTRAINDICATED_SLUG} in plan`);
              aroundWorldsFailCount++;
            } else {
              aroundWorldsPassCount++;
            }
            
            // For each exercise in the plan, test the actions.ts swap path
            const availableEquipment = eqSet.hasAll ? null : new Set(eqSet.ids);
            
            for (const day of program.days) {
              for (const ex of day.exercises) {
                const currentExercise = catalogue.find(e => e.id === ex.exerciseId);
                if (!currentExercise) continue;
                
                const patterns = buildPatternList(currentExercise.movement_pattern, false);
                const rawPool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
                
                // Filter through isEligible (as actions.ts does)
                const pool = rawPool.filter((e) => isEligible(e, input));
                
                const wantCompound = currentExercise.mechanic !== "isolation";
                const ctx: AlternativesContext = {
                  level,
                  availableEquipment,
                  injuryRegions: ["shoulder"],
                  anyKneeInjury: false,
                  limit: 5,
                  scoreFn: (e) => score(e, wantCompound, level, "weights"),
                  tieBreakFn: (slug) => hashString(`test-atw:${input.userId}:${slug}`),
                };
                
                const alternatives = rankAlternatives(currentExercise, pool, ctx);
                const swapSlugs = alternatives.map(e => e.slug);
                
                if (swapSlugs.includes(SHOULDER_CONTRAINDICATED_SLUG)) {
                  console.log(`  ✗ ${input.userId} ${currentExercise.slug}: ATW in swaps`);
                  aroundWorldsFailCount++;
                } else {
                  aroundWorldsPassCount++;
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Positive control: ATW should still be reachable for no-injury users
  console.log("\n  Positive control: ATW reachable for no-injury users");
  let positiveControlPass = false;
  
  // ATW requires dumbbells, so test with full gym
  const noInjuryInput: GeneratorInput = {
    userId: "no-injury-control",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    anyKneeInjury: false,
    age: 30,
    bmi: null,
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 75,
    catalogue,
  };
  
  // Check if ATW is eligible at all
  const atwExercise = find(SHOULDER_CONTRAINDICATED_SLUG);
  if (isEligible(atwExercise, noInjuryInput)) {
    positiveControlPass = true;
  }
  
  if (positiveControlPass) {
    console.log("  ✓ ATW is eligible for no-injury full-gym users");
    aroundWorldsPassCount++;
  } else {
    console.log("  ✗ ATW not eligible for no-injury users (positive control failed)");
    aroundWorldsFailCount++;
  }
  
  console.log(`\n  ${aroundWorldsFailCount === 0 ? "✓" : "✗"} ${aroundWorldsPassCount}/${aroundWorldsPassCount + aroundWorldsFailCount} Around The Worlds checks clean`);
  passCount += aroundWorldsPassCount;
  failCount += aroundWorldsFailCount;
}

console.log("\n5. ATW not in EXCLUDED_EXERCISE_SLUGS (must remain reachable for non-shoulder users)");
{
  const atwInExcluded = EXCLUDED_EXERCISE_SLUGS.has(SHOULDER_CONTRAINDICATED_SLUG);
  check("around-the-worlds NOT in EXCLUDED_EXERCISE_SLUGS", !atwInExcluded);
}

console.log("\n6. Positive grid: ATW reachable for NON-shoulder users in plans and swap lists");
{
  const nonShoulderInjuries: Array<{ name: string; injuries: Array<"wrist" | "knee">; pastKnee: boolean }> = [
    { name: "no-injury", injuries: [], pastKnee: false },
    { name: "wrist-only", injuries: ["wrist"], pastKnee: false },
    { name: "knee-past", injuries: [], pastKnee: true },
  ];
  
  let atwInPlansCount = 0;
  let atwInSwapsCount = 0;
  let plansChecked = 0;
  let swapsChecked = 0;
  
  for (const injuryCase of nonShoulderInjuries) {
    // Generate multiple profiles to increase chances of ATW appearing
    const levels: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
    const equipmentSets: Array<string[]> = [
      ["dumbbell"],
      ["dumbbell", "flat_bench"],
      ["dumbbell", "flat_bench", "cable_machine"],
    ];
    
    for (const level of levels) {
      for (const equipmentIds of equipmentSets) {
        const input: GeneratorInput = {
          userId: `atw-positive-${injuryCase.name}-${level}`,
          blockNumber: 1,
          level,
          equipmentIds,
          hasAllEquipment: false,
          goal: "muscle_gain",
          currentInjuryRegions: injuryCase.injuries,
          anyKneeInjury: injuryCase.pastKnee,
          age: 30,
          bmi: null,
          daysPerWeek: 4,
          yogaDaysPerWeek: 0,
          primaryTrack: "weights",
          preferredSessionMinutes: 75,
          catalogue,
        };
        
        plansChecked++;
        const program = generateProgram(input);
        const allExerciseSlugs = program.days.flatMap(day => 
          day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
        );
        
        if (allExerciseSlugs.includes(SHOULDER_CONTRAINDICATED_SLUG)) {
          atwInPlansCount++;
        }
        
        // Check swap lists via REAL rankAlternatives with limit 5
        const availableEquipment = new Set(input.equipmentIds);
        
        // Focus on horizontal_press exercises since ATW is horizontal_press
        for (const day of program.days) {
          for (const ex of day.exercises) {
            const currentExercise = catalogue.find(e => e.id === ex.exerciseId);
            if (!currentExercise || currentExercise.movement_pattern !== "horizontal_press") continue;
            
            const patterns = buildPatternList(currentExercise.movement_pattern, input.currentInjuryRegions.includes("knee"));
            const rawPool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
            const pool = rawPool.filter((e) => isEligible(e, input));
            
            const wantCompound = currentExercise.mechanic !== "isolation";
            const ctx: AlternativesContext = {
              level: input.level,
              availableEquipment,
              injuryRegions: input.currentInjuryRegions,
              anyKneeInjury: input.anyKneeInjury,
              limit: 5,
              scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
              tieBreakFn: (slug) => hashString(`atw-positive:${input.userId}:${slug}`),
            };
            
            const alternatives = rankAlternatives(currentExercise, pool, ctx);
            const swapSlugs = alternatives.map(e => e.slug);
            
            swapsChecked++;
            if (swapSlugs.includes(SHOULDER_CONTRAINDICATED_SLUG)) {
              atwInSwapsCount++;
            }
          }
        }
      }
    }
  }
  
  console.log(`  ATW in plans: ${atwInPlansCount}/${plansChecked}`);
  console.log(`  ATW in ranked swap lists (limit 5): ${atwInSwapsCount}/${swapsChecked}`);
  check("ATW appears in at least one plan", atwInPlansCount > 0);
  check("ATW appears in at least one ranked swap list", atwInSwapsCount > 0);
}

console.log("\n7. Catch-all: no shoulder-injured plan or swap contains bradford|rocky");
{
  const shoulderInput: GeneratorInput = {
    userId: "shoulder-catchall",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: ["shoulder"],
    anyKneeInjury: false,
    age: 30,
    bmi: null,
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 75,
    catalogue,
  };
  
  const program = generateProgram(shoulderInput);
  const allExercises = program.days.flatMap(day => 
    day.exercises.map(e => catalogue.find(ex => ex.id === e.exerciseId)!)
  ).filter(Boolean);
  
  const bradfordRockyRegex = /bradford|rocky/i;
  const planViolations = allExercises.filter(e => bradfordRockyRegex.test(e.name));
  
  check("No bradford|rocky in shoulder-injured plans", planViolations.length === 0, 
    planViolations.map(e => e.name).join(", "));
  
  // Check swaps too
  const availableEquipment = null; // has all
  let swapViolationCount = 0;
  
  for (const day of program.days) {
    for (const ex of day.exercises) {
      const currentExercise = catalogue.find(e => e.id === ex.exerciseId);
      if (!currentExercise) continue;
      
      const patterns = buildPatternList(currentExercise.movement_pattern, false);
      const rawPool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
      const pool = rawPool.filter((e) => isEligible(e, shoulderInput));
      
      const wantCompound = currentExercise.mechanic !== "isolation";
      const ctx: AlternativesContext = {
        level: shoulderInput.level,
        availableEquipment,
        injuryRegions: shoulderInput.currentInjuryRegions,
        anyKneeInjury: false,
        limit: 10,
        scoreFn: (e) => score(e, wantCompound, shoulderInput.level, shoulderInput.primaryTrack),
        tieBreakFn: (slug) => hashString(`catchall:${slug}`),
      };
      
      const alternatives = rankAlternatives(currentExercise, pool, ctx);
      const violations = alternatives.filter(e => bradfordRockyRegex.test(e.name));
      swapViolationCount += violations.length;
    }
  }
  
  check("No bradford|rocky in shoulder-injured swaps", swapViolationCount === 0,
    `${swapViolationCount} swap list violations`);
}

console.log(`\n${failCount === 0 ? "✓" : "✗"} ${passCount}/${passCount + failCount} checks passed`);

if (failCount > 0) {
  process.exit(1);
}
