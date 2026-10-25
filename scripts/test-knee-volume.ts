#!/usr/bin/env npx tsx
/**
 * Test knee-volume invariants (section 4 of brief).
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
  PAST_KNEE_LUNGE_EXERCISES,
} from "../src/lib/program/generate";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";
import { prescribe } from "../src/lib/program/prescription";
import { KNEE_PROFILES, makeGeneratorInput } from "./knee-volume-grid";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

let failures = 0;

function fail(message: string) {
  console.error(`FAIL: ${message}`);
  failures++;
}

console.log(`Testing ${KNEE_PROFILES.length} knee profiles for invariants...`);

// Test past-knee profiles (any goal, 60 min, all equipment)
const pkSpec = KNEE_PROFILES.find(s => 
  s.injuries.some(i => i.body_region === "knee" && i.severity === "past") &&
  s.level === "intermediate" &&
  s.daysPerWeek === 4 &&
  s.sessionMinutes === 60 &&
  s.hasAllEquipment
);
const pkbSpec = KNEE_PROFILES.find(s => 
  s.injuries.some(i => i.body_region === "knee" && i.severity === "past") &&
  s.level === "beginner" &&
  s.daysPerWeek === 4 &&
  s.sessionMinutes === 60 &&
  s.hasAllEquipment
);

if (!pkSpec || !pkbSpec) {
  fail(`Could not find pk or pkb profile in grid (have ${KNEE_PROFILES.length} knee profiles)`);
  process.exit(1);
}

for (const spec of KNEE_PROFILES) {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  
  const hasPastKnee = spec.injuries.some(i => 
    i.body_region === "knee" && i.severity === "past"
  );
  const hasCurrentKnee = spec.injuries.some(i =>
    i.body_region === "knee" && i.severity === "current"
  );
  
  for (const day of result.days) {
    if (day.dayType === "rest") continue;
    
    const isLowerOrFullDay = day.focus === "lower" || day.focus === "full_body" || day.focus === "legs";
    
    if (!isLowerOrFullDay) continue;
    
    const exercises = day.exercises.map(ex => {
      const exData = catalogueById.get(ex.exerciseId);
      return { ...ex, exData };
    }).filter(e => e.exData !== undefined);
    
    // Invariant 1: Past-knee: no Lower/Legs/Full day contains two squat-pattern knee-risk exercises
    if (hasPastKnee) {
      const kneeRiskSquats = exercises.filter(e => 
        e.exData!.movement_pattern === "squat" && 
        isKneeRiskForKneeUser(e.exData!, input.anyKneeInjury)
      );
      
      if (kneeRiskSquats.length >= 2) {
        fail(`${spec.id} day ${day.dayIndex}: ${kneeRiskSquats.length} knee-risk squats (${kneeRiskSquats.map(e => e.name).join(", ")})`);
      }
      
      // No knee-risk exercise in lunge slot
      const lungeSlotExercises = exercises.filter(e => {
        // Lunge slot is typically at index 2 for Lower, but check by template
        // For simplicity, check if any lunge-pattern slot has a knee-risk exercise
        return e.exData!.movement_pattern === "lunge" || 
               (e.orderIndex === 2 && isLowerOrFullDay);
      });
      
      for (const ex of lungeSlotExercises) {
        if (isKneeRiskForKneeUser(ex.exData!, input.anyKneeInjury) && 
            ex.exData!.movement_pattern === "squat") {
          fail(`${spec.id} day ${day.dayIndex}: knee-risk squat ${ex.name} in lunge slot`);
        }
      }
    }
    
    // Invariant 2: Past-knee with needed equipment: lunge slot filled from PAST_KNEE_LUNGE_EXERCISES
    if (hasPastKnee && input.hasAllEquipment) {
      // Find lunge slot (index 2 for Lower template)
      const lungeSlotEx = exercises.find(e => e.orderIndex === 2);
      if (lungeSlotEx && lungeSlotEx.exData) {
        const inList = PAST_KNEE_LUNGE_EXERCISES.has(lungeSlotEx.exData.slug);
        if (!inList && lungeSlotEx.exData.movement_pattern !== "lunge") {
          // It's OK if it's an actual lunge-pattern exercise, but if it's a squat fallback, it must be from the list
          if (lungeSlotEx.exData.movement_pattern === "squat") {
            fail(`${spec.id} day ${day.dayIndex}: lunge slot has ${lungeSlotEx.name} (not in PAST_KNEE_LUNGE_EXERCISES)`);
          }
        }
      }
    }
    
    // Invariant 3: Any knee user: every knee-risk exercise has targetSets equal to prescribe() value
    if (input.anyKneeInjury) {
      for (const ex of exercises) {
        if (!ex.exData) continue;
        if (!isKneeRiskForKneeUser(ex.exData, input.anyKneeInjury)) continue;
        
        const prescribed = prescribe(
          input.goal,
          input.level,
          ex.exData.mechanic === "isolation",
          ex.exData.metric ?? "reps",
          input.preferredSessionMinutes,
          ex.exData.equipment_ids
        );
        
        if (ex.targetSets !== prescribed.sets) {
          fail(`${spec.id} day ${day.dayIndex}: knee-risk ${ex.name} has ${ex.targetSets} sets, expected ${prescribed.sets} from prescribe()`);
        }
        
        // Check level caps
        const maxSets = input.level === "beginner" ? 3 : 4;
        if (input.preferredSessionMinutes === 60 && ex.targetSets > maxSets) {
          fail(`${spec.id} day ${day.dayIndex}: knee-risk ${ex.name} has ${ex.targetSets} sets, max ${maxSets} for ${input.level} at 60 min`);
        }
      }
    }
    
    // Invariant 5: Every Lower/Legs/Full day for knee users keeps >= 1 non-core lower-body move
    if (input.anyKneeInjury) {
      const lowerBodyNonCore = exercises.filter(e => {
        if (!e.exData) return false;
        const pattern = e.exData.movement_pattern;
        return pattern === "squat" || pattern === "lunge" || pattern === "hinge" || pattern === "calf";
      });
      
      if (lowerBodyNonCore.length === 0) {
        fail(`${spec.id} day ${day.dayIndex}: no non-core lower-body move`);
      }
    }
  }
  
  // Invariant 6: Determinism
  const result2 = generateProgram(input);
  if (JSON.stringify(result) !== JSON.stringify(result2)) {
    fail(`${spec.id}: non-deterministic (two calls differ)`);
  }
}

// Test pk and pkb specific constraints
const pkInput = makeGeneratorInput(pkSpec!, catalogue);
const pkResult = generateProgram(pkInput);

const pkLower = pkResult.days.find(d => d.focus === "lower");
if (pkLower) {
  const lungeSlotEx = pkLower.exercises.find(e => e.orderIndex === 2);
  if (lungeSlotEx) {
    const exData = catalogueById.get(lungeSlotEx.exerciseId);
    if (exData && !PAST_KNEE_LUNGE_EXERCISES.has(exData.slug)) {
      fail(`pk: lunge slot has ${lungeSlotEx.name}, not in PAST_KNEE_LUNGE_EXERCISES`);
    }
  }
  
  // Check Back Squat sets
  const backSquat = pkLower.exercises.find(e => {
    const ex = catalogueById.get(e.exerciseId);
    return ex?.slug === "barbell-squat";
  });
  
  if (backSquat && backSquat.targetSets > 4) {
    fail(`pk: Barbell Squat has ${backSquat.targetSets} sets, expected <= 4`);
  }
}

const pkbInput = makeGeneratorInput(pkbSpec!, catalogue);
const pkbResult = generateProgram(pkbInput);

const pkbLower = pkbResult.days.find(d => d.focus === "lower");
if (pkbLower) {
  const lungeSlotEx = pkbLower.exercises.find(e => e.orderIndex === 2);
  if (lungeSlotEx) {
    const exData = catalogueById.get(lungeSlotEx.exerciseId);
    if (exData && !PAST_KNEE_LUNGE_EXERCISES.has(exData.slug)) {
      fail(`pkb: lunge slot has ${lungeSlotEx.name}, not in PAST_KNEE_LUNGE_EXERCISES`);
    }
  }
  
  // Check Back Squat sets
  const backSquat = pkbLower.exercises.find(e => {
    const ex = catalogueById.get(e.exerciseId);
    return ex?.slug === "barbell-squat";
  });
  
  if (backSquat && backSquat.targetSets > 3) {
    fail(`pkb: Barbell Squat has ${backSquat.targetSets} sets, expected <= 3`);
  }
}

// Test helper directly
console.log(`\nTesting isKneeRiskForKneeUser helper...`);

const gobletSquat = catalogue.find(e => e.slug === "goblet-squat");
const barbellSquat = catalogue.find(e => e.slug === "barbell-squat");
const legExtensions = catalogue.find(e => e.slug === "leg-extensions");
const spanishSquat = catalogue.find(e => e.slug === "spanish-squat");
const boxSquat = catalogue.find(e => e.slug === "box-squat");

if (gobletSquat && !isKneeRiskForKneeUser(gobletSquat, true)) {
  fail("Helper: Goblet Squat should be knee-risk for knee users");
}

if (barbellSquat && !isKneeRiskForKneeUser(barbellSquat, true)) {
  fail("Helper: Barbell Squat should be knee-risk for knee users");
}

if (legExtensions && isKneeRiskForKneeUser(legExtensions, true)) {
  fail("Helper: Leg Extensions should NOT be knee-risk (in knee-safe list)");
}

if (spanishSquat && isKneeRiskForKneeUser(spanishSquat, true)) {
  fail("Helper: Spanish Squat should NOT be knee-risk (in knee-safe list)");
}

if (boxSquat && !isKneeRiskForKneeUser(boxSquat, true)) {
  fail("Helper: Box Squat should be knee-risk (derived)");
}

if (gobletSquat && isKneeRiskForKneeUser(gobletSquat, false)) {
  fail("Helper: Goblet Squat should NOT be knee-risk for non-knee users");
}

if (failures === 0) {
  console.log(`\n✓ All invariants passed`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} failures`);
  process.exit(1);
}
