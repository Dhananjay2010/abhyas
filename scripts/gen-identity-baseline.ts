#!/usr/bin/env npx tsx
/**
 * Generate identity baseline from main for comparison.
 * Run this on main branch to create fixtures/identity-baseline-main.json
 */

import { writeFileSync } from "fs";
import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import { hashString, score, isEligible } from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const testCases: Array<{
  id: string;
  injuries: Array<{ region: string; severity: string }>;
  level: string;
}> = [
  // No injury
  { id: "no-injury-intermediate", injuries: [], level: "intermediate" },
  { id: "no-injury-beginner", injuries: [], level: "beginner" },
  
  // Current knee (not past)
  { id: "current-knee-intermediate", injuries: [{ region: "knee", severity: "current" }], level: "intermediate" },
  { id: "current-knee-beginner", injuries: [{ region: "knee", severity: "current" }], level: "beginner" },
  
  // Other injuries (not knee)
  { id: "shoulder-past", injuries: [{ region: "shoulder", severity: "past" }], level: "intermediate" },
  { id: "lower-back-past", injuries: [{ region: "lower_back", severity: "past" }], level: "intermediate" },
];

interface BaselineEntry {
  program: {
    days: Array<{
      dayIndex: number;
      dayType: string;
      focus: string | null;
      label: string;
      exercises: Array<{
        name: string;
        orderIndex: number;
        targetSets: number;
        targetRepsMin: number;
        targetRepsMax: number;
      }>;
    }>;
  };
  swaps: Record<string, string[]>;
}

const baseline: Record<string, BaselineEntry> = {};

for (const testCase of testCases) {
  const currentInjuryRegions = testCase.injuries
    .filter(i => i.severity === "current")
    .map(i => i.region as "knee" | "lower_back" | "shoulder");
  
  const anyKneeInjury = testCase.injuries.some(i => i.region === "knee");
  
  const input: GeneratorInput = {
    userId: `test-${testCase.id}`,
    blockNumber: 1,
    goal: "muscle_gain" as const,
    level: testCase.level as "beginner" | "intermediate" | "expert",
    primaryTrack: "weights" as const,
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions,
    anyKneeInjury,
    preferredSessionMinutes: 60,
    catalogue,
  };
  
  const program = generateProgram(input);
  
  // Generate swap lists for key exercises
  const barbellSquat = catalogue.find(e => e.slug === "barbell-squat");
  const spanishSquat = catalogue.find(e => e.slug === "spanish-squat");
  const splitSquat = catalogue.find(e => e.slug === "split-squat-with-dumbbells");
  
  const swaps: Record<string, string[]> = {};
  
  const exercises: Array<{ name: string; ex: CandidateExercise | undefined }> = [
    { name: "barbell-squat", ex: barbellSquat },
    { name: "spanish-squat", ex: spanishSquat },
    { name: "split-squat-with-dumbbells", ex: splitSquat },
  ];
  
  for (const { name, ex } of exercises) {
    if (!ex) continue;
    
    const patterns = getSwapPatterns(ex.movement_pattern, input);
    const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    const eligible = pool.filter(e => isEligible(e, input));
    
    const wantCompound = ex.mechanic !== "isolation";
    const tieBreak = (slug: string) => hashString(`test:${slug}`);
    const scoreFn = (e: CandidateExercise) => score(e, wantCompound, input.level, input.primaryTrack);
    
    const ranked = rankAlternatives(
      ex,
      eligible,
      {
        level: input.level,
        availableEquipment: null,
        injuryRegions: input.currentInjuryRegions,
        anyKneeInjury: input.anyKneeInjury,
        limit: 10,
        scoreFn,
        tieBreakFn: tieBreak,
      }
    );
    
    swaps[name] = ranked.map(e => e.slug);
  }
  
  baseline[testCase.id] = {
    program: {
      days: program.days.map(day => ({
        dayIndex: day.dayIndex,
        dayType: day.dayType,
        focus: day.focus,
        label: day.label,
        exercises: day.exercises.map(ex => ({
          name: ex.name,
          orderIndex: ex.orderIndex,
          targetSets: ex.targetSets,
          targetRepsMin: ex.targetRepsMin,
          targetRepsMax: ex.targetRepsMax,
        })),
      })),
    },
    swaps,
  };
}

writeFileSync(
  "scripts/fixtures/identity-baseline-main.json",
  JSON.stringify(baseline, null, 2)
);

console.log("✓ Identity baseline generated");
console.log(`  Test cases: ${Object.keys(baseline).length}`);
console.log(`  Output: scripts/fixtures/identity-baseline-main.json`);
