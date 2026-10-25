/**
 * Generate baseline from origin/main for identity testing
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { CandidateExercise, GeneratorInput } from "../src/lib/program/generate";
import type { AlternativesContext } from "../src/lib/program/alternatives";

type BodyRegion = "shoulder" | "wrist" | "lower_back" | "knee";

async function generateBaseline() {
  // Import from the worktree at /tmp/main-worktree
  const { generateProgram, isEligible, score, hashString } = await import("/tmp/main-worktree/src/lib/program/generate");
  const { rankAlternatives, buildPatternList } = await import("/tmp/main-worktree/src/lib/program/alternatives");

  const fixture: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

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
      catalogue: fixture,
      ...overrides,
    };
  }

  const cases: Array<{ name: string; currentInjuryRegions: BodyRegion[] }> = [
    { name: "none", currentInjuryRegions: [] },
    { name: "shoulder", currentInjuryRegions: ["shoulder"] },
    { name: "wrist", currentInjuryRegions: ["wrist"] },
    { name: "lower_back", currentInjuryRegions: ["lower_back"] },
    { name: "knee", currentInjuryRegions: ["knee"] },
  ];

  const baseline: Record<string, { plans: string[]; swaps: Record<string, string[]> }> = {};

  for (const testCase of cases) {
    const input = base({ currentInjuryRegions: testCase.currentInjuryRegions });
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
          limit: 5,
          scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
          tieBreakFn: (slug: string) => hashString(`baseline:${slug}`),
        };
        
        const alternatives = rankAlternatives(currentEx, pool, ctx);
        swaps[ex.exerciseId] = alternatives.map(a => a.id).sort();
      }
    }
    
    baseline[testCase.name] = { plans: exerciseIds, swaps };
  }

  writeFileSync("./scripts/fixtures/past-knee-baseline.json", JSON.stringify(baseline, null, 2), "utf-8");
  console.log("Baseline generated from origin/main");
}

generateBaseline().catch(console.error);
