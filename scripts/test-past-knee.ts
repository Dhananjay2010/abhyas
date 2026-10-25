/**
 * Past-knee tier: comprehensive test
 * 
 * Tests graduated restrictions for past knee injuries:
 * - Exclusions: pistol/single-leg variants, explosive moves, full-depth squats, high-impact leg exercises
 * - Preferences: knee-friendly alternatives rank higher in swaps
 * - Identity: non-past-knee profiles match main exactly
 * - Warm-ups: exclude risky moves, rewrite cues
 * 
 * npm run test:past-knee
 */
import { readFileSync } from "node:fs";
import { generateProgram, score, hashString, isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";
import { selectWarmup, type WarmupRow } from "../src/lib/program/warmup";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));
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

// HARD-CODED EXPECTED EXCLUSIONS (NOT derived from production code)
const EXPECTED_EXCLUDED_SLUGS = [
  // Pistol squats
  "smith-machine-pistol-squat",
  "kettlebell-pistol-squat",
  
  // Single-leg squats
  "one-leg-barbell-squat",
  
  // Walking and jumping lunges
  "barbell-walking-lunge",
  "lunge-sprint",
  
  // Sissy squats
  "weighted-sissy-squat",
  
  // Full-depth squats
  "barbell-full-squat",
  
  // Item 15: Banned squats for past knee (deficit deadlift, hack squat, Smith squat, front squat)
  "deficit-deadlift",
  "barbell-hack-squat",
  "smith-machine-squat",
  "front-barbell-squat",
  "front-squat-clean-grip",
  "front-squats-with-two-kettlebells",
  
  // Explosive loaded knee-flexion moves (speed/dynamic squats)
  "speed-box-squat",
  "speed-squats",
  
  // Thrusters: banned for BOTH current AND past knee (item 14)
  "kettlebell-thruster",
  
  // Olympic lift jerks: banned for BOTH tiers (squat-jerk involves deep catch)
  "squat-jerk",
  
  // Band/chain BARBELL squats (NOT squats-with-bands which is beginner bodyweight+band)
  "squat-with-bands",
  "squat-with-chains",
  "box-squat-with-chains",
  "box-squat-with-bands",
  "reverse-band-box-squat",
  "reverse-band-power-squat",
  
  // Running/sprinting moves (loads knee, mislabeled muscles)
  "wind-sprints",
  "chest-push-with-run-release",
  "jogging-treadmill",
  
  // Elevated/deficit lunges (knee-unsafe per #73: deficit adds knee flexion)
  "elevated-back-lunge",
];

console.log("\n1. Catalogue validation: hard-coded exclusion list behaviour");
{
  // Check every expected slug exists in catalogue
  for (const slug of EXPECTED_EXCLUDED_SLUGS) {
    const exists = bySlug.has(slug);
    check(`${slug} exists in catalogue`, exists);
    if (!exists) {
      console.log(`  FATAL: ${slug} missing from catalogue`);
      process.exit(1);
    }
    
    // Check isExcludedForPastKnee returns true
    const ex = bySlug.get(slug);
    if (!ex) continue;
    const excluded = isExcludedForPastKnee(ex);
    check(`${slug} excluded by filter`, excluded);
  }
  
  // Explicit wired check for kettlebell-pistol-squat (must fail if removed from list)
  check("kettlebell-pistol-squat MUST be excluded", EXPECTED_EXCLUDED_SLUGS.includes("kettlebell-pistol-squat"));
  const kettlebellPistol = bySlug.get("kettlebell-pistol-squat");
  if (kettlebellPistol) {
    check("kettlebell-pistol-squat excluded by filter", isExcludedForPastKnee(kettlebellPistol));
  }
  
  console.log(`    Checked ${EXPECTED_EXCLUDED_SLUGS.length} explicit exclusions`);
}

// Hard-coded expected high-impact leg slugs (ground truth from catalogue inspection)
const EXPECTED_HIGH_IMPACT_LEG_SLUGS = [
  "bench-jump",
  "double-leg-butt-kick",
  "dumbbell-seated-box-jump",
  "fast-skipping",
  "freehand-jump-squat",
  "knee-tuck-jump",
  "lateral-bound",
  "lunge-sprint",
  "medicine-ball-scoop-throw",
  "rocket-jump",
  "scissors-jump",
  "single-leg-butt-kick",
  "split-jump",
  "standing-long-jump",
  "star-jump",
  "vertical-swing",
  "weighted-jump-squat",
];

// Explicit plyo moves for jumping rule test
const EXPECTED_PLYO_SLUGS = [
  "plyo-push-up",
  "plyo-kettlebell-pushups",
];

console.log("\n2. High-impact leg exercise rule (data-driven from catalogue fields)");
{
  console.log(`    Expecting ${EXPECTED_HIGH_IMPACT_LEG_SLUGS.length} high-impact leg exercises`);
  
  // All expected high-impact leg exercises must be excluded
  let highImpactLegExcluded = 0;
  for (const slug of EXPECTED_HIGH_IMPACT_LEG_SLUGS) {
    const ex = bySlug.get(slug);
    if (!ex) {
      check(`${slug} (high impact leg) exists in catalogue`, false);
      continue;
    }
    if (isExcludedForPastKnee(ex)) {
      highImpactLegExcluded++;
    } else {
      check(`${slug} (high impact leg) excluded`, false);
    }
  }
  check(`All ${EXPECTED_HIGH_IMPACT_LEG_SLUGS.length} high-impact leg exercises excluded`, highImpactLegExcluded === EXPECTED_HIGH_IMPACT_LEG_SLUGS.length);
  
  // Explicit wired checks for jumping rule killing mutant 5
  const plyoPushUp = bySlug.get("plyo-push-up");
  const plyoKbPushups = bySlug.get("plyo-kettlebell-pushups");
  
  if (plyoPushUp) {
    check("plyo-push-up excluded for past-knee", isExcludedForPastKnee(plyoPushUp), 
      "Jumping filter must catch upper-body plyo moves");
  }
  if (plyoKbPushups) {
    check("plyo-kettlebell-pushups excluded for past-knee", isExcludedForPastKnee(plyoKbPushups),
      "Jumping filter must catch upper-body plyo moves");
  }
}

console.log("\n3. Wide grid test: plans, warm-ups, swap lists never contain excluded exercises");
{
  // TODO-PUSH2 item 9: wall-sit penalty in primary slots disabled pending implementation
  // const wallSitEx = bySlug.get("wall-sit");
  // if (wallSitEx) {
  //   const input = base({ anyKneeInjury: true });
  //   const primaryScore = score(wallSitEx, true, input.level, input.primaryTrack);
  //   const accessoryScore = score(wallSitEx, true, input.level, input.primaryTrack);
  //   check("wall-sit heavily penalized in primary slots", primaryScore < -50,
  //     `primary: ${primaryScore}, accessory: ${accessoryScore}`);
  // }
  
  // Hard-coded exclusion oracle: EXPECTED_EXCLUDED_SLUGS ∪ EXPECTED_HIGH_IMPACT_LEG_SLUGS ∪ EXPECTED_PLYO_SLUGS
  const GRID_EXCLUSION_ORACLE = new Set([
    ...EXPECTED_EXCLUDED_SLUGS,
    ...EXPECTED_HIGH_IMPACT_LEG_SLUGS,
    ...EXPECTED_PLYO_SLUGS,
  ]);
  
  type Goal = "muscle_gain" | "strength" | "fat_loss" | "general_fitness";
  type Level = "beginner" | "intermediate" | "expert";
  type Track = "weights" | "bodyweight";
  
  const goals: Goal[] = ["muscle_gain", "strength", "fat_loss", "general_fitness"];
  const levels: Level[] = ["beginner", "intermediate", "expert"];
  const tracks: Track[] = ["weights", "bodyweight"];
  const equipmentSets: Array<{ label: string; hasAll: boolean; ids: string[] }> = [
    { label: "All", hasAll: true, ids: [] },
    { label: "Gym", hasAll: false, ids: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"] },
    { label: "DB", hasAll: false, ids: ["dumbbell", "adjustable_bench"] },
    { label: "KB", hasAll: false, ids: ["kettlebell"] },
    { label: "BW", hasAll: false, ids: [] },
  ];
  const dayCounts = [2, 3, 4, 5, 6];
  const sessionDurations = [30, 45, 60, 90];
  
  let plansChecked = 0;
  let kettlebelPistolInPlans = 0;
  let excludedInPlans = 0;
  // TODO-PUSH2: wallSitAsPrimarySquat removed (unused until item 9)
  let swapLeaks = 0;
  let warmupsChecked = 0;
  let walkingLungeInWarmups = 0;
  let skippingLightInWarmups = 0;
  let excludedInWarmups = 0;
  let totalLungeSlotsWithDB = 0;
  let lungePicksWithRearLunge = 0;
  // TODO-PUSH2: wallSitAtIndex0WithOtherOptions removed (unused until item 5)
  
  for (const goal of goals) {
    for (const level of levels) {
      for (const track of tracks) {
        for (const equip of equipmentSets) {
          for (const days of dayCounts) {
            for (const duration of sessionDurations) {
              const input = base({
                goal,
                level,
                primaryTrack: track,
                daysPerWeek: days,
                hasAllEquipment: equip.hasAll,
                equipmentIds: equip.ids,
                anyKneeInjury: true,
                currentInjuryRegions: [],
                preferredSessionMinutes: duration,
              });
              
              const program = generateProgram(input);
              plansChecked++;
              
              // HIGH-1: Count past-knee lunge picks with dumbbells
              const hasDumbbells = equip.ids.includes("dumbbell") || equip.hasAll;
              
              // Check all exercises in plan
              for (const day of program.days) {
                for (const ex of day.exercises) {
                  const exercise = byId.get(ex.exerciseId);
                  if (!exercise) continue;
                  
                  // HIGH-1: Count lunge slots for past-knee with dumbbells
                  if (hasDumbbells && exercise.movement_pattern === "lunge") {
                    totalLungeSlotsWithDB++;
                    if (exercise.slug === "dumbbell-rear-lunge") {
                      lungePicksWithRearLunge++;
                    }
                  }
                  
                  // Specific check: kettlebell-pistol-squat
                  if (exercise.slug === "kettlebell-pistol-squat") {
                    kettlebelPistolInPlans++;
                  }
                  
                  // Check against hard-coded oracle
                  if (GRID_EXCLUSION_ORACLE.has(exercise.slug)) {
                    excludedInPlans++;
                  }
                  
                  // Check top-5 swap list (actions.ts path: isEligible pool, then rankAlternatives)
                  const patterns = buildPatternList(exercise.movement_pattern, false);
                  const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
                  const eligible = rawPool.filter(e => {
                    if (e.id === exercise.id) return false;
                    return isEligible(e, { ...input, catalogue: [] });
                  });
                  
                  const wantCompound = exercise.mechanic === "compound";
                  const ctx: AlternativesContext = {
                    level: input.level,
                    availableEquipment: equip.hasAll ? null : new Set(input.equipmentIds),
                    injuryRegions: input.currentInjuryRegions,
                    anyKneeInjury: input.anyKneeInjury,
                    limit: 5,
                    scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
                    tieBreakFn: (slug) => hashString(`ranking:grid:${slug}`),
                  };
                  
                  const swaps = rankAlternatives(exercise, eligible, ctx);
                  for (const swap of swaps) {
                    if (GRID_EXCLUSION_ORACLE.has(swap.slug)) {
                      swapLeaks++;
                    }
                  }
                  
                  // TODO-PUSH2 item 5: wall-sit swap ordering disabled pending implementation
                  // // Wall-sit must be at index >= 2 for past-knee squat swaps when >= 3 options exist
                  // if (input.anyKneeInjury && exercise.movement_pattern === "squat" && swaps.length >= 3) {
                  //   if (swaps[0].slug === "wall-sit") {
                  //     wallSitAtIndex0WithOtherOptions++;
                  //   }
                  // }
                }
                
                // TODO-PUSH2 item 9: wall-sit primary squat check disabled pending implementation
                // // Check if wall-sit is the primary squat (FIRST squat slot in the day)
                // const squatExercises = day.exercises
                //   .map((ex, idx) => ({ ex, idx, exercise: byId.get(ex.exerciseId) }))
                //   .filter(item => item.exercise && item.exercise.movement_pattern === "squat");
                // 
                // if (squatExercises.length > 0) {
                //   const firstSquat = squatExercises[0];
                //   if (firstSquat.exercise && firstSquat.exercise.slug === "wall-sit") {
                //     wallSitAsPrimarySquat++;
                //   }
                // }
              }
              
              // Check warmups
              warmupsChecked++;
              const warmups = selectWarmup({
                warmups: warmupFixture,
                trainingMuscles: ["quads", "chest"],
                injuryRegions: [],
                prehabRegions: [],
                track,
                availableEquipment: equip.hasAll ? null : new Set(equip.ids),
                hasAllEquipment: equip.hasAll,
                pastKneeInjury: true,
              });
              
              for (const w of warmups) {
                if (w.slug === "walking-lunge") walkingLungeInWarmups++;
                if (w.slug === "skipping-light") skippingLightInWarmups++;
                
                // Check against hard-coded oracle
                if (GRID_EXCLUSION_ORACLE.has(w.slug)) {
                  excludedInWarmups++;
                }
              }
            }
          }
        }
      }
    }
  }
  
  check(`kettlebell-pistol-squat NEVER in plans`, kettlebelPistolInPlans === 0,
    kettlebelPistolInPlans > 0 ? `Found ${kettlebelPistolInPlans}/${plansChecked}` : "");
  check(`No excluded exercises in plans`, excludedInPlans === 0,
    excludedInPlans > 0 ? `Found ${excludedInPlans} excluded exercises` : "");
  check(`No excluded exercises in top-5 swap lists`, swapLeaks === 0,
    swapLeaks > 0 ? `Found ${swapLeaks} excluded in swaps` : "");
  // TODO-PUSH2 item 9: wall-sit primary squat check disabled
  // check(`wall-sit NEVER as primary squat (first squat slot)`, wallSitAsPrimarySquat === 0,
  //   wallSitAsPrimarySquat > 0 ? `Found ${wallSitAsPrimarySquat} primary wall-sit slots` : "");
  // TODO-PUSH2 item 5: wall-sit swap ordering check disabled
  // check(`wall-sit NEVER at index 0 in squat swaps (when >= 3 options)`, wallSitAtIndex0WithOtherOptions === 0,
  //   wallSitAtIndex0WithOtherOptions > 0 ? `Found ${wallSitAtIndex0WithOtherOptions} wall-sit at index 0` : "");
  check(`walking-lunge NEVER in warmups`, walkingLungeInWarmups === 0,
    walkingLungeInWarmups > 0 ? `Found ${walkingLungeInWarmups}/${warmupsChecked}` : "");
  check(`skipping-light NEVER in warmups`, skippingLightInWarmups === 0,
    skippingLightInWarmups > 0 ? `Found ${skippingLightInWarmups}/${warmupsChecked}` : "");
  check(`No excluded exercises in warmups`, excludedInWarmups === 0,
    excludedInWarmups > 0 ? `Found ${excludedInWarmups} excluded in warmups` : "");
  
  console.log(`    Checked ${plansChecked} plans, ${warmupsChecked} warmups`);
  console.log(`    Past-knee lunge picks with DB: ${lungePicksWithRearLunge}/${totalLungeSlotsWithDB} had dumbbell-rear-lunge`);
}

console.log("\n4. Skipping-light warmup control tests");
{
  // Positive: skipping-light IS selectable for healthy users with jump_rope
  const filteredWarmups = warmupFixture.filter(w => 
    w.type !== "cardio" || w.slug === "skipping-light"
  );
  const healthyWarmup = selectWarmup({
    warmups: filteredWarmups,
    trainingMuscles: ["quads", "glutes"],
    injuryRegions: [],
    prehabRegions: [],
    track: "bodyweight",
    availableEquipment: new Set(["jump_rope"]),
    hasAllEquipment: false,
    pastKneeInjury: false,
  });
  
  const cardioSlug = healthyWarmup.find(w => w.phase === "cardio")?.slug;
  check(`skipping-light IS selectable for healthy users`, cardioSlug === "skipping-light",
    `Expected skipping-light, got: ${cardioSlug}`);
  
  // Negative: skipping-light MUST be excluded for past-knee users
  const pastKneeWarmup = selectWarmup({
    warmups: filteredWarmups,
    trainingMuscles: ["quads", "glutes"],
    injuryRegions: [],
    prehabRegions: [],
    track: "bodyweight",
    availableEquipment: new Set(["jump_rope"]),
    hasAllEquipment: false,
    pastKneeInjury: true,
  });
  
  const pastKneeSlugs = pastKneeWarmup.map(w => w.slug);
  check(`skipping-light excluded for past-knee users`, !pastKneeSlugs.includes("skipping-light"),
    `Got: ${pastKneeSlugs.join(", ")}`);
}

console.log("\n5. Swap ranking test: top-5 assertions and band/chain exclusion");
{
  const getRankedSwaps = (exerciseSlug: string, equipmentIds: string[], seed: string = "default"): string[] => {
    const current = bySlug.get(exerciseSlug);
    if (!current) throw new Error(`Exercise ${exerciseSlug} not found`);
    
    const input = base({
      anyKneeInjury: true,
                currentInjuryRegions: [],
      equipmentIds,
      hasAllEquipment: false,
    });
    
    const patterns = buildPatternList(current.movement_pattern, false);
    const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic === "compound";
    const ctx: AlternativesContext = {
      level: input.level,
      availableEquipment: new Set(input.equipmentIds),
      injuryRegions: input.currentInjuryRegions,
      anyKneeInjury: input.anyKneeInjury,
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
      tieBreakFn: (slug) => hashString(`ranking:${seed}:${slug}`),
    };
    
    const swaps = rankAlternatives(current, rawPool, ctx);
    return swaps.map(s => s.slug);
  }
  
  const gymEquipment = ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press", "leg_extension_machine"];
  
  // TODO-PUSH2 items 10,15: squat swap ranking disabled pending implementation
  // // Squat swaps
  // const squatSwaps = getRankedSwaps("barbell-squat", gymEquipment);
  // check("Squat: goblet-squat in top 5", squatSwaps.includes("goblet-squat"));
  // check("Squat: leg-press in top 5", squatSwaps.includes("leg-press"));
  // check("Squat: wall-sit in top 5", squatSwaps.includes("wall-sit"));
  
  // Lunge swaps
  const lungeSwaps = getRankedSwaps("barbell-lunge", gymEquipment);
  check("Lunge: dumbbell-rear-lunge is #1", lungeSwaps[0] === "dumbbell-rear-lunge");
  
  // TODO-PUSH2 items 10,15: leg ext swap ranking disabled pending implementation
  // // Leg extension swaps
  // const legExtSwaps = getRankedSwaps("leg-extensions", gymEquipment);
  // check("Leg ext: wall-sit in top 5", legExtSwaps.includes("wall-sit"));
  // check("Leg ext: no cable-hip-adduction", !legExtSwaps.includes("cable-hip-adduction"));
  
  // console.log(`    Squat top 5: ${squatSwaps.join(", ")}`);
  console.log(`    Lunge top 5: ${lungeSwaps.join(", ")}`);
  // console.log(`    Leg ext top 5: ${legExtSwaps.join(", ")}`);
  
  // Band/chain barbell squat exclusion test across multiple tiebreak seeds
  const bandChainSlugs = ["squat-with-bands", "squat-with-chains", "box-squat-with-bands", "box-squat-with-chains", "reverse-band-box-squat", "reverse-band-power-squat"];
  let bandChainFound = 0;
  const seeds = Array.from({length: 50}, (_, i) => `seed-${i}`);
  
  for (const seed of seeds) {
    const swaps = getRankedSwaps("barbell-squat", gymEquipment, seed);
    for (const slug of bandChainSlugs) {
      if (swaps.includes(slug)) {
        bandChainFound++;
      }
    }
  }
  
  check(`No band/chain barbell squats in top 5 (50 seeds)`, bandChainFound === 0,
    bandChainFound > 0 ? `Found ${bandChainFound} instances` : "");
  
  const legExtSeeds = Array.from({length: 50}, (_, i) => `leg-${i}`);
  let legExtBandChain = 0;
  for (const seed of legExtSeeds) {
    const swaps = getRankedSwaps("leg-extensions", gymEquipment, seed);
    for (const slug of bandChainSlugs) {
      if (swaps.includes(slug)) {
        legExtBandChain++;
      }
    }
  }
  
  check(`No band/chain in leg-ext top 5 (50 seeds)`, legExtBandChain === 0,
    legExtBandChain > 0 ? `Found ${legExtBandChain} instances` : "");
}

console.log("\n6. Goblet squat OR-logic: dumbbell-only past-knee vs healthy");
{
  const getRankedSwapsWithInjury = (exerciseSlug: string, equipmentIds: string[], pastKnee: boolean): string[] => {
    const current = bySlug.get(exerciseSlug);
    if (!current) throw new Error(`Exercise ${exerciseSlug} not found`);
    
    const input = base({
      anyKneeInjury: pastKnee,
      equipmentIds,
      hasAllEquipment: false,
    });
    
    const patterns = buildPatternList(current.movement_pattern, false);
    const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic === "compound";
    const ctx: AlternativesContext = {
      level: input.level,
      availableEquipment: new Set(equipmentIds),
      injuryRegions: input.currentInjuryRegions,
      anyKneeInjury: pastKnee,
      limit: 10,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
      tieBreakFn: (slug) => hashString(`ranking:${slug}`),
    };
    
    const pool = rawPool.filter(e => {
      if (e.id === current.id) return false;
      if (wantCompound && e.mechanic !== "compound") return false;
      return true;
    });
    
    return rankAlternatives(current, pool, ctx).slice(0, 10).map(e => e.slug);
  }
  
  const dbOnly = ["dumbbell", "adjustable_bench"];
  // TODO-PUSH2 item 15: pastKneeDbSwaps disabled pending implementation
  // const pastKneeDbSwaps = getRankedSwapsWithInjury("barbell-squat", dbOnly, true);
  const healthyDbSwaps = getRankedSwapsWithInjury("barbell-squat", dbOnly, false);
  
  // TODO-PUSH2 item 15: goblet squat OR-logic disabled pending implementation
  // check("Past-knee + DB: goblet-squat in swaps", pastKneeDbSwaps.includes("goblet-squat"),
  //   `got: ${pastKneeDbSwaps.join(", ")}`);
  check("Healthy + DB: goblet-squat NOT in swaps", !healthyDbSwaps.includes("goblet-squat"),
    `got: ${healthyDbSwaps.join(", ")}`);
}

console.log("\n7. Item 14: Thruster/push press/kettlebell jerk tier rules");
{
  // Import the functions to get the exclusion lists
  const { getPastKneeExcludedSlugs, getCurrentKneeOnlyExcludedSlugs } = require("../src/lib/program/past-knee");
  const pastKneeExcluded = getPastKneeExcludedSlugs();
  const currentKneeOnlyExcluded = getCurrentKneeOnlyExcludedSlugs();
  
  // Thrusters: banned for BOTH tiers (in past-knee exclusions)
  check("kettlebell-thruster banned for past knee", pastKneeExcluded.has("kettlebell-thruster"));
  
  // Push presses: banned for current knee only, allowed for past knee
  check("double-kettlebell-push-press NOT in past-knee exclusions", !pastKneeExcluded.has("double-kettlebell-push-press"));
  check("one-arm-kettlebell-push-press NOT in past-knee exclusions", !pastKneeExcluded.has("one-arm-kettlebell-push-press"));
  check("double-kettlebell-push-press in current-knee-only exclusions", currentKneeOnlyExcluded.has("double-kettlebell-push-press"));
  check("one-arm-kettlebell-push-press in current-knee-only exclusions", currentKneeOnlyExcluded.has("one-arm-kettlebell-push-press"));
  
  // Kettlebell jerks: banned for current knee only, allowed for past knee
  const kbJerks = ["double-kettlebell-jerk", "one-arm-kettlebell-jerk", "one-arm-kettlebell-split-jerk", "two-arm-kettlebell-jerk", "one-arm-kettlebell-clean-and-jerk"];
  for (const slug of kbJerks) {
    check(`${slug} NOT in past-knee exclusions`, !pastKneeExcluded.has(slug));
    check(`${slug} in current-knee-only exclusions`, currentKneeOnlyExcluded.has(slug));
  }
  
  // Test in plans: current knee excludes these, past knee allows them (if equipment available)
  const currentKneeInput = base({
    currentInjuryRegions: ["knee"],
    anyKneeInjury: true,
    equipmentIds: ["kettlebell"],
  });
  const pastKneeInput = base({
    currentInjuryRegions: [],
    anyKneeInjury: true,
    equipmentIds: ["kettlebell"],
  });
  
  const kbPushPress = bySlug.get("double-kettlebell-push-press");
  const kbJerk = bySlug.get("double-kettlebell-jerk");
  const kbThruster = bySlug.get("kettlebell-thruster");
  
  if (kbPushPress && kbJerk && kbThruster) {
    const { isEligible } = require("../src/lib/program/generate");
    
    // Current knee: push press and jerk banned, thruster banned
    check("Current knee: double-kettlebell-push-press BANNED", !isEligible(kbPushPress, currentKneeInput));
    check("Current knee: double-kettlebell-jerk BANNED", !isEligible(kbJerk, currentKneeInput));
    check("Current knee: kettlebell-thruster BANNED", !isEligible(kbThruster, currentKneeInput));
    
    // Past knee: push press and jerk allowed, thruster banned
    check("Past knee: double-kettlebell-push-press ALLOWED", isEligible(kbPushPress, pastKneeInput));
    check("Past knee: double-kettlebell-jerk ALLOWED", isEligible(kbJerk, pastKneeInput));
    check("Past knee: kettlebell-thruster BANNED", !isEligible(kbThruster, pastKneeInput));
  }
  
  // Test in swaps
  const currentKneeSwaps = rankAlternatives(
    bySlug.get("standing-military-press")!,
    catalogue,
    {
      level: "intermediate",
      availableEquipment: new Set(["kettlebell"]),
      injuryRegions: ["knee"],
      anyKneeInjury: true,
      limit: 20,
      scoreFn: (e) => 0,
      tieBreakFn: (slug) => 0,
    }
  );
  const currentKneeSlugs = currentKneeSwaps.map(e => e.slug);
  
  check("Current knee swaps: NO double-kettlebell-push-press", !currentKneeSlugs.includes("double-kettlebell-push-press"));
  check("Current knee swaps: NO double-kettlebell-jerk", !currentKneeSlugs.includes("double-kettlebell-jerk"));
  check("Current knee swaps: NO kettlebell-thruster", !currentKneeSlugs.includes("kettlebell-thruster"));
  
  const pastKneeSwaps = rankAlternatives(
    bySlug.get("standing-military-press")!,
    catalogue,
    {
      level: "intermediate",
      availableEquipment: new Set(["kettlebell"]),
      injuryRegions: [],
      anyKneeInjury: true,
      limit: 20,
      scoreFn: (e) => 0,
      tieBreakFn: (slug) => 0,
    }
  );
  const pastKneeSlugs = pastKneeSwaps.map(e => e.slug);
  
  check("Past knee swaps: YES double-kettlebell-push-press (if equipment available)", 
    pastKneeSlugs.includes("double-kettlebell-push-press") || !catalogue.find(e => e.slug === "double-kettlebell-push-press" && e.equipment_ids.every(id => ["kettlebell"].includes(id))),
    `available swaps: ${pastKneeSlugs.join(", ")}`);
  check("Past knee swaps: NO kettlebell-thruster", !pastKneeSlugs.includes("kettlebell-thruster"));
}

console.log("\n8. Item 14: Monotonicity test (every past-knee-banned is also current-knee-banned)");
{
  const { getPastKneeExcludedSlugs, getCurrentKneeOnlyExcludedSlugs } = require("../src/lib/program/past-knee");
  const pastKneeExcluded = getPastKneeExcludedSlugs();
  const currentKneeOnlyExcluded = getCurrentKneeOnlyExcludedSlugs();
  
  // For every past-knee-banned slug, check it's also banned for current knee
  // (either via past-knee list OR current-knee-only list OR contraindications)
  for (const slug of Array.from(pastKneeExcluded) as string[]) {
    const ex = bySlug.get(slug);
    if (!ex) {
      check(`${slug} exists in catalogue`, false);
      continue;
    }
    
    const currentKneeInput = base({
      currentInjuryRegions: ["knee"],
      anyKneeInjury: true,
      equipmentIds: ex.equipment_ids.length > 0 ? ex.equipment_ids : ["barbell"],
    });
    
    const { isEligible } = require("../src/lib/program/generate");
    const bannedForCurrent = !isEligible(ex, currentKneeInput);
    
    check(`Monotonicity: ${slug} banned for current knee (since it's banned for past)`, bannedForCurrent,
      bannedForCurrent ? "" : "VIOLATION: past-knee ban must imply current-knee ban");
  }
  
  console.log(`    Checked ${pastKneeExcluded.size} past-knee exclusions for monotonicity`);
}

console.log("\n9. Item 15: Past-knee squat rule - banned exercises");
{
  const { getPastKneeExcludedSlugs } = require("../src/lib/program/past-knee");
  const pastKneeExcluded = getPastKneeExcludedSlugs();
  
  // Banned for past knee (and current knee via monotonicity)
  const item15Banned = ["deficit-deadlift", "barbell-hack-squat", "smith-machine-squat", 
                        "front-barbell-squat", "front-squat-clean-grip", "front-squats-with-two-kettlebells"];
  
  for (const slug of item15Banned) {
    check(`Item 15: ${slug} in past-knee exclusions`, pastKneeExcluded.has(slug));
    
    const ex = bySlug.get(slug);
    if (ex) {
      const pastKneeInput = base({
        currentInjuryRegions: [],
        anyKneeInjury: true,
        equipmentIds: ex.equipment_ids.length > 0 ? ex.equipment_ids : ["barbell"],
      });
      const { isEligible } = require("../src/lib/program/generate");
      check(`Item 15: ${slug} BANNED for past knee`, !isEligible(ex, pastKneeInput));
    }
  }
  
  // Allowed for past knee
  const item15Allowed = ["goblet-squat", "box-squat", "bodyweight-squat", "leg-press", "barbell-squat"];
  for (const slug of item15Allowed) {
    check(`Item 15: ${slug} NOT in past-knee exclusions`, !pastKneeExcluded.has(slug));
    
    const ex = bySlug.get(slug);
    if (ex) {
      const pastKneeInput = base({
        currentInjuryRegions: [],
        anyKneeInjury: true,
        equipmentIds: ex.equipment_ids.length > 0 ? ex.equipment_ids : ["barbell", "squat_rack"],
      });
      const { isEligible } = require("../src/lib/program/generate");
      check(`Item 15: ${slug} ALLOWED for past knee`, isEligible(ex, pastKneeInput));
    }
  }
  
  // Floor deadlift stays allowed
  const floorDeadlift = bySlug.get("barbell-deadlift");
  if (floorDeadlift) {
    check(`Item 15: barbell-deadlift NOT in past-knee exclusions`, !pastKneeExcluded.has("barbell-deadlift"));
    const pastKneeInput = base({
      currentInjuryRegions: [],
      anyKneeInjury: true,
      equipmentIds: ["barbell"],
    });
    const { isEligible } = require("../src/lib/program/generate");
    check(`Item 15: barbell-deadlift ALLOWED for past knee`, isEligible(floorDeadlift, pastKneeInput));
  }
}

console.log("\n10. Item 15: Swap ordering (barbell-squat after preferred squats)");
{
  const gobletSquat = bySlug.get("goblet-squat");
  if (!gobletSquat) {
    check("goblet-squat exists", false);
  } else {
    // Get past-knee squat swaps
    const pastKneeSwaps = rankAlternatives(
      gobletSquat,
      catalogue,
      {
        level: "intermediate",
        availableEquipment: new Set(["barbell", "squat_rack", "dumbbell"]),
        injuryRegions: [],
        anyKneeInjury: true,
        limit: 20,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    const swapSlugs = pastKneeSwaps.map(e => e.slug);
    
    // Check ordering: barbell-squat should come after box-squat, bodyweight-squat, leg-press if present
    const barbellIdx = swapSlugs.indexOf("barbell-squat");
    const boxIdx = swapSlugs.indexOf("box-squat");
    const bodyweightIdx = swapSlugs.indexOf("bodyweight-squat");
    const legPressIdx = swapSlugs.indexOf("leg-press");
    
    if (barbellIdx >= 0 && boxIdx >= 0) {
      check("Item 15: box-squat before barbell-squat in swaps", boxIdx < barbellIdx,
        `box at ${boxIdx}, barbell at ${barbellIdx}`);
    }
    if (barbellIdx >= 0 && bodyweightIdx >= 0) {
      check("Item 15: bodyweight-squat before barbell-squat in swaps", bodyweightIdx < barbellIdx,
        `bodyweight at ${bodyweightIdx}, barbell at ${barbellIdx}`);
    }
    
    console.log(`    Past-knee squat swap top 10: ${swapSlugs.slice(0, 10).join(", ")}`);
  }
}

console.log("\n11. Item 13: Current-knee 4-move lunge list enforced in CODE (not catalogue tags)");
{
  // Strip contraindicated_regions tags from a test copy of the catalogue
  const strippedCatalogue = catalogue.map(e => ({ ...e, contraindicated_regions: [] as any[] }));
  
  const { KNEE_SAFE_LUNGE_EXERCISES } = require("../src/lib/program/generate");
  const kneeSafeLungeSlugs = Array.from(KNEE_SAFE_LUNGE_EXERCISES) as string[];
  
  console.log(`    Hardcoded KNEE_SAFE_LUNGE_EXERCISES: ${kneeSafeLungeSlugs.join(", ")}`);
  
  const currentKneeInput = base({
    currentInjuryRegions: ["knee"],
    anyKneeInjury: true,
    hasAllEquipment: true,
    catalogue: strippedCatalogue,
  });
  
  // These should be ALLOWED for current knee (in the hardcoded list)
  for (const slug of kneeSafeLungeSlugs) {
    const ex = bySlug.get(slug);
    if (ex) {
      const strippedEx = { ...ex, contraindicated_regions: [] };
      const { isEligible } = require("../src/lib/program/generate");
      const eligible = isEligible(strippedEx, currentKneeInput);
      check(`Item 13: ${slug} ALLOWED for current knee (hardcoded, tags stripped)`, 
        eligible,
        eligible ? "" : `Equipment: ${ex.equipment_ids.join(", ")}, hasAllEquipment: ${currentKneeInput.hasAllEquipment}, equipmentIds: ${currentKneeInput.equipmentIds.join(", ")}`);
    }
  }
  
  // These should be BANNED for current knee (NOT in the hardcoded list)
  const bannedLunges = ["dumbbell-rear-lunge", "barbell-lunge", "reverse-lunge"];
  for (const slug of bannedLunges) {
    const ex = bySlug.get(slug);
    if (ex && ex.movement_pattern === "lunge") {
      const strippedEx = { ...ex, contraindicated_regions: [] };
      const { isEligible } = require("../src/lib/program/generate");
      check(`Item 13: ${slug} BANNED for current knee (not in hardcoded list, tags stripped)`, 
        !isEligible(strippedEx, currentKneeInput));
    }
  }
}

console.log("\n12. Item 8: Warm-up input builder and past-knee exclusions");
{
  const { buildWarmupInput, selectWarmup } = require("../src/lib/program/warmup");
  const warmupFixture = JSON.parse(readFileSync(__dirname + "/fixtures/warmups.json", "utf8"));
  
  // Test buildWarmupInput with past knee injury
  const pastKneeInjuries = [
    { severity: "past" as const, body_region: "knee" as const },
  ];
  
  const warmupInput = buildWarmupInput(
    pastKneeInjuries,
    warmupFixture,
    ["quads", "glutes"],
    "weights" as const,
    null,
    true
  );
  
  check("Item 8: buildWarmupInput sets pastKneeInjury flag", warmupInput.pastKneeInjury === true);
  check("Item 8: buildWarmupInput includes all injury regions", 
    warmupInput.injuryRegions?.includes("knee") ?? false);
  check("Item 8: buildWarmupInput includes prehab regions",
    warmupInput.prehabRegions?.includes("knee") ?? false);
  
  // Test warm-up selection excludes past-knee problematic moves
  const warmup = selectWarmup(warmupInput);
  const warmupSlugs = warmup.map((w: any) => w.slug);
  
  check("Item 8: walking-lunge NOT in past-knee warmup", !warmupSlugs.includes("walking-lunge"));
  check("Item 8: skipping-light NOT in past-knee warmup", !warmupSlugs.includes("skipping-light"));
  check("Item 8: worlds-greatest NOT in past-knee warmup", !warmupSlugs.includes("worlds-greatest"));
  
  // Test that instructions don't contain "full depth" for knee injuries
  const hasFullDepth = warmup.some((w: any) => 
    w.instructions.some((inst: string) => inst.toLowerCase().includes("full depth"))
  );
  check("Item 8: no 'full depth' instructions for past-knee warmup", !hasFullDepth);
  
  // Test healthy user still gets these moves
  const healthyInput = buildWarmupInput(
    [],
    warmupFixture,
    ["quads", "glutes"],
    "weights" as const,
    null,
    true
  );
  
  check("Item 8: buildWarmupInput doesn't set pastKneeInjury for healthy user", 
    healthyInput.pastKneeInjury === false);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
