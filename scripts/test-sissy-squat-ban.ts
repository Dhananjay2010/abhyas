/**
 * Sissy Squat Ban Test (PR #73 Run 20)
 * 
 * Verifies that weighted-sissy-squat is excluded from plans for ANY knee injury.
 * 
 * The explicit ban at generate.ts:570 is ESSENTIAL for past-knee injuries because:
 * - isEligible() only filters contraindications against currentInjuryRegions
 * - For past-knee (anyKneeInjury=true, currentInjuryRegions=[]), line 570 is
 *   the ONLY barrier preventing weighted-sissy-squat from appearing
 * - Without this guard, sissy variants would appear in past-knee plans and swaps
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

if (!Array.isArray(catalogue) || catalogue.length === 0) {
  console.error("❌ FATAL: catalogue.json is empty or invalid");
  process.exit(1);
}

console.log("Sissy Squat Ban Test (PR #73 Run 20)");
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
const sissy = catalogue.find((e) => e.slug.includes("sissy"));

if (!sissy) {
  console.error("❌ FATAL: No sissy exercise found in catalogue");
  process.exit(1);
}

console.log(`Testing sissy exercise: ${sissy.slug} (id=${sissy.id})`);
console.log(
  `  contraindicated_regions: ${JSON.stringify(sissy.contraindicated_regions)}`
);
console.log("");

// Test comprehensive grid: past-knee AND current-knee across equipment/days/minutes
const testProfiles: GeneratorInput[] = [];

for (const current of [true, false]) {
  for (const hasAll of [true, false]) {
    for (const days of [3, 4, 5]) {
      for (const minutes of [45, 60, 75]) {
        testProfiles.push({
          userId: `test-${current ? "current" : "past"}-${hasAll ? "all" : "limited"}-${days}d-${minutes}m`,
          blockNumber: 1,
          goal: "muscle_gain",
          level: "expert",
          primaryTrack: "weights",
          daysPerWeek: days,
          yogaDaysPerWeek: 0,
          age: 30,
          bmi: 22,
          hasAllEquipment: hasAll,
          equipmentIds: hasAll ? [] : ["dumbbell", "flat_bench"],
          currentInjuryRegions: current ? ["knee"] : [],
          anyKneeInjury: true,
          preferredSessionMinutes: minutes,
          catalogue,
        });
      }
    }
  }
}

console.log(`Testing ${testProfiles.length} profiles (current/past × equipment × days × minutes):\n`);

for (const input of testProfiles) {
  const plan = generateProgram(input);
  const hasSissy = plan.days.some((day) =>
    day.exercises.some((ex) => {
      const e = byId.get(ex.exerciseId);
      return e?.slug.includes("sissy");
    })
  );
  
  check(
    `${input.userId}: no sissy in plan`,
    !hasSissy,
    hasSissy ? "Found sissy in plan" : undefined
  );
}

// Final report
console.log("");
console.log("─".repeat(60));
if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log(`PASSED: All ${testProfiles.length} profiles verified - no sissy squats found`);
  process.exit(0);
}
