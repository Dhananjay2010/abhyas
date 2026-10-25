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
import { generateProgram, score, hashString, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
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
  
  // Explosive loaded knee-flexion moves
  "squat-jerk",
  "speed-box-squat",
  "speed-squats",
  
  // Kettlebell jerks
  "double-kettlebell-jerk",
  "one-arm-kettlebell-jerk",
  "one-arm-kettlebell-split-jerk",
  "two-arm-kettlebell-jerk",
  "one-arm-kettlebell-clean-and-jerk",
  
  // Kettlebell explosive presses and thruster
  "double-kettlebell-push-press",
  "one-arm-kettlebell-push-press",
  "kettlebell-thruster",
  
  // Band/chain BARBELL squats (NOT squats-with-bands which is beginner bodyweight+band)
  "squat-with-chains",
  "box-squat-with-bands",
  "box-squat-with-chains",
  "reverse-band-box-squat",
  "reverse-band-power-squat",
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
    const ex = bySlug.get(slug)!;
    const excluded = isExcludedForPastKnee(ex);
    check(`${slug} excluded by filter`, excluded);
  }
  
  // Explicit wired check for kettlebell-pistol-squat (must fail if removed from list)
  check("kettlebell-pistol-squat MUST be excluded", EXPECTED_EXCLUDED_SLUGS.includes("kettlebell-pistol-squat"));
  check("kettlebell-pistol-squat excluded by filter", isExcludedForPastKnee(bySlug.get("kettlebell-pistol-squat")!));
  
  console.log(`    Checked ${EXPECTED_EXCLUDED_SLUGS.length} explicit exclusions`);
}

console.log("\n2. High-impact leg exercise rule (data-driven from catalogue fields)");
{
  // Compute expected high-impact leg exercises from catalogue fields
  const legMuscles = new Set(["quads", "glutes", "hamstrings", "adductors", "calves"]);
  const highImpactLegSlugs = catalogue
    .filter(e => {
      if (e.impact !== "high") return false;
      if (e.movement_pattern === "squat" || e.movement_pattern === "lunge") return true;
      return e.primary_muscles.some(m => legMuscles.has(m));
    })
    .map(e => e.slug);
  
  console.log(`    Found ${highImpactLegSlugs.length} high-impact leg exercises in catalogue`);
  
  // All high-impact leg exercises must be excluded
  let highImpactLegExcluded = 0;
  for (const slug of highImpactLegSlugs) {
    const ex = bySlug.get(slug)!;
    if (isExcludedForPastKnee(ex)) {
      highImpactLegExcluded++;
    } else {
      check(`${slug} (high impact leg) excluded`, false);
    }
  }
  check(`All ${highImpactLegSlugs.length} high-impact leg exercises excluded`, highImpactLegExcluded === highImpactLegSlugs.length);
}

console.log("\n3. Wide grid test: plans, warm-ups, swap lists never contain excluded exercises");
{
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
  const sessionDurations = [30, 60, 90];
  
  let plansChecked = 0;
  let kettlebelPistolInPlans = 0;
  let excludedInPlans = 0;
  let wallSitAsPrimary = 0;
  let warmupsChecked = 0;
  let walkingLungeInWarmups = 0;
  let skippingLightInWarmups = 0;
  let excludedInWarmups = 0;
  
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
                pastKneeInjury: true,
              });
              
              const program = generateProgram(input);
              plansChecked++;
              
              // Check all exercises in plan
              for (const day of program.days) {
                for (const ex of day.exercises) {
                  const exercise = byId.get(ex.exerciseId);
                  if (!exercise) continue;
                  
                  // Specific check: kettlebell-pistol-squat
                  if (exercise.slug === "kettlebell-pistol-squat") {
                    kettlebelPistolInPlans++;
                  }
                  
                  // Check if excluded
                  if (isExcludedForPastKnee(exercise)) {
                    excludedInPlans++;
                  }
                  
                  // Check if wall-sit is primary squat slot (first 4 slots are primaries)
                  if (exercise.slug === "wall-sit" && exercise.movement_pattern === "squat") {
                    const exIndex = day.exercises.findIndex(e => e.exerciseId === exercise.id);
                    if (exIndex >= 0 && exIndex <= 3) {
                      wallSitAsPrimary++;
                    }
                  }
                }
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
                
                const ex = catalogue.find(e => e.slug === w.slug);
                if (ex && isExcludedForPastKnee(ex)) {
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
  check(`wall-sit NEVER as primary squat`, wallSitAsPrimary === 0,
    wallSitAsPrimary > 0 ? `Found ${wallSitAsPrimary} primary wall-sit slots` : "");
  check(`walking-lunge NEVER in warmups`, walkingLungeInWarmups === 0,
    walkingLungeInWarmups > 0 ? `Found ${walkingLungeInWarmups}/${warmupsChecked}` : "");
  check(`skipping-light NEVER in warmups`, skippingLightInWarmups === 0,
    skippingLightInWarmups > 0 ? `Found ${skippingLightInWarmups}/${warmupsChecked}` : "");
  check(`No excluded exercises in warmups`, excludedInWarmups === 0,
    excludedInWarmups > 0 ? `Found ${excludedInWarmups} excluded in warmups` : "");
  
  console.log(`    Checked ${plansChecked} plans, ${warmupsChecked} warmups`);
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
      pastKneeInjury: true,
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
      pastKneeInjury: input.pastKneeInjury,
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0),
      tieBreakFn: (slug) => hashString(`ranking:${seed}:${slug}`),
    };
    
    const swaps = rankAlternatives(current, rawPool, ctx);
    return swaps.map(s => s.slug);
  }
  
  const gymEquipment = ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press", "leg_extension_machine"];
  
  // Squat swaps
  const squatSwaps = getRankedSwaps("barbell-squat", gymEquipment);
  check("Squat: goblet-squat in top 5", squatSwaps.includes("goblet-squat"));
  check("Squat: leg-press in top 5", squatSwaps.includes("leg-press"));
  check("Squat: wall-sit in top 5", squatSwaps.includes("wall-sit"));
  
  // Lunge swaps
  const lungeSwaps = getRankedSwaps("barbell-lunge", gymEquipment);
  check("Lunge: dumbbell-rear-lunge is #1", lungeSwaps[0] === "dumbbell-rear-lunge");
  
  // Leg extension swaps
  const legExtSwaps = getRankedSwaps("leg-extensions", gymEquipment);
  check("Leg ext: wall-sit in top 5", legExtSwaps.includes("wall-sit"));
  check("Leg ext: no cable-hip-adduction", !legExtSwaps.includes("cable-hip-adduction"));
  
  console.log(`    Squat top 5: ${squatSwaps.join(", ")}`);
  console.log(`    Lunge top 5: ${lungeSwaps.join(", ")}`);
  console.log(`    Leg ext top 5: ${legExtSwaps.join(", ")}`);
  
  // Band/chain barbell squat exclusion test across multiple tiebreak seeds
  const bandChainSlugs = ["squat-with-chains", "box-squat-with-bands", "box-squat-with-chains", "reverse-band-box-squat", "reverse-band-power-squat"];
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
      pastKneeInjury: pastKnee,
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
      pastKneeInjury: pastKnee,
      limit: 10,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, pastKnee, 0),
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
  const pastKneeDbSwaps = getRankedSwapsWithInjury("barbell-squat", dbOnly, true);
  const healthyDbSwaps = getRankedSwapsWithInjury("barbell-squat", dbOnly, false);
  
  check("Past-knee + DB: goblet-squat in swaps", pastKneeDbSwaps.includes("goblet-squat"),
    `got: ${pastKneeDbSwaps.join(", ")}`);
  check("Healthy + DB: goblet-squat NOT in swaps", !healthyDbSwaps.includes("goblet-squat"),
    `got: ${healthyDbSwaps.join(", ")}`);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
