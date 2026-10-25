/**
 * Before/after fixture test for past-knee swap ranking
 * 
 * Tests that past-knee users get proper knee-friendly swap rankings.
 */
import { readFileSync } from "node:fs";
import { isEligible, score, hashString, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));
const bySlug = new Map(catalogue.map((e) => [e.slug, e]));

function getRankedSwaps(exerciseSlug: string, pastKneeInjury: boolean): string[] {
  const current = bySlug.get(exerciseSlug);
  if (!current) throw new Error(`Exercise ${exerciseSlug} not found`);
  
  const input: GeneratorInput = {
    userId: "swap-ranking-test",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press", "leg_extension_machine"],
    currentInjuryRegions: [],
    pastKneeInjury,
    catalogue,
  };
  
  const patterns = buildPatternList(current.movement_pattern, input.currentInjuryRegions.includes("knee"));
  const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
  const pool = rawPool.filter(e => isEligible(e, input));
  
  const wantCompound = current.mechanic === "compound";
  const ctx: AlternativesContext = {
    level: input.level,
    availableEquipment: new Set(input.equipmentIds),
    injuryRegions: input.currentInjuryRegions,
    pastKneeInjury: input.pastKneeInjury,
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0),
    tieBreakFn: (slug) => hashString(`swap-ranking:${slug}`),
  };
  
  const swaps = rankAlternatives(current, pool, ctx);
  return swaps.map(s => s.slug);
}

// Test cases
const testCases = [
  { exercise: "barbell-squat", name: "Barbell Squat" },
  { exercise: "barbell-lunge", name: "Lunge" },
  { exercise: "leg-extensions", name: "Leg Extension" },
];

console.log("\n=== Past-Knee Swap Ranking Test ===\n");

let failures = 0;

for (const testCase of testCases) {
  console.log(`${testCase.name} (${testCase.exercise}):`);
  
  const swaps = getRankedSwaps(testCase.exercise, true);
  console.log(`  Top 5: ${swaps.join(", ")}`);
  
  if (testCase.name === "Barbell Squat") {
    const hasGoblet = swaps.includes("goblet-squat");
    const hasLegPress = swaps.includes("leg-press");
    const hasPistol = swaps.some(s => s.includes("pistol"));
    const hasJumpPlyo = swaps.some(s => {
      const ex = bySlug.get(s);
      return ex && (s.includes("jump") || s.includes("plyo") || ex.impact === "high");
    });
    const hasChainsOrBands = swaps.some(s => s.includes("chain") || s.includes("band"));
    
    console.log(`    ✓ Contains goblet-squat: ${hasGoblet}`);
    console.log(`    ✓ Contains leg-press: ${hasLegPress}`);
    console.log(`    ✓ No pistol variants: ${!hasPistol}`);
    console.log(`    ✓ No jump/plyo: ${!hasJumpPlyo}`);
    console.log(`    ✓ No chains/bands: ${!hasChainsOrBands}`);
    
    if (!hasGoblet || !hasLegPress || hasPistol || hasJumpPlyo || hasChainsOrBands) {
      failures++;
    }
  }
  
  if (testCase.name === "Lunge") {
    const firstExercise = swaps[0];
    const isRearLungeOrStepUp = firstExercise?.includes("rear") || firstExercise?.includes("step-up");
    const hasPistol = swaps.some(s => s.includes("pistol"));
    const hasJumping = swaps.some(s => s.includes("jump"));
    const hasWalking = swaps.some(s => s.includes("walking"));
    const hasSprint = swaps.some(s => s.includes("sprint"));
    
    console.log(`    ✓ First is rear-lunge or step-up: ${isRearLungeOrStepUp} (${firstExercise})`);
    console.log(`    ✓ No pistol: ${!hasPistol}`);
    console.log(`    ✓ No jumping: ${!hasJumping}`);
    console.log(`    ✓ No walking: ${!hasWalking}`);
    console.log(`    ✓ No sprint: ${!hasSprint}`);
    
    if (!isRearLungeOrStepUp || hasPistol || hasJumping || hasWalking || hasSprint) {
      failures++;
    }
  }
  
  if (testCase.name === "Leg Extension") {
    const hasWallSit = swaps.includes("wall-sit");
    const hasCableHipAdduction = swaps.includes("cable-hip-adduction");
    
    console.log(`    ✓ Contains wall-sit: ${hasWallSit}`);
    console.log(`    ✓ No cable-hip-adduction (mislabeled adductor): ${!hasCableHipAdduction}`);
    
    if (!hasWallSit || hasCableHipAdduction) {
      failures++;
    }
  }
  
  console.log("");
}

console.log(`${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
