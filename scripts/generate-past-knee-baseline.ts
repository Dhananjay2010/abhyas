/**
 * Generate baseline from CURRENT branch with pastKneeInjury=false for identity testing
 */
import { writeFileSync } from "fs";
import { generateProgram, isEligible, score, hashString, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";

const fixture: CandidateExercise[] = require("./fixtures/catalogue.json");

function base(overrides: Partial<GeneratorInput>): GeneratorInput {
  return {
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
    currentInjuryRegions: [],
    pastKneeInjury: false,
    catalogue: fixture,
    ...overrides,
  };
}

const cases = [
  { name: "none", currentInjuryRegions: [] },
  { name: "shoulder", currentInjuryRegions: ["shoulder"] },
  { name: "wrist", currentInjuryRegions: ["wrist"] },
  { name: "lower_back", currentInjuryRegions: ["lower_back"] },
  { name: "knee", currentInjuryRegions: ["knee"] },
];

const baseline: Record<string, { plans: string[]; swaps: Record<string, string[]> }> = {};

for (const testCase of cases) {
  const input = base({ currentInjuryRegions: testCase.currentInjuryRegions as any, pastKneeInjury: false });
  const plan = generateProgram(input);
  const exerciseIds = plan.days.flatMap(d => d.exercises.map(e => e.exerciseId)).sort();
  
  const swaps: Record<string, string[]> = {};
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const currentEx = fixture.find(e => e.id === ex.exerciseId);
      if (!currentEx) continue;
      
      const patterns = buildPatternList(currentEx.movement_pattern, input.currentInjuryRegions.includes("knee"));
      const rawPool = fixture.filter(e => patterns.includes(e.movement_pattern));
      const pool = rawPool.filter(e => isEligible(e, input));
      
      const wantCompound = currentEx.mechanic !== "isolation";
      const ctx: AlternativesContext = {
        level: input.level,
        availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
        injuryRegions: input.currentInjuryRegions,
        pastKneeInjury: false,
        limit: 5,
        scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, false, 0),
        tieBreakFn: (slug: string) => hashString(`baseline:${slug}`),
      };
      
      const alternatives = rankAlternatives(currentEx, pool, ctx);
      swaps[ex.exerciseId] = alternatives.map(a => a.id).sort();
    }
  }
  
  baseline[testCase.name] = { plans: exerciseIds, swaps };
}

writeFileSync("./scripts/fixtures/past-knee-baseline.json", JSON.stringify(baseline, null, 2), "utf-8");
console.log("Baseline regenerated from current branch with pastKneeInjury=false");
