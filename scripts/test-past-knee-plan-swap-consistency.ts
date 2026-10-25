/**
 * Test: Plan pick == swap[0] for past-knee lunge tier ordering.
 * 
 * For each past-knee profile, assert that the plan's lunge pick has tier <= swap filtered[0] tier,
 * and for profiles with dumbbells, assert slug equality (dumbbell-rear-lunge).
 * 
 * npm run test:past-knee-plan-swap-consistency
 */
import { readFileSync } from "node:fs";
import { generateProgram, isEligible, score, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";
import { pastKneeLungeTier } from "../src/lib/program/past-knee-lunge-order";
import { hashString } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type Level = "beginner" | "intermediate" | "expert";
type EquipmentProfile = { label: string; hasAll: boolean; ids: string[] };

const levels: Level[] = ["beginner", "intermediate", "expert"];
const equipmentProfiles: EquipmentProfile[] = [
  { label: "All", hasAll: true, ids: [] },
  { label: "DB", hasAll: false, ids: ["dumbbell", "adjustable_bench"] },
  { label: "Barbell", hasAll: false, ids: ["barbell", "squat_rack", "flat_bench"] },
  { label: "KB", hasAll: false, ids: ["kettlebell"] },
];

console.log("\nPlan == swap[0]: tier ordering consistency across profiles");

for (const level of levels) {
  for (const equip of equipmentProfiles) {
    const input: GeneratorInput = {
      userId: `test-consistency-${level}-${equip.label}`,
      blockNumber: 1,
      goal: "muscle_gain",
      level,
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: equip.hasAll,
      equipmentIds: equip.ids,
      currentInjuryRegions: [],
      anyKneeInjury: true,
      catalogue,
    };
    
    const program = generateProgram(input);
    
    // Find a lunge slot in the plan
    let planLungeSlug = "";
    let planLungeExercise: CandidateExercise | undefined;
    let dayExerciseIds: Set<string> = new Set();
    
    for (const day of program.days) {
      if (day.dayType === "rest" || day.dayType === "yoga") continue;
      
      dayExerciseIds = new Set(day.exercises.map(ex => ex.exerciseId));
      
      for (const ex of day.exercises) {
        const candidate = catalogue.find(c => c.id === ex.exerciseId);
        if (!candidate) continue;
        
        if (candidate.movement_pattern === "lunge") {
          planLungeSlug = candidate.slug;
          planLungeExercise = candidate;
          break;
        }
      }
      
      if (planLungeExercise) break;
    }
    
    if (!planLungeExercise) {
      console.log(`  note ${level}/${equip.label}: no lunge in plan (skip)`);
      continue;
    }
    
    // Now call rankAlternatives with this exercise as anchor
    const patterns = buildPatternList(planLungeExercise.movement_pattern, false);
    const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    const eligible = rawPool.filter(e => {
      if (e.id === planLungeExercise.id) return false; // exclude anchor
      return isEligible(e, { ...input, catalogue: [] });
    });
    
    const wantCompound = planLungeExercise.mechanic === "compound";
    const ctx: AlternativesContext = {
      level: input.level,
      availableEquipment: equip.hasAll ? null : new Set(equip.ids),
      injuryRegions: input.currentInjuryRegions,
      anyKneeInjury: input.anyKneeInjury,
      limit: 10,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
      tieBreakFn: (slug) => hashString(`ranking:${slug}`),
    };
    
    const swaps = rankAlternatives(planLungeExercise, eligible, ctx);
    
    // Filter out exercises already in the day
    const filtered = swaps.filter(e => !dayExerciseIds.has(e.id));
    
    if (filtered.length === 0) {
      console.log(`  note ${level}/${equip.label}: no filtered swaps (all in day)`);
      continue;
    }
    
    const firstSwap = filtered[0];
    const firstSwapTier = pastKneeLungeTier(firstSwap);
    const planTier = pastKneeLungeTier(planLungeExercise);
    
    // Assertion 1: Plan tier <= swap tier (lower tier = higher priority)
    // Only check when first swap is a lunge (tier > 0)
    if (firstSwapTier > 0) {
      const tierOk = planTier > 0 && planTier <= firstSwapTier;
      check(
        `${level}/${equip.label}: plan tier <= swap tier`,
        tierOk,
        tierOk ? `plan ${planTier}, swap ${firstSwapTier}` : `FAIL: plan ${planTier} > swap ${firstSwapTier}`
      );
    }
    
    // Assertion 2: For all-equipment and dumbbell profiles, assert slug equality
    // Plan pick should be dumbbell-rear-lunge
    if (equip.label === "All" || equip.label === "DB") {
      check(
        `${level}/${equip.label}: plan pick is dumbbell-rear-lunge`,
        planLungeSlug === "dumbbell-rear-lunge",
        planLungeSlug === "dumbbell-rear-lunge" ? "" : `got ${planLungeSlug}`
      );
      
      // First lunge in filtered swaps should be dumbbell-rear-lunge ONLY if anchor is a different lunge
      if (planLungeSlug !== "dumbbell-rear-lunge") {
        const firstLungeSwap = filtered.find(e => e.movement_pattern === "lunge");
        if (firstLungeSwap) {
          check(
            `${level}/${equip.label}: first swap lunge is dumbbell-rear-lunge (anchor=${planLungeSlug})`,
            firstLungeSwap.slug === "dumbbell-rear-lunge",
            firstLungeSwap.slug === "dumbbell-rear-lunge" ? "" : `got ${firstLungeSwap.slug}`
          );
        }
      }
    }
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
