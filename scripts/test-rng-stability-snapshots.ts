#!/usr/bin/env -S npx tsx
/**
 * Test: RNG stability golden snapshots
 * 
 * Verifies that program generation with fixed seeds produces identical exercise
 * selections to frozen golden fixtures. Guards against unintended RNG changes.
 * 
 * Run scripts/generate-rng-stability-snapshots.ts to regenerate fixtures after
 * intentional RNG changes.
 */

import { readFileSync, existsSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const fixturePath = "scripts/fixtures/rng-stability-snapshots.json";

if (!existsSync(fixturePath)) {
  console.error(`❌ FAILED: Golden snapshot fixture not found: ${fixturePath}`);
  console.error("Run: npm run generate-rng-stability-snapshots");
  process.exit(1);
}

const goldenSnapshots = JSON.parse(readFileSync(fixturePath, "utf8"));

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const pastKneeInput: GeneratorInput = {
  userId: "test-user-past-knee",
  blockNumber: 1,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: [],
  anyKneeInjury: true,
};

const noInjuryInput: GeneratorInput = {
  ...pastKneeInput,
  userId: "test-user-no-injury",
  anyKneeInjury: false,
};

const seeds = [42, 123, 999];
let failures = 0;

type DaySnapshot = {
  focus: string | null;
  dayType: string;
  exercises: Array<{ slug: string; orderIndex: number }>;
};

function extractDayExercises(program: ReturnType<typeof generateProgram>): DaySnapshot[] {
  return program.days.map(day => ({
    focus: day.focus,
    dayType: day.dayType,
    exercises: day.dayType === "rest" ? [] : day.exercises.map(ex => ({
      slug: ex.name,
      orderIndex: ex.orderIndex,
    })),
  }));
}

function compareSnapshots(label: string, actual: DaySnapshot[], expected: DaySnapshot[]) {
  const actualJSON = JSON.stringify(actual, null, 2);
  const expectedJSON = JSON.stringify(expected, null, 2);
  
  if (actualJSON === expectedJSON) {
    console.log(`  ✓ ${label}`);
    return true;
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
    
    // Show first difference
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
      const actualDay = JSON.stringify(actual[i]);
      const expectedDay = JSON.stringify(expected[i]);
      if (actualDay !== expectedDay) {
        console.log(`    Day ${i} differs:`);
        console.log(`      Expected: ${expectedDay}`);
        console.log(`      Got:      ${actualDay}`);
        break;
      }
    }
    return false;
  }
}

console.log("Testing RNG stability with golden snapshots...\n");

for (const seed of seeds) {
  console.log(`Seed ${seed}:`);
  
  // Use blockNumber as seed (generateProgram derives RNG from userId:blockNumber)
  const pastKneeProgram = generateProgram({ ...pastKneeInput, blockNumber: seed });
  const noInjuryProgram = generateProgram({ ...noInjuryInput, blockNumber: seed });
  
  const pastKneeActual = extractDayExercises(pastKneeProgram);
  const noInjuryActual = extractDayExercises(noInjuryProgram);
  
  const pastKneeExpected = goldenSnapshots[`past-knee-seed-${seed}`];
  const noInjuryExpected = goldenSnapshots[`no-injury-seed-${seed}`];
  
  compareSnapshots(`past-knee seed ${seed}`, pastKneeActual, pastKneeExpected);
  compareSnapshots(`no-injury seed ${seed}`, noInjuryActual, noInjuryExpected);
  
  console.log("");
}

if (failures > 0) {
  console.error(`❌ FAILED: ${failures} snapshot mismatch(es)`);
  console.error("Run: npm run generate-rng-stability-snapshots to update fixtures");
  process.exit(1);
}

console.log("✅ PASSED: All golden snapshots match");
