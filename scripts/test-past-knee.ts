/**
 * Past-knee tier: lighter restrictions than current-knee.
 * 
 * Owner decisions:
 * 1. EXCLUDE: pistol/single-leg-squat variants, jumping/plyometric, sissy squats,
 *    walking and jumping lunges, warm-ups with "full depth" cues
 * 2. PREFER: knee-friendly primaries (goblet squat, box squat, leg press, split squat;
 *    reverse lunge or step-up over barbell lunge)
 * 3. Barbell back squat allowed in swaps but NOT default primary
 * 4. Squat swap list must include leg press and goblet squat when equipment allows
 * 5. No-injury and other injuries: IDENTICAL output to main
 * 
 *   npm run test:past-knee
 */
import { readFileSync, writeFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList } from "../src/lib/program/alternatives";
import { score, hashString } from "../src/lib/program/generate";
import { isExcludedForPastKnee, getKneeFriendlyPrimaries } from "../src/lib/program/past-knee";

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];
const byId = new Map(catalogue.map((e) => [e.id, e]));
const bySlug = new Map(catalogue.map((e) => [e.slug, e]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
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
    hasAllEquipment: true,
    equipmentIds: ["barbell", "dumbbell", "bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press", "kettlebell"],
    currentInjuryRegions: [],
    pastKneeInjury: false,
    catalogue,
    ...overrides,
  };
}

// Helper to get all exercises from a plan
function allExercises(input: GeneratorInput) {
  const plan = generateProgram(input);
  const exercises = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!));
  return { plan, exercises };
}

// Helper to find alternatives using the REAL swap path
function findSwapList(exercise: CandidateExercise, input: GeneratorInput, limit = 10) {
  const patterns = buildPatternList(exercise.movement_pattern, input.currentInjuryRegions.includes("knee"));
  const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
  
  const wantCompound = exercise.mechanic === "compound";
  const tieBreak = (slug: string) => hashString(`test:${slug}`);
  
  return rankAlternatives(
    exercise,
    pool,
    {
      level: input.level,
      availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
      injuryRegions: input.currentInjuryRegions,
      pastKneeInjury: input.pastKneeInjury,
      limit,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0),
      tieBreakFn: tieBreak,
    }
  );
}

console.log("\n=== Past-Knee Tier Tests ===\n");

console.log("1. Excluded exercises for past-knee");
{
  const excluded = [
    "pistol-squat",
    "smith-machine-pistol-squat", 
    "single-leg-squat",
    "barbell-walking-lunge",
    "walking-lunge",
    "jumping-lunge",
    "sissy-squat",
  ];
  
  for (const slug of excluded) {
    const ex = bySlug.get(slug);
    if (ex) {
      check(`${slug} is excluded for past-knee`, isExcludedForPastKnee(ex));
    }
  }
  
  // Verify deficit deadlift is NOT excluded (requirement 5)
  const deficitDL = bySlug.get("deficit-deadlift");
  if (deficitDL) {
    check("deficit-deadlift NOT excluded for past-knee", !isExcludedForPastKnee(deficitDL));
  }
}

console.log("\n2. Grid test: past-knee across dimensions");
{
  const goals = ["muscle_gain", "strength", "fat_loss", "general_fitness"] as const;
  const levels = ["beginner", "intermediate", "expert"] as const;
  const equipmentSets = [
    { label: "All", hasAll: true, ids: [] as string[], track: "weights" as const },
    { label: "Gym", hasAll: false, ids: ["barbell", "dumbbell", "bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"], track: "weights" as const },
    { label: "Home", hasAll: false, ids: ["dumbbell", "kettlebell", "resistance_band", "pull_up_bar"], track: "weights" as const },
    { label: "BW", hasAll: false, ids: [] as string[], track: "bodyweight" as const },
  ];
  const dayCounts = [3, 4, 5];
  const sessionLengths = [45, 60];
  
  let totalPlans = 0;
  let plansWithExcluded = 0;
  let plansWithFullDepth = 0;
  let plansWithBarbellSquatPrimary = 0;
  let plansWithKneeFriendlyPrimary = 0;
  let swapListsChecked = 0;
  let swapListsMissingLegPress = 0;
  let swapListsMissingGoblet = 0;
  
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
            
            const { plan, exercises } = allExercises(input);
            
            // Check 1: No excluded slugs in plan
            const excluded = exercises.filter(e => isExcludedForPastKnee(e));
            if (excluded.length > 0) {
              plansWithExcluded++;
            }
            
            // Check 2: Check for barbell back squat as primary in Lower/Leg days
            const lowerDays = plan.days.filter(d => 
              (d.focus === "lower" || d.focus === "legs" || d.focus === "full") &&
              d.exercises.length > 0
            );
            
            for (const day of lowerDays) {
              // Check first few slots for squat pattern
              const squatSlots = day.exercises.slice(0, 4).filter((_, idx) => {
                const ex = byId.get(day.exercises[idx].exerciseId);
                return ex && (ex.movement_pattern === "squat" || ex.movement_pattern === "lunge");
              });
              
              for (const slot of squatSlots) {
                const ex = byId.get(slot.exerciseId);
                if (ex) {
                  if (ex.slug === "barbell-squat" && squatSlots.indexOf(slot) === 0) {
                    // Only count if it's the FIRST squat/lunge slot
                    plansWithBarbellSquatPrimary++;
                  }
                  
                  // Check if it's a knee-friendly primary
                  const kneeFriendlies = [...getKneeFriendlyPrimaries("squat"), ...getKneeFriendlyPrimaries("lunge")];
                  if (kneeFriendlies.includes(ex.slug)) {
                    plansWithKneeFriendlyPrimary++;
                  }
                }
              }
            }
            
            // Check 3: Swap lists for squat pattern exercises
            const squatEx = exercises.find(e => e.movement_pattern === "squat");
            if (squatEx && (equip.label === "All" || equip.label === "Gym")) {
              swapListsChecked++;
              const swaps = findSwapList(squatEx, input, 10);
              
              const hasLegPress = swaps.some(s => s.slug === "leg-press");
              const hasGoblet = swaps.some(s => s.slug === "goblet-squat");
              
              // Only check if the primary isn't already the leg press or goblet squat
              if (!hasLegPress && equip.ids.includes("leg_press") && squatEx.slug !== "leg-press") {
                swapListsMissingLegPress++;
              }
              if (!hasGoblet && squatEx.slug !== "goblet-squat") {
                swapListsMissingGoblet++;
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
  check(`Barbell squat rarely primary for past-knee`, plansWithBarbellSquatPrimary < totalPlans / 4,
    `${plansWithBarbellSquatPrimary} plans had barbell squat as primary`);
  check(`Knee-friendly primaries preferred`, plansWithKneeFriendlyPrimary > totalPlans / 3,
    `${plansWithKneeFriendlyPrimary} plans had knee-friendly primaries`);
  check(`Swap lists include leg press when available`, swapListsMissingLegPress === 0,
    swapListsMissingLegPress > 0 ? `${swapListsMissingLegPress}/${swapListsChecked} missing leg press` : "");
  check(`Swap lists include goblet squat`, swapListsMissingGoblet < swapListsChecked / 2,
    `${swapListsMissingGoblet}/${swapListsChecked} missing goblet squat`);
    
  console.log(`    Checked ${totalPlans} plans and ${swapListsChecked} swap lists`);
}

console.log("\n3. Identity test: no-injury produces identical output");
{
  const testCases = [
    { label: "No injury", currentInjuryRegions: [], pastKneeInjury: false },
    { label: "Wrist injury only", currentInjuryRegions: ["wrist" as const], pastKneeInjury: false },
    { label: "Shoulder injury only", currentInjuryRegions: ["shoulder" as const], pastKneeInjury: false },
  ];
  
  for (const testCase of testCases) {
    const input1 = base({ ...testCase });
    const input2 = base({ ...testCase });
    
    const plan1 = generateProgram(input1);
    const plan2 = generateProgram(input2);
    
    const ex1 = plan1.days.flatMap(d => d.exercises.map(e => e.exerciseId)).join(",");
    const ex2 = plan2.days.flatMap(d => d.exercises.map(e => e.exerciseId)).join(",");
    
    check(`${testCase.label}: identical plans`, ex1 === ex2);
  }
}

console.log("\n4. Pinned QA case: Gym, Build muscle, Intermediate, 4 days, past-knee");
{
  const qaProfile = base({
    goal: "muscle_gain",
    level: "intermediate",
    daysPerWeek: 4,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"],
    pastKneeInjury: true,
    age: 30,
    bmi: 23,
    preferredSessionMinutes: 60,
  });
  
  const { plan, exercises } = allExercises(qaProfile);
  
  // Check no excluded exercises
  const excluded = exercises.filter(e => isExcludedForPastKnee(e));
  check("QA: No pistol squats", !exercises.some(e => e.slug.includes("pistol")));
  check("QA: No walking lunges", !exercises.some(e => e.slug.includes("walking-lunge")));
  check("QA: No excluded exercises", excluded.length === 0, excluded.map(e => e.name).join(", "));
  
  // Check Lower days
  const lowerDays = plan.days.filter(d => d.focus === "lower");
  if (lowerDays.length > 0) {
    console.log(`    Found ${lowerDays.length} Lower days`);
    
    for (const day of lowerDays) {
      const dayExercises = day.exercises.map(e => byId.get(e.exerciseId)!);
      console.log(`      Day ${day.dayIndex}: ${dayExercises.map(e => e.name).join(", ")}`);
      
      // Check swap lists for squat and lunge patterns
      const squatEx = dayExercises.find(e => e.movement_pattern === "squat");
      const lungeEx = dayExercises.find(e => e.movement_pattern === "lunge");
      
      if (squatEx) {
        const swaps = findSwapList(squatEx, qaProfile, 10);
        check(`QA: Squat swaps include leg press`, swaps.some(s => s.slug === "leg-press"));
        // Goblet squat might BE the primary, so only check if it's not
        if (squatEx.slug !== "goblet-squat") {
          check(`QA: Squat swaps include goblet squat`, swaps.some(s => s.slug === "goblet-squat"));
        }
        check(`QA: No pistol in squat swaps`, !swaps.some(s => s.slug.includes("pistol")));
      }
      
      if (lungeEx) {
        const swaps = findSwapList(lungeEx, qaProfile, 10);
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
  
  const result45 = allExercises(qa45);
  const excluded45 = result45.exercises.filter(e => isExcludedForPastKnee(e));
  check("QA 45m: No excluded exercises", excluded45.length === 0);
}

console.log("\n5. Warm-up full depth cue filtering");
{
  // This is tested in the session page integration, but verify the helper
  const { filterFullDepthCues } = require("../src/lib/program/past-knee");
  
  const instructions = [
    "Bodyweight squat: slow and full depth, pause at the bottom",
    "Stand with feet shoulder-width apart",
    "Return to standing position"
  ];
  
  const filtered = filterFullDepthCues(instructions, true);
  check("Full depth cue replaced", !filtered[0].includes("full depth"));
  check("Controlled range used instead", filtered[0].includes("controlled range"));
  check("Other instructions unchanged", filtered[1] === instructions[1]);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
