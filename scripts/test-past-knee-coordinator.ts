/**
 * Past-Knee Coordinator Test (PR #73 Run 20)
 * 
 * Verifies that past-knee injury handling works correctly:
 * - Uses PAST_KNEE_LUNGE_EXERCISES (4-exercise list) instead of KNEE_SAFE_QUAD_EXERCISES
 * - Excludes high-impact exercises
 * - Excludes unsafe lunges
 * - Excludes sissy squats
 */

import { readFileSync } from "node:fs";
import {
  generateProgram,
  PAST_KNEE_LUNGE_EXERCISES,
  type GeneratorInput,
  type CandidateExercise,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

console.log("Past-Knee Coordinator Test");
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

const byId = new Map(catalogue.map(e => [e.id, e]));

// Test: Past-knee injury (anyKneeInjury=true, currentInjuryRegions=[])
const pastKneeInput: GeneratorInput = {
  userId: "test-past-knee",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [], // Past knee, not current
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

const pastKneePlan = generateProgram(pastKneeInput);

// Check for high-impact exercises
const highImpact = pastKneePlan.days.flatMap(day =>
  day.exercises.filter(ex => {
    const e = byId.get(ex.exerciseId);
    return e?.impact === "high";
  })
);

check(
  "Past-knee: no high-impact exercises",
  highImpact.length === 0,
  highImpact.length > 0 ? `Found ${highImpact.length} high-impact exercises` : undefined
);

// Check for unsafe lunges
const unsafeLunges = ["deficit-lunge", "pistol-squat", "side-split-squat"];
const hasUnsafeLunges = pastKneePlan.days.flatMap(day =>
  day.exercises.filter(ex => {
    const e = byId.get(ex.exerciseId);
    return e && unsafeLunges.some(slug => e.slug.includes(slug));
  })
);

check(
  "Past-knee: no unsafe lunges",
  hasUnsafeLunges.length === 0,
  hasUnsafeLunges.length > 0
    ? `Found ${hasUnsafeLunges.length} unsafe lunges`
    : undefined
);

// Check for sissy squats
const sissySquats = pastKneePlan.days.flatMap(day =>
  day.exercises.filter(ex => {
    const e = byId.get(ex.exerciseId);
    return e?.slug.includes("sissy");
  })
);

check(
  "Past-knee: no sissy squats",
  sissySquats.length === 0,
  sissySquats.length > 0 ? `Found ${sissySquats.length} sissy squats` : undefined
);

// Check that lower/full days have quad work
const lowerFullDays = pastKneePlan.days.filter(
  day =>
    (day.dayType === "weights" || day.dayType === "bodyweight") &&
    (day.focus === "lower" || day.focus === "full_body" || day.focus === "legs")
);

for (const day of lowerFullDays) {
  const hasQuad = day.exercises.some(ex => {
    const e = byId.get(ex.exerciseId);
    return e?.primary_muscles.includes("quads");
  });
  
  check(
    `Past-knee ${day.label}: has quad work`,
    hasQuad,
    !hasQuad ? "Missing quad work" : undefined
  );
}

// Verify PAST_KNEE_LUNGE_EXERCISES list
console.log("");
console.log(`PAST_KNEE_LUNGE_EXERCISES: ${Array.from(PAST_KNEE_LUNGE_EXERCISES).join(", ")}`);
check(
  "PAST_KNEE_LUNGE_EXERCISES has 4 exercises",
  PAST_KNEE_LUNGE_EXERCISES.size === 4,
  `Expected 4, got ${PAST_KNEE_LUNGE_EXERCISES.size}`
);

console.log("");
console.log("─".repeat(60));

if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log("PASSED: All past-knee coordinator checks passed");
  process.exit(0);
}
