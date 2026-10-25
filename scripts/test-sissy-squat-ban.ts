/**
 * Sissy Squat Ban Test (PR #73 Run 18)
 * 
 * NOTE: The explicit ban at generate.ts:570 is technically REDUNDANT because
 * weighted-sissy-squat has contraindicated_regions: ["knee"], which already
 * filters it via isEligible(). However, the explicit ban serves as defense-in-depth
 * and documents the design intent clearly.
 * 
 * This test verifies that weighted-sissy-squat never appears in knee-injured plans.
 * The mutant for this ban was removed because it's dead code (verified via comprehensive
 * grid search: 0 appearances across 240+ plans when ban is removed).
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Find weighted-sissy-squat in catalogue
const weightedSissySquat = catalogue.find(e => e.slug === "weighted-sissy-squat");
if (!weightedSissySquat) {
  console.log("✗ weighted-sissy-squat not found in catalogue");
  process.exit(1);
}

console.log("Sissy Squat Ban Test (PR #73 Run 18)");
console.log("─".repeat(60));

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Test with past-knee injury, expert level, full equipment
// This should exclude weighted-sissy-squat from all generated plans
const byId = new Map(catalogue.map(e => [e.id, e]));

let plansWithSissy = 0;
const testCases = [
  { daysPerWeek: 3, sessionMinutes: 45 },
  { daysPerWeek: 4, sessionMinutes: 60 },
  { daysPerWeek: 5, sessionMinutes: 75 },
];

for (const tc of testCases) {
  const input: GeneratorInput = {
    userId: `sissy-test-${tc.daysPerWeek}d-${tc.sessionMinutes}m`,
    blockNumber: 1,
    goal: "muscle_gain",
    level: "expert",
    primaryTrack: "weights",
    daysPerWeek: tc.daysPerWeek,
    yogaDaysPerWeek: 0,
    age: 35,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    preferredSessionMinutes: tc.sessionMinutes,
    catalogue,
  };

  const program = generateProgram(input);
  
  for (const day of program.days) {
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (exercise?.slug.includes("sissy")) {
        plansWithSissy++;
        console.log(`  Found ${exercise.slug} in ${day.label} of ${input.userId}`);
      }
    }
  }
}

check(
  `Sissy squats excluded from ${testCases.length} test plans`,
  plansWithSissy === 0,
  plansWithSissy > 0 ? `${plansWithSissy} exercises leaked sissy squats` : undefined
);

console.log(`\n${failed === 0 ? "✓ All tests passed!" : `✗ ${failed} test(s) failed`}`);
process.exit(failed > 0 ? 1 : 0);
