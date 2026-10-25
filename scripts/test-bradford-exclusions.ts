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
  const shoulderProfiles: Array<{
    level: "beginner" | "intermediate" | "expert";
    equipmentIds: string[];
    hasAll: boolean;
  }> = [
    { level: "beginner", equipmentIds: [], hasAll: true },
    { level: "intermediate", equipmentIds: ["dumbbell"], hasAll: false },
    { level: "expert", equipmentIds: [], hasAll: true },
  ];
  
  let aroundWorldsPassCount = 0;
  let aroundWorldsFailCount = 0;
  
  for (const profile of shoulderProfiles) {
    const input: GeneratorInput = {
      userId: `shoulder-${profile.level}`,
      blockNumber: 1,
      level: profile.level,
      equipmentIds: profile.equipmentIds,
      hasAllEquipment: profile.hasAll,
      goal: "muscle_gain",
      currentInjuryRegions: ["shoulder"],
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
    
    if (allExerciseSlugs.includes(SHOULDER_CONTRAINDICATED_SLUG)) {
      console.log(`  ✗ ${input.userId}: found ${SHOULDER_CONTRAINDICATED_SLUG} in plan`);
      aroundWorldsFailCount++;
    } else {
      aroundWorldsPassCount++;
    }
  }
  
  // Also test swaps for a chest exercise (isEligible + rankAlternatives path)
  const chestExercise = find("barbell-bench-press-medium-grip");
  const patterns = buildPatternList(chestExercise.movement_pattern, false);
  const rawPool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
  
  // Filter through isEligible first (as the action.ts swap path does)
  const swapInput: GeneratorInput = {
    userId: "test-swap-shoulder",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: [],
    hasAllEquipment: true,
    goal: "muscle_gain",
    currentInjuryRegions: ["shoulder"],
    age: null,
    bmi: null,
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 75,
    catalogue,
  };
  
  const pool = rawPool.filter((e) => isEligible(e, swapInput));
  
  const wantCompound = chestExercise.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: ["shoulder"],
    limit: 10,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test-around-worlds:${slug}`),
  };
  
  const alternatives = rankAlternatives(chestExercise, pool, ctx);
  const slugs = alternatives.map(e => e.slug);
  
  if (slugs.includes(SHOULDER_CONTRAINDICATED_SLUG)) {
    console.log(`  ✗ around-the-worlds in swaps for shoulder-injured`);
    aroundWorldsFailCount++;
  } else {
    aroundWorldsPassCount++;
  }
  
  console.log(`  ${aroundWorldsFailCount === 0 ? "✓" : "✗"} ${aroundWorldsPassCount}/${aroundWorldsPassCount + aroundWorldsFailCount} Around The Worlds checks clean`);
  passCount += aroundWorldsPassCount;
  failCount += aroundWorldsFailCount;
}

console.log(`\n${failCount === 0 ? "✓" : "✗"} ${passCount}/${passCount + failCount} checks passed`);

if (failCount > 0) {
  process.exit(1);
}
