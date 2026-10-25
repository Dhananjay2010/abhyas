/**
 * Past-knee tier: lighter restrictions than current-knee.
 * 
 * Owner decisions:
 * 1. EXCLUDE: pistol/single-leg-squat variants, jumping/plyometric, sissy squats,
 *    walking and jumping lunges
 * 2. PREFER: knee-friendly primaries (goblet squat, box squat, leg press, split squat;
 *    dumbbell rear lunge or step-up over barbell lunge)
 * 3. Barbell back squat allowed in swaps but NOT default primary
 * 4. Squat swap list must include leg press and goblet squat when equipment allows
 * 5. No-injury and other injuries: IDENTICAL output to main
 * 
 *   npm run test:past-knee
 */
import { readFileSync } from "node:fs";
import { generateProgram, isEligible, score, hashString, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";
import { getPastKneeExcludedSlugs, getKneeFriendlyPrimaries } from "../src/lib/program/past-knee";
import { selectWarmup, type WarmupRow } from "../src/lib/program/warmup";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));
const baseline: Record<string, { plans: string[]; swaps: Record<string, string[]> }> = JSON.parse(readFileSync(__dirname + "/fixtures/past-knee-baseline.json", "utf8"));
const warmupFixture: WarmupRow[] = JSON.parse(readFileSync(__dirname + "/fixtures/warmups.json", "utf8"));
const byId = new Map(catalogue.map((e) => [e.id, e]));
const bySlug = new Map(catalogue.map((e) => [e.slug, e]));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "past-knee-test",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"],
    currentInjuryRegions: [],
    catalogue,
    ...overrides,
  };
}

console.log("\n1. Catalogue validation: all past-knee slugs exist");
{
  const excludedSlugs = Array.from(getPastKneeExcludedSlugs());
  const friendlySlugs = [...getKneeFriendlyPrimaries("squat"), ...getKneeFriendlyPrimaries("lunge")];
  
  // Explicit wired checks (must fail on removal)
  check("kettlebell-pistol-squat MUST be excluded", excludedSlugs.includes("kettlebell-pistol-squat"));
  check("weighted-sissy-squat MUST be excluded", excludedSlugs.includes("weighted-sissy-squat"));
  check("one-leg-barbell-squat MUST be excluded", excludedSlugs.includes("one-leg-barbell-squat"));
  check("lunge-sprint MUST be excluded", excludedSlugs.includes("lunge-sprint"));
  
  for (const slug of excludedSlugs) {
    const exists = bySlug.has(slug);
    if (!exists) {
      console.log(`  FAIL ${slug} missing from catalogue`);
      process.exit(1);
    }
    check(`${slug} in catalogue`, exists);
  }
  
  for (const slug of friendlySlugs) {
    const exists = bySlug.has(slug);
    if (!exists) {
      console.log(`  FAIL ${slug} missing from catalogue`);
      process.exit(1);
    }
    check(`${slug} in catalogue`, exists);
  }
}

console.log("\n2. Grid test: past-knee across dimensions");
{
  type Goal = "muscle_gain" | "strength" | "fat_loss" | "general_fitness";
  type Level = "beginner" | "intermediate" | "expert";
  type Track = "weights" | "bodyweight";
  
  const goals: Goal[] = ["muscle_gain", "strength", "fat_loss", "general_fitness"];
  const levels: Level[] = ["beginner", "intermediate", "expert"];
  const equipmentSets: Array<{ label: string; hasAll: boolean; ids: string[]; track: Track }> = [
    { label: "All", hasAll: true, ids: [], track: "weights" },
    { label: "Gym", hasAll: false, ids: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"], track: "weights" },
    { label: "Home", hasAll: false, ids: ["dumbbell", "kettlebell", "resistance_band", "pull_up_bar"], track: "weights" },
    { label: "BW", hasAll: false, ids: [], track: "bodyweight" },
  ];
  const dayCounts: number[] = [3, 4, 5];
  const sessionLengths: number[] = [45, 60];
  
  let totalPlans = 0;
  let plansWithExcluded = 0;
  let plansWithBarbellSquatPrimary = 0;
  let swapListsChecked = 0;
  let swapListsMissingLegPress = 0;
  let swapListsMissingGoblet = 0;
  
  // Explicit wired tests (must fail on b4845303)
  let plansWithKettlebellPistol = 0;
  let swapsWithKettlebellPistol = 0;
  
  const excludedSlugs = Array.from(getPastKneeExcludedSlugs());
  
  for (const goal of goals) {
    for (const level of levels) {
      for (const equip of equipmentSets) {
        for (const days of dayCounts) {
          for (const sessionMin of sessionLengths) {
            totalPlans++;
            
            const input = base({
              goal,
              level,
              daysPerWeek: days,
              hasAllEquipment: equip.hasAll,
              equipmentIds: equip.ids,
              primaryTrack: equip.track,
              pastKneeInjury: true,
              preferredSessionMinutes: sessionMin,
            });
            
            const plan = generateProgram(input);
            const exercises = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId))).filter((e): e is CandidateExercise => e !== undefined);
            
            // Check 1: No excluded slugs in plan
            const excluded = exercises.filter(e => excludedSlugs.includes(e.slug));
            if (excluded.length > 0) {
              plansWithExcluded++;
            }
            
            // Explicit check: kettlebell-pistol-squat never in plans
            if (exercises.some(e => e.slug === "kettlebell-pistol-squat")) {
              plansWithKettlebellPistol++;
            }
            
            // Check 2: Check for barbell back squat as FIRST squat primary in Lower/Leg days
            const lowerDays = plan.days.filter(d => 
              (d.focus === "lower" || d.focus === "legs" || d.focus === "full") &&
              d.exercises.length > 0
            );
            
            for (const day of lowerDays) {
              let foundFirstSquatPrimary = false;
              for (let i = 0; i < Math.min(4, day.exercises.length); i++) {
                const ex = byId.get(day.exercises[i].exerciseId);
                if (ex && (ex.movement_pattern === "squat" || ex.movement_pattern === "lunge")) {
                  if (!foundFirstSquatPrimary && ex.slug === "barbell-squat") {
                    plansWithBarbellSquatPrimary++;
                  }
                  foundFirstSquatPrimary = true;
                  break;
                }
              }
            }
            
            // Check 3: Swap lists for squat pattern exercises (weights track only)
            if (equip.track === "weights") {
              const squatEx = exercises.find(e => e.movement_pattern === "squat");
              if (squatEx && (equip.label === "All" || equip.label === "Gym")) {
                swapListsChecked++;
                
                const patterns = buildPatternList(squatEx.movement_pattern, input.currentInjuryRegions.includes("knee"));
                const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
                const pool = rawPool.filter(e => isEligible(e, input));
                
                const wantCompound = squatEx.mechanic === "compound";
                const ctx: AlternativesContext = {
                  level: input.level,
                  availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
                  injuryRegions: input.currentInjuryRegions,
                  pastKneeInjury: input.pastKneeInjury,
                  limit: 5,
                  scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0),
                  tieBreakFn: (slug) => hashString(`test:${slug}`),
                };
                
                const swaps = rankAlternatives(squatEx, pool, ctx);
                
                const hasLegPress = swaps.some(s => s.slug === "leg-press");
                const hasGoblet = swaps.some(s => s.slug === "goblet-squat");
                
                // Only check if the primary isn't already the leg press or goblet squat
                if (!hasLegPress && equip.ids.includes("leg_press") && squatEx.slug !== "leg-press") {
                  swapListsMissingLegPress++;
                }
                if (!hasGoblet && squatEx.slug !== "goblet-squat") {
                  swapListsMissingGoblet++;
                }
                
                // Explicit check: kettlebell-pistol-squat never in ranked swaps
                if (swaps.some(s => s.slug === "kettlebell-pistol-squat")) {
                  swapsWithKettlebellPistol++;
                }
              }
            }
          }
        }
      }
    }
  }
  
  check(`Generated ${totalPlans} past-knee plans`, totalPlans > 0);
  check(`No excluded exercises in any plan`, plansWithExcluded === 0, 
    plansWithExcluded > 0 ? `${plansWithExcluded} plans had excluded exercises` : "");
  check(`Barbell squat rarely primary for past-knee`, plansWithBarbellSquatPrimary === 0,
    `${plansWithBarbellSquatPrimary} plans had barbell squat as primary`);
  check(`Swap lists include leg press when available`, swapListsMissingLegPress === 0,
    swapListsMissingLegPress > 0 ? `${swapListsMissingLegPress}/${swapListsChecked} missing leg press` : "");
  check(`Swap lists include goblet squat`, swapListsMissingGoblet === 0,
    `${swapListsMissingGoblet}/${swapListsChecked} missing goblet squat`);
  
  // Explicit wired tests
  check(`kettlebell-pistol-squat NEVER in plans`, plansWithKettlebellPistol === 0,
    plansWithKettlebellPistol > 0 ? `${plansWithKettlebellPistol} plans had kettlebell-pistol-squat` : "");
  check(`kettlebell-pistol-squat NEVER in swaps`, swapsWithKettlebellPistol === 0,
    swapsWithKettlebellPistol > 0 ? `${swapsWithKettlebellPistol} swap lists had kettlebell-pistol-squat` : "");
    
  console.log(`    Checked ${totalPlans} plans and ${swapListsChecked} swap lists`);
}

console.log("\n2b. Warm-up test: walking-lunge, skipping-light, 'full depth' never appear for past-knee");
{
  type Track = "weights" | "bodyweight";
  type Muscle = "quads" | "glutes" | "hamstrings" | "chest" | "lats" | "front_delts";
  
  const tracks: Track[] = ["weights", "bodyweight"];
  const equipmentSets: Array<{ label: string; hasAll: boolean; ids: string[] }> = [
    { label: "All", hasAll: true, ids: [] },
    { label: "Gym", hasAll: false, ids: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"] },
    { label: "DB", hasAll: false, ids: ["dumbbell", "adjustable_bench"] },
    { label: "KB", hasAll: false, ids: ["kettlebell"] },
    { label: "BW", hasAll: false, ids: [] },
  ];
  const focusMuscles: Array<{ name: string; muscles: Muscle[] }> = [
    { name: "Lower", muscles: ["quads", "glutes", "hamstrings"] },
    { name: "Upper", muscles: ["chest", "lats", "front_delts"] },
    { name: "Full Body", muscles: ["quads", "chest", "lats"] },
  ];
  
  let warmupsChecked = 0;
  let warmupsWithWalkingLunge = 0;
  let warmupsWithSkippingLight = 0;
  let warmupsWithFullDepth = 0;
  
  for (const track of tracks) {
    for (const equip of equipmentSets) {
      for (const focus of focusMuscles) {
        warmupsChecked++;
        
        const warmups = selectWarmup({
          warmups: warmupFixture,
          trainingMuscles: focus.muscles,
          injuryRegions: [],
          prehabRegions: [],
          track,
          availableEquipment: equip.hasAll ? null : new Set(equip.ids),
          hasAllEquipment: equip.hasAll,
          pastKneeInjury: true,
        });
        
        const slugs = warmups.map(w => w.slug);
        if (slugs.includes("walking-lunge")) {
          warmupsWithWalkingLunge++;
        }
        if (slugs.includes("skipping-light")) {
          warmupsWithSkippingLight++;
        }
        
        // Check for "full depth" cue
        for (const w of warmups) {
          for (const instruction of w.instructions) {
            if (instruction.toLowerCase().includes("full depth")) {
              warmupsWithFullDepth++;
              break;
            }
          }
        }
      }
    }
  }
  
  check(`walking-lunge NEVER in warmups for past-knee`, warmupsWithWalkingLunge === 0,
    warmupsWithWalkingLunge > 0 ? `${warmupsWithWalkingLunge}/${warmupsChecked} had walking-lunge` : "");
  check(`skipping-light NEVER in warmups for past-knee`, warmupsWithSkippingLight === 0,
    warmupsWithSkippingLight > 0 ? `${warmupsWithSkippingLight}/${warmupsChecked} had skipping-light` : "");
  check(`"full depth" cues rewritten for past-knee`, warmupsWithFullDepth === 0,
    warmupsWithFullDepth > 0 ? `${warmupsWithFullDepth} warmups still had "full depth"` : "");
  
  console.log(`    Checked ${warmupsChecked} warmup profiles`);
}

console.log("\n3. Identity test: non-knee profiles produce identical output to main");
{
  type BodyRegion = "shoulder" | "wrist" | "lower_back" | "knee";
  const testCases: Array<{ name: string; currentInjuryRegions: BodyRegion[] }> = [
    { name: "none", currentInjuryRegions: [] },
    { name: "shoulder", currentInjuryRegions: ["shoulder"] },
    { name: "wrist", currentInjuryRegions: ["wrist"] },
    { name: "lower_back", currentInjuryRegions: ["lower_back"] },
  ];
  
  for (const testCase of testCases) {
    // Use exact same config as baseline generation: hasAllEquipment: true, pastKneeInjury: false
    // Use "baseline-gen" userId to match the baseline tiebreaker hashes
    const input: GeneratorInput = {
      userId: "baseline-gen",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 23,
      hasAllEquipment: true,
      equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"],
      currentInjuryRegions: testCase.currentInjuryRegions,
      pastKneeInjury: false,
      catalogue,
    };
    
    const plan = generateProgram(input);
    const exerciseIds = plan.days.flatMap(d => d.exercises.map(e => e.exerciseId)).sort();
    
    const baselinePlans = baseline[testCase.name].plans;
    check(`${testCase.name}: plans match main`, JSON.stringify(exerciseIds) === JSON.stringify(baselinePlans));
    
    // Check swap lists
    let swapsMatch = true;
    for (const day of plan.days) {
      for (const ex of day.exercises) {
        const currentEx = catalogue.find(e => e.id === ex.exerciseId);
        if (!currentEx) continue;
        
        const patterns = buildPatternList(currentEx.movement_pattern, input.currentInjuryRegions.includes("knee"));
        const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
        const pool = rawPool.filter(e => isEligible(e, input));
        
        const wantCompound = currentEx.mechanic !== "isolation";
        const ctx: AlternativesContext = {
          level: input.level,
          availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
          injuryRegions: input.currentInjuryRegions,
          pastKneeInjury: false,
          limit: 5,
          scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, false, 0),
          tieBreakFn: (slug) => hashString(`baseline:${slug}`),
        };
        
        const alternatives = rankAlternatives(currentEx, pool, ctx);
        const swapIds = alternatives.map(a => a.id).sort();
        const baselineSwaps = baseline[testCase.name].swaps[ex.exerciseId];
        
        if (JSON.stringify(swapIds) !== JSON.stringify(baselineSwaps)) {
          swapsMatch = false;
          break;
        }
      }
      if (!swapsMatch) break;
    }
    
    check(`${testCase.name}: swaps match main`, swapsMatch);
  }
}

console.log("\n4. Pinned QA case: Gym, Build muscle, Intermediate, 4 days, past-knee");
{
  const qaProfile = base({
    goal: "muscle_gain",
    level: "intermediate",
    daysPerWeek: 4,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"],
    pastKneeInjury: true,
    age: 30,
    bmi: 23,
    preferredSessionMinutes: 60,
  });
  
  const plan = generateProgram(qaProfile);
  const exercises = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId))).filter((e): e is CandidateExercise => e !== undefined);
  
  const excludedSlugs = Array.from(getPastKneeExcludedSlugs());
  const excluded = exercises.filter(e => excludedSlugs.includes(e.slug));
  check("QA: No pistol squats", !exercises.some(e => e.slug.includes("pistol")));
  check("QA: No walking lunges", !exercises.some(e => e.slug.includes("walking-lunge")));
  check("QA: No excluded exercises", excluded.length === 0, excluded.map(e => e.name).join(", "));
  
  // Check Lower days
  const lowerDays = plan.days.filter(d => d.focus === "lower");
  if (lowerDays.length > 0) {
    console.log(`    Found ${lowerDays.length} Lower days`);
    
    for (const day of lowerDays) {
      const dayExercises = day.exercises.map(e => byId.get(e.exerciseId)).filter((e): e is CandidateExercise => e !== undefined);
      const squatEx = dayExercises.find(e => e.movement_pattern === "squat");
      const lungeEx = dayExercises.find(e => e.movement_pattern === "lunge");
      
      if (squatEx) {
        const patterns = buildPatternList(squatEx.movement_pattern, false);
        const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
        const pool = rawPool.filter(e => isEligible(e, qaProfile));
        
        const wantCompound = squatEx.mechanic === "compound";
        const ctx: AlternativesContext = {
          level: qaProfile.level,
          availableEquipment: new Set(qaProfile.equipmentIds),
          injuryRegions: qaProfile.currentInjuryRegions,
          pastKneeInjury: qaProfile.pastKneeInjury,
          limit: 5,
          scoreFn: (e) => score(e, wantCompound, qaProfile.level, qaProfile.primaryTrack, qaProfile.pastKneeInjury, 0),
          tieBreakFn: (slug) => hashString(`qa:${slug}`),
        };
        
        const swaps = rankAlternatives(squatEx, pool, ctx);
        check(`QA: Squat swaps include leg press`, swaps.some(s => s.slug === "leg-press"));
        if (squatEx.slug !== "goblet-squat") {
          check(`QA: Squat swaps include goblet squat`, swaps.some(s => s.slug === "goblet-squat"));
        }
        check(`QA: No pistol in squat swaps`, !swaps.some(s => s.slug.includes("pistol")));
      }
      
      if (lungeEx) {
        const patterns = buildPatternList(lungeEx.movement_pattern, false);
        const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
        const pool = rawPool.filter(e => isEligible(e, qaProfile));
        
        const wantCompound = lungeEx.mechanic === "compound";
        const ctx: AlternativesContext = {
          level: qaProfile.level,
          availableEquipment: new Set(qaProfile.equipmentIds),
          injuryRegions: qaProfile.currentInjuryRegions,
          pastKneeInjury: qaProfile.pastKneeInjury,
          limit: 5,
          scoreFn: (e) => score(e, wantCompound, qaProfile.level, qaProfile.primaryTrack, qaProfile.pastKneeInjury, 0),
          tieBreakFn: (slug) => hashString(`qa:${slug}`),
        };
        
        const swaps = rankAlternatives(lungeEx, pool, ctx);
        check(`QA: No walking lunge in lunge swaps`, !swaps.some(s => s.slug.includes("walking-lunge")));
        check(`QA: No pistol in lunge swaps`, !swaps.some(s => s.slug.includes("pistol")));
      }
    }
  }
  
  // Test at 45 minutes too
  const qa45 = base({
    ...qaProfile,
    preferredSessionMinutes: 45,
  });
  
  const result45 = generateProgram(qa45);
  const exercises45 = result45.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId))).filter((e): e is CandidateExercise => e !== undefined);
  const excluded45 = exercises45.filter(e => excludedSlugs.includes(e.slug));
  check("QA 45m: No excluded exercises", excluded45.length === 0);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
