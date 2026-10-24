/**
 * Test that excluded exercises never appear in generated plans.
 * 
 * Uses probe profiles that DID generate excluded exercises on origin/main,
 * verifies they no longer appear in HEAD.
 */

import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { readFileSync } from "fs";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));
const mainBaseline: Array<{
  name: string;
  userId: string;
  slugs: string[];
  expectedSlug: string;
  foundExpected: boolean;
}> = JSON.parse(readFileSync(__dirname + "/fixtures/main-baseline-exclusions.json", "utf-8"));

const EXCLUDED_SLUGS = [
  "neck-press",
  "barbell-guillotine-bench-press",
  "low-pulley-row-to-neck",
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
];

const idToSlug = new Map(catalogue.map(e => [e.id, e.slug]));

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

// Profile definitions matching main baseline
const profiles: Array<{
  name: string;
  userId: string;
  level: "beginner" | "intermediate" | "expert";
  equipmentIds: string[];
  hasAllEquipment: boolean;
  goal: "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "flexibility_stress";
  injuries: Array<"lower_back" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "hip" | "knee" | "ankle" | "core">;
  days: number;
  minutes: number;
  primaryTrack: "weights" | "bodyweight";
  expectedSlug: string;
}> = [
  {
    name: "probe-1279",
    userId: "probe-1279",
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    injuries: ["neck"],
    goal: "strength",
    days: 2,
    minutes: 75,
    primaryTrack: "weights",
    expectedSlug: "barbell-guillotine-bench-press",
  },
  {
    name: "probe-1705",
    userId: "probe-1705",
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    injuries: ["shoulder", "knee"],
    goal: "muscle_gain",
    days: 2,
    minutes: 90,
    primaryTrack: "weights",
    expectedSlug: "neck-press",
  },
  {
    name: "probe-2755",
    userId: "probe-2755",
    level: "intermediate",
    equipmentIds: ["cable_machine"],
    hasAllEquipment: false,
    injuries: [],
    goal: "muscle_gain",
    days: 2,
    minutes: 90,
    primaryTrack: "weights",
    expectedSlug: "low-pulley-row-to-neck",
  },
];

// Test each profile
for (let i = 0; i < profiles.length; i++) {
  const profile = profiles[i];
  const baseline = mainBaseline[i];
  
  console.log(`\n${i + 1}. ${profile.name} (expected: ${profile.expectedSlug})`);
  
  // Verify baseline contained the excluded slug
  check(
    `main baseline contained ${profile.expectedSlug}`,
    baseline.slugs.includes(profile.expectedSlug),
    baseline.slugs.includes(profile.expectedSlug) ? undefined : "not found in baseline"
  );
  
  // Generate with HEAD's code
  const input: GeneratorInput = {
    userId: profile.userId,
    blockNumber: 1,
    level: profile.level,
    equipmentIds: profile.equipmentIds,
    hasAllEquipment: profile.hasAllEquipment,
    goal: profile.goal,
    currentInjuryRegions: profile.injuries,
    age: null,
    bmi: null,
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    primaryTrack: profile.primaryTrack,
    preferredSessionMinutes: profile.minutes,
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  // Check that none of the 6 excluded slugs appear
  for (const excludedSlug of EXCLUDED_SLUGS) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(
      `${excludedSlug} not in HEAD plan`,
      !found,
      found ? "FOUND IN PLAN" : undefined
    );
  }
}

console.log("\n4. Fallback pattern filter at :672 catches excluded slugs");
{
  // Filter catalogue so only excluded slugs remain for horizontal_pull and vertical_pull
  const filteredCatalogue = catalogue.map(e => {
    if ((e.movement_pattern === "horizontal_pull" || e.movement_pattern === "vertical_pull") &&
        !EXCLUDED_SLUGS.includes(e.slug)) {
      return null;
    }
    return e;
  }).filter((e): e is CandidateExercise => e !== null);
  
  // Generate plans with this limited catalogue
  let fallbackChecks = 0;
  let fallbackFails = 0;
  
  const fallbackLevels: GeneratorInput["level"][] = ["intermediate", "expert"];
  for (const level of fallbackLevels) {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const seed of [1, 2, 3]) {
        const input: GeneratorInput = {
          userId: `fallback-${level}-${days}-${seed}`,
          blockNumber: 1,
          level,
          equipmentIds: [],
          hasAllEquipment: true,
          goal: "muscle_gain",
          currentInjuryRegions: [],
          age: 30,
          bmi: null,
          daysPerWeek: days,
          yogaDaysPerWeek: 0,
          primaryTrack: "weights",
          preferredSessionMinutes: 75,
          catalogue: filteredCatalogue,
        };
        
        const program = generateProgram(input);
        const allExerciseSlugs = program.days.flatMap(day => 
          day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
        );
        
        const hasExcluded = allExerciseSlugs.some(slug => EXCLUDED_SLUGS.includes(slug));
        if (hasExcluded) {
          const found = allExerciseSlugs.filter(slug => EXCLUDED_SLUGS.includes(slug));
          console.log(`  ✗ ${input.userId}: found ${found.join(", ")}`);
          fallbackFails++;
        }
        fallbackChecks++;
      }
    }
  }
  
  console.log(`  ${fallbackFails === 0 ? "✓" : "✗"} ${fallbackChecks - fallbackFails}/${fallbackChecks} fallback plans clean`);
  passCount += fallbackChecks - fallbackFails;
  failCount += fallbackFails;
}

console.log("\n5. Strategy 3 and other guards: 90-min sessions with pull-up bar, cable, and gym");
{
  // Test Strategy 3 top-up, BW pull force-add, post-pacing BW, across 90-min sessions
  // These hit the code paths where excluded slugs leaked through before
  const EXCLUDED = [
    "standing-barbell-press-behind-neck",
    "wide-grip-pulldown-behind-the-neck",
    "wide-grip-rear-pull-up",
    "barbell-guillotine-bench-press",
    "neck-press",
    "low-pulley-row-to-neck",
  ];
  
  const equipment90Profiles = [
    { name: "pull-up-bar", ids: ["pull_up_bar"], hasAll: false },
    { name: "cable", ids: ["cable_machine"], hasAll: false },
    { name: "gym", ids: [], hasAll: true },
  ];
  
  const levels: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
  const daysOptions = [2, 3, 5];
  const injuries: Array<Array<"lower_back" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "hip" | "knee" | "ankle" | "core">> = [
    [],
    ["neck"],
    ["shoulder"],
  ];
  
  let strategy3Checks = 0;
  let strategy3Fails = 0;
  
  for (const eqProfile of equipment90Profiles) {
    for (const level of levels) {
      for (const days of daysOptions) {
        for (const injurySet of injuries) {
          const input: GeneratorInput = {
            userId: `s3-${eqProfile.name}-${level}-${days}d-inj${injurySet.length}`,
            blockNumber: 1,
            level,
            equipmentIds: eqProfile.ids,
            hasAllEquipment: eqProfile.hasAll,
            goal: "muscle_gain",
            currentInjuryRegions: injurySet,
            age: 30,
            bmi: null,
            daysPerWeek: days,
            yogaDaysPerWeek: 0,
            primaryTrack: "weights",
            preferredSessionMinutes: 90,
            catalogue,
          };
          
          const program = generateProgram(input);
          const allExerciseSlugs = program.days.flatMap(day => 
            day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
          );
          
          const foundExcluded = allExerciseSlugs.filter(slug => EXCLUDED.includes(slug));
          if (foundExcluded.length > 0) {
            console.log(`  ✗ ${input.userId}: found ${foundExcluded.join(", ")}`);
            strategy3Fails++;
          }
          strategy3Checks++;
        }
      }
    }
  }
  
  console.log(`  ${strategy3Fails === 0 ? "✓" : "✗"} ${strategy3Checks - strategy3Fails}/${strategy3Checks} Strategy 3 plans clean`);
  passCount += strategy3Checks - strategy3Fails;
  failCount += strategy3Fails;
}

// Tests 6 and 7 deleted: test-guard-mutants.ts test 4 covers carry-over comprehensively

console.log(`\n${failCount === 0 ? "✓" : "✗"} ${passCount}/${passCount + failCount} checks passed`);

if (failCount > 0) {
  process.exit(1);
}
