/**
 * BMI High-Impact Test (PR #73 Run 20)
 * 
 * Verifies that users with BMI >= 30 do not get high-impact exercises.
 * This protects joint health for users with obesity.
 * 
 * The guard at generate.ts filters high-impact exercises for BMI >= 30.
 */

import { readFileSync } from "node:fs";
import {
  generateProgram,
  type GeneratorInput,
  type CandidateExercise,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

console.log("BMI High-Impact Test");
console.log("─".repeat(60));

let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const byId = new Map(catalogue.map((e) => [e.id, e]));

// Test profiles with BMI >= 30 (obesity)
const testProfiles: Array<{input: GeneratorInput; label: string}> = [];

// BMI = weight(kg) / height(m)^2
// For BMI 30: height 1.8m -> weight = 30 * 1.8^2 = 97.2 kg
// For BMI 32: height 1.75m -> weight = 32 * 1.75^2 = 98 kg
// For BMI 35: height 1.7m -> weight = 35 * 1.7^2 = 101 kg

type Level = "beginner" | "intermediate" | "expert";
const levels: Level[] = ["beginner", "intermediate", "expert"];

for (const bmi of [30, 32, 35]) {
  for (const level of levels) {
    for (const days of [3, 4, 5]) {
      testProfiles.push({
        label: `bmi${bmi}-${level}-${days}d`,
        input: {
          userId: `test-bmi${bmi}-${level}-${days}d`,
          blockNumber: 1,
          goal: "fat_loss",
          level,
          primaryTrack: "weights",
          daysPerWeek: days,
          yogaDaysPerWeek: 0,
          age: 35,
          bmi,
          hasAllEquipment: true,
          equipmentIds: [],
          currentInjuryRegions: [],
          anyKneeInjury: false,
          preferredSessionMinutes: 60,
          catalogue,
        },
      });
    }
  }
}

console.log(`Testing ${testProfiles.length} profiles with BMI >= 30:\n`);

for (const { input, label } of testProfiles) {
  const plan = generateProgram(input);
  
  const highImpact = plan.days.flatMap((day) =>
    day.exercises
      .map((ex) => byId.get(ex.exerciseId))
      .flatMap((e) => (e && e.impact === "high") ? [{ day: day.label, slug: e.slug }] : [])
  );
  
  if (highImpact.length > 0) {
    console.log(`  Found high-impact exercises in ${label}:`);
    for (const { day, slug } of highImpact) {
      console.log(`    ${day}: ${slug}`);
    }
  }
  
  check(
    `${label}: no high-impact exercises`,
    highImpact.length === 0,
    highImpact.length > 0
      ? `Found ${highImpact.length} high-impact exercises`
      : undefined
  );
}

console.log("");
console.log("─".repeat(60));

if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log(`PASSED: All ${testProfiles.length} profiles verified - no high-impact exercises`);
  process.exit(0);
}
