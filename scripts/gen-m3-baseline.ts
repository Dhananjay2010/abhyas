#!/usr/bin/env npx tsx
/**
 * Generate m3-baseline-no-injury.json from origin/main catalogue.
 * Used to ensure no regressions in no-injury plans/swaps.
 */

import { generateProgram, type GeneratorInput, type CandidateExercise } from "@/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "@/lib/program/alternatives";
import { hashString } from "@/lib/program/generate";
import { readFileSync, writeFileSync } from "fs";

const mainCatalogue = JSON.parse(readFileSync('scripts/fixtures/catalogue-main.json', 'utf-8')) as CandidateExercise[];

const profiles: GeneratorInput[] = [
  { userId: "base1", blockNumber: 1, goal: "strength", level: "intermediate", primaryTrack: "bodyweight",
    daysPerWeek: 4, yogaDaysPerWeek: 0, age: 30, bmi: 22, hasAllEquipment: false,
    equipmentIds: ["bodyweight", "yoga_mat", "dumbbell", "resistance_band"],
    currentInjuryRegions: [], preferredSessionMinutes: 45, catalogue: mainCatalogue },
  { userId: "base2", blockNumber: 1, goal: "muscle_gain", level: "intermediate", primaryTrack: "weights",
    daysPerWeek: 4, yogaDaysPerWeek: 0, age: 25, bmi: 24, hasAllEquipment: true, equipmentIds: [],
    currentInjuryRegions: [], preferredSessionMinutes: 60, catalogue: mainCatalogue },
  { userId: "base3", blockNumber: 1, goal: "fat_loss", level: "beginner", primaryTrack: "bodyweight",
    daysPerWeek: 3, yogaDaysPerWeek: 1, age: 35, bmi: 28, hasAllEquipment: false,
    equipmentIds: ["bodyweight", "yoga_mat"],
    currentInjuryRegions: [], preferredSessionMinutes: 30, catalogue: mainCatalogue },
];

const allExerciseSlugs = new Set<string>();
const allSwapSlugs = new Set<string>();

for (const input of profiles) {
  const plan = generateProgram(input);
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const exercise = mainCatalogue.find(e => e.id === ex.exerciseId);
      if (exercise) {
        allExerciseSlugs.add(exercise.slug);
        
        const ctx: AlternativesContext = {
          level: input.level,
          availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
          injuryRegions: [],
          scoreFn: () => 1,
          tieBreakFn: (s: string) => hashString(s),
        };
        const swaps = rankAlternatives(exercise, mainCatalogue, ctx);
        for (const swap of swaps) {
          allSwapSlugs.add(swap.slug);
        }
      }
    }
  }
}

const baseline = {
  exerciseSlugs: Array.from(allExerciseSlugs).sort(),
  swapSlugs: Array.from(allSwapSlugs).sort(),
};

writeFileSync('scripts/fixtures/m3-baseline-no-injury.json', JSON.stringify(baseline, null, 2) + '\n');
console.log(`Generated baseline: ${baseline.exerciseSlugs.length} exercises, ${baseline.swapSlugs.length} swaps`);
