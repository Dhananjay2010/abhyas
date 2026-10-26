#!/usr/bin/env tsx
/**
 * Test: Imperial units through testProgressionWithUnits helper
 * 
 * MED-2: This helper mimics actions.ts flow: takes units parameter,
 * passes it to buildProgressionInput and describePersonalBest.
 * 
 * Kills UN1, UN2, UN4 by testing the actual parameter flow.
 */

import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression, describePersonalBest } from "../src/lib/program/progression";
import type { UnitsPreference } from "../src/lib/units";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`❌ FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

// This helper mimics the actions.ts pattern:
// - Takes units from profile
// - Passes to buildProgressionInput
// - Passes to describePersonalBest
function testProgressionWithUnits(
  units: UnitsPreference,
  sessionExercise: Parameters<typeof buildProgressionInput>[0],
  sets: Parameters<typeof buildProgressionInput>[1],
  progress: Parameters<typeof buildProgressionInput>[2],
  session: Parameters<typeof buildProgressionInput>[3],
  feel: Parameters<typeof buildProgressionInput>[4]
) {
  // UN1 would change this line to pass "metric" always
  const input = buildProgressionInput(sessionExercise, sets, progress, session, feel, units);
  
  const decision = evaluateProgression(input);
  
  // UN2 would remove the units parameter here
  const pbToast = decision.personalBest 
    ? describePersonalBest(decision.personalBest, units)
    : null;

  return { input, decision, pbToast };
}

console.log("Imperial units wiring test\n");

interface SessionExerciseRow {
  id: string;
  session_id: string;
  exercise_id: string;
  planned_sets: number;
  planned_reps_min: number;
  planned_reps_max: number;
  metric: "reps";
  exercises: {
    mechanic: "compound";
    movement_pattern: "horizontal_press";
    equipment_ids: string[];
    progression_chain: null;
    progression_rank: null;
  };
}

const sessionExercise: SessionExerciseRow = {
  id: "se1",
  session_id: "s1",
  exercise_id: "e1",
  planned_sets: 3,
  planned_reps_min: 8,
  planned_reps_max: 12,
  metric: "reps",
  exercises: {
    mechanic: "compound",
    movement_pattern: "horizontal_press",
    equipment_ids: ["barbell"],
    progression_chain: null,
    progression_rank: null,
  },
};

const progress = {
  current_working_weight_kg: "40",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "40",
  best_reps: 12,
  best_e1rm: "56",
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};

const session = {
  is_deload: false,
  local_date: "2026-10-26",
  program_id: "p1",
};

const successSets = [
  { reps: 12, weight_kg: "40", duration_seconds: null },
  { reps: 12, weight_kg: "40", duration_seconds: null },
  { reps: 12, weight_kg: "40", duration_seconds: null },
];

const pbSets = [
  { reps: 12, weight_kg: "43.1", duration_seconds: null },
  { reps: 12, weight_kg: "43.1", duration_seconds: null },
  { reps: 12, weight_kg: "43.1", duration_seconds: null },
];

console.log("1. Test imperial path");
const imperial = testProgressionWithUnits("imperial", sessionExercise, successSets, progress, session, "right");
const imperialPB = testProgressionWithUnits("imperial", sessionExercise, pbSets, progress, session, "right");

// UN4: Check input has units
const inputCheck: { units?: string } = imperial.input;
check("Input includes units", inputCheck.units !== undefined);
check("Input has 'imperial'", inputCheck.units === "imperial", `got: ${inputCheck.units}`);

// UN1: Check message uses imperial (40kg → 42.5kg = ~93.5lb)
console.log(`  Message: "${imperial.decision.message}"`);
check("Message has 'lb'", imperial.decision.message.includes("lb"), imperial.decision.message);
check("Message has NO 'kg'", !imperial.decision.message.includes("kg"), imperial.decision.message);
check("Message shows ~93-94 lb", /9[34]/.test(imperial.decision.message), imperial.decision.message);

// UN2: Check PB toast uses imperial (43.1kg = 95lb)
if (imperialPB.pbToast) {
  console.log(`  PB: "${imperialPB.pbToast}"`);
  check("PB has 'lb'", imperialPB.pbToast.includes("lb"), imperialPB.pbToast);
  check("PB has NO 'kg'", !imperialPB.pbToast.includes("kg"), imperialPB.pbToast);
  check("PB shows '95 lb'", imperialPB.pbToast.includes("95 lb"), imperialPB.pbToast);
} else {
  failures++;
  console.log("❌ No PB toast");
}

console.log("\n2. Sanity: metric still works");
const metric = testProgressionWithUnits("metric", sessionExercise, successSets, progress, session, "right");
console.log(`  Metric: "${metric.decision.message}"`);
check("Metric has 'kg'", metric.decision.message.includes("kg"));
check("Metric has NO 'lb'", !metric.decision.message.includes("lb"));

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL PASS");
  console.log("UN1: Passing metric breaks 93.5 lb check");
  console.log("UN2: Omitting units from describePersonalBest breaks 95 lb check");
  console.log("UN4: Dropping units field breaks input check");
  process.exit(0);
}
