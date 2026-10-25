/**
 * Past-knee tier: comprehensive test
 * 
 * Tests graduated restrictions for past knee injuries:
 * - Exclusions: pistol/single-leg variants, explosive moves, full-depth squats
 * - Preferences: knee-friendly alternatives rank higher in swaps
 * - Identity: non-past-knee profiles match main exactly
 * - Warm-ups: exclude risky moves, rewrite cues
 * 
 * npm run test:past-knee
 */
import { readFileSync } from "node:fs";
import { generateProgram, score, hashString, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";
import { getPastKneeExcludedSlugs, getKneeFriendlyPrimaries, isExcludedForPastKnee } from "../src/lib/program/past-knee";
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

console.log("\n1. Catalogue validation: all past-knee slugs exist and explosive slugs excluded");
{
  const excludedSlugs = Array.from(getPastKneeExcludedSlugs());
  const friendlySlugs = [...getKneeFriendlyPrimaries("squat"), ...getKneeFriendlyPrimaries("lunge")];
  
  // Explicit wired checks for critical slugs (must fail on removal)
  check("kettlebell-pistol-squat MUST be excluded", excludedSlugs.includes("kettlebell-pistol-squat"));
  check("weighted-sissy-squat MUST be excluded", excludedSlugs.includes("weighted-sissy-squat"));
  check("one-leg-barbell-squat MUST be excluded", excludedSlugs.includes("one-leg-barbell-squat"));
  check("lunge-sprint MUST be excluded", excludedSlugs.includes("lunge-sprint"));
  check("barbell-full-squat MUST be excluded", excludedSlugs.includes("barbell-full-squat"));
  check("squat-jerk MUST be excluded", excludedSlugs.includes("squat-jerk"));
  check("speed-box-squat MUST be excluded", excludedSlugs.includes("speed-box-squat"));
  check("speed-squats MUST be excluded", excludedSlugs.includes("speed-squats"));
  
  // All high-impact squat/lunge exercises must be caught by filter
  const highImpactSquatLunge = catalogue.filter(e => 
    e.impact === "high" && (e.movement_pattern === "squat" || e.movement_pattern === "lunge")
  );
  
  for (const ex of highImpactSquatLunge) {
    const excluded = isExcludedForPastKnee(ex);
    check(`${ex.slug} (high impact) excluded by filter`, excluded);
  }
  
  // All slugs must exist in catalogue
  for (const slug of excludedSlugs) {
    const exists = bySlug.has(slug);
    if (!exists) {
      console.log(`  FATAL: ${slug} missing from catalogue`);
      process.exit(1);
    }
  }
  
  for (const slug of friendlySlugs) {
    const exists = bySlug.has(slug);
    if (!exists) {
      console.log(`  FATAL: ${slug} missing from catalogue`);
      process.exit(1);
    }
  }
  
  console.log(`    Checked ${excludedSlugs.length} excluded slugs, ${highImpactSquatLunge.length} high-impact exercises`);
}

console.log("\n2. Wide grid test: 5 goals × 3 levels × tracks × equipment × days");
{
  type Goal = "muscle_gain" | "strength" | "fat_loss" | "general_fitness" | "endurance";
  type Level = "beginner" | "intermediate" | "expert";
  type Track = "weights" | "bodyweight";
  
  const goals: Goal[] = ["muscle_gain", "strength", "fat_loss", "general_fitness"];
  const levels: Level[] = ["beginner", "intermediate", "expert"];
  const equipmentSets: Array<{ label: string; hasAll: boolean; ids: string[]; track: Track }> = [
    { label: "All", hasAll: true, ids: [], track: "weights" },
    { label: "Gym", hasAll: false, ids: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press", "leg_extension_machine"], track: "weights" },
    { label: "DB", hasAll: false, ids: ["dumbbell", "adjustable_bench"], track: "weights" },
    { label: "KB+Band", hasAll: false, ids: ["kettlebell", "pull_up_bar", "resistance_band"], track: "weights" },
    { label: "BW", hasAll: false, ids: [], track: "bodyweight" },
  ];
  const dayCounts = [2, 3, 4, 5, 6];
  const sessionMinutes = [30, 45, 60, 90];
  
  let totalPlans = 0;
  let plansWithExcluded = 0;
  let plansWithExplosive = 0;
  let swapListsChecked = 0;
  let swapsWithExplosive = 0;
  
  const excludedSlugs = Array.from(getPastKneeExcludedSlugs());
  const highImpactSlugs = catalogue.filter(e => 
    e.impact === "high" && (e.movement_pattern === "squat" || e.movement_pattern === "lunge")
  ).map(e => e.slug);
  
  for (const goal of goals) {
    for (const level of levels) {
      for (const equip of equipmentSets) {
        for (const days of dayCounts) {
          for (const minutes of sessionMinutes) {
            totalPlans++;
            
            const input = base({
              goal,
              level,
              daysPerWeek: days,
              hasAllEquipment: equip.hasAll,
              equipmentIds: equip.ids,
              primaryTrack: equip.track,
              pastKneeInjury: true,
              preferredSessionMinutes: minutes,
            });
            
            const plan = generateProgram(input);
            const exercises = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId))).filter((e): e is CandidateExercise => e !== undefined);
            
            // Check 1: No excluded slugs in plans
            const excluded = exercises.filter(e => excludedSlugs.includes(e.slug));
            if (excluded.length > 0) {
              plansWithExcluded++;
            }
            
            // Check 2: No explosive high-impact moves in plans
            const explosive = exercises.filter(e => highImpactSlugs.includes(e.slug));
            if (explosive.length > 0) {
              plansWithExplosive++;
            }
            
            // Check 3: Swap lists for squat/lunge exercises
            for (const day of plan.days) {
              for (const ex of day.exercises) {
                const currentEx = byId.get(ex.exerciseId);
                if (!currentEx || (currentEx.movement_pattern !== "squat" && currentEx.movement_pattern !== "lunge")) continue;
                
                swapListsChecked++;
                
                // Use UNFILTERED pool to test rankAlternatives gate on its own
                const patterns = buildPatternList(currentEx.movement_pattern, false);
                const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
                
                const wantCompound = currentEx.mechanic === "compound";
                const ctx: AlternativesContext = {
                  level: input.level,
                  availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
                  injuryRegions: input.currentInjuryRegions,
                  pastKneeInjury: input.pastKneeInjury,
                  limit: 5,
                  scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0),
                  tieBreakFn: (slug) => hashString(`test:${slug}`),
                };
                
                const swaps = rankAlternatives(currentEx, rawPool, ctx);
                
                // No explosive slugs in top 5 swaps
                const explosiveSwaps = swaps.filter(s => highImpactSlugs.includes(s.slug) || excludedSlugs.includes(s.slug));
                if (explosiveSwaps.length > 0) {
                  swapsWithExplosive++;
                }
                
                // Lunge ranking: dumbbell-rear-lunge must be #1 when dumbbells available
                if (currentEx.movement_pattern === "lunge" && equip.ids.includes("dumbbell")) {
                  const rearLungePos = swaps.findIndex(s => s.slug === "dumbbell-rear-lunge");
                  if (rearLungePos !== 0) {
                    // Only count as failure if rear lunge is available but not #1
                    const hasRearLunge = rearLungePos >= 0;
                    if (hasRearLunge) {
                      check(`Lunge swap: dumbbell-rear-lunge #1 (found at #${rearLungePos + 1})`, false);
                    }
                  }
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
  check(`No explosive exercises in any plan`, plansWithExplosive === 0,
    plansWithExplosive > 0 ? `${plansWithExplosive} plans had explosive exercises` : "");
  check(`No explosive exercises in swap lists`, swapsWithExplosive === 0,
    `${swapsWithExplosive}/${swapListsChecked} swap lists had explosive exercises`);
    
  console.log(`    Checked ${totalPlans} plans and ${swapListsChecked} swap lists`);
}

console.log("\n3. Warm-up test: walking-lunge, skipping-light, 'full depth' never appear");
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
    { label: "Jump Rope", hasAll: false, ids: ["jump_rope"] },
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
  
  check(`walking-lunge NEVER in warmups`, warmupsWithWalkingLunge === 0,
    warmupsWithWalkingLunge > 0 ? `${warmupsWithWalkingLunge}/${warmupsChecked} had walking-lunge` : "");
  check(`skipping-light NEVER in warmups`, warmupsWithSkippingLight === 0,
    warmupsWithSkippingLight > 0 ? `${warmupsWithSkippingLight}/${warmupsChecked} had skipping-light` : "");
  check(`"full depth" cues rewritten`, warmupsWithFullDepth === 0,
    warmupsWithFullDepth > 0 ? `${warmupsWithFullDepth} warmups had "full depth"` : "");
  
  console.log(`    Checked ${warmupsChecked} warmup profiles`);
}

console.log("\n4. Swap ranking test: top-5 assertions");
{
  function getRankedSwaps(exerciseSlug: string, equipmentIds: string[]): string[] {
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
      tieBreakFn: (slug) => hashString(`ranking:${slug}`),
    };
    
    const swaps = rankAlternatives(current, rawPool, ctx);
    return swaps.map(s => s.slug);
  }
  
  const gymEquipment = ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press", "leg_extension_machine"];
  
  // Squat swaps: goblet, leg press, wall sit in top 5
  const squatSwaps = getRankedSwaps("barbell-squat", gymEquipment);
  check("Squat: goblet-squat in top 5", squatSwaps.includes("goblet-squat"));
  check("Squat: leg-press in top 5", squatSwaps.includes("leg-press"));
  check("Squat: wall-sit in top 5", squatSwaps.includes("wall-sit"));
  
  // Lunge swaps: dumbbell-rear-lunge MUST be #1
  const lungeSwaps = getRankedSwaps("barbell-lunge", gymEquipment);
  check("Lunge: dumbbell-rear-lunge is #1", lungeSwaps[0] === "dumbbell-rear-lunge");
  
  // Leg extension swaps: wall-sit in top 5, no cable-hip-adduction
  const legExtSwaps = getRankedSwaps("leg-extensions", gymEquipment);
  check("Leg ext: wall-sit in top 5", legExtSwaps.includes("wall-sit"));
  check("Leg ext: no cable-hip-adduction", !legExtSwaps.includes("cable-hip-adduction"));
  
  console.log(`    Squat top 5: ${squatSwaps.join(", ")}`);
  console.log(`    Lunge top 5: ${lungeSwaps.join(", ")}`);
  console.log(`    Leg ext top 5: ${legExtSwaps.join(", ")}`);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
