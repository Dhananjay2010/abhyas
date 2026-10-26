#!/usr/bin/env npx tsx
/**
 * Test knee-volume invariants (section 4 of brief).
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  PAST_KNEE_LUNGE_EXERCISES,
} from "../src/lib/program/generate";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";
import { prescribe } from "../src/lib/program/prescription";
import { KNEE_PROFILES, makeGeneratorInput } from "./knee-volume-grid";
import { templatesFor, placeYoga, activeDayIndices } from "../src/lib/program/splits";

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
    // MED-1: Classify by slot type, not orderIndex (Full Body C lunge slot is orderIndex 0)
    if (hasPastKnee && input.hasAllEquipment) {
      // Find the template for this day to identify which slot is the lunge slot
      const yogaDays = 0; // ProfileSpec doesn't have yogaDaysPerWeek
      const trainingDays = Math.max(1, spec.daysPerWeek - Math.min(yogaDays, spec.daysPerWeek - 1));
      const templates = templatesFor(trainingDays);
      const laidOut = placeYoga(templates, yogaDays);
      const activeIdx = activeDayIndices(spec.daysPerWeek);
      const slotPos = activeIdx.indexOf(day.dayIndex);
      
      if (slotPos >= 0 && slotPos < laidOut.length) {
        const entry = laidOut[slotPos];
        if (entry && typeof entry !== "string" && entry.label !== "Yoga") {
          const lungeSlotIndex = entry.slots.indexOf("lunge");
          if (lungeSlotIndex >= 0) {
            // This day has a lunge slot - check the exercise at that slot
            const lungeSlotEx = exercises.find(e => {
              // Match by orderIndex, but account for exercises potentially being reordered
              // The lunge slot should be filled by the exercise that was assigned to that template slot
              // For simplicity, check if the orderIndex matches the template slot position
              // OR if the movement pattern is lunge/squat and it's the right position
              return e.orderIndex === lungeSlotIndex || 
                     (e.orderIndex === lungeSlotIndex && 
                      (e.exData?.movement_pattern === "lunge" || e.exData?.movement_pattern === "squat"));
            });
            
            if (lungeSlotEx && lungeSlotEx.exData) {
              const inList = PAST_KNEE_LUNGE_EXERCISES.has(lungeSlotEx.exData.slug);
              if (!inList && lungeSlotEx.exData.movement_pattern !== "lunge") {
                // It's OK if it's an actual lunge-pattern exercise, but if it's a squat fallback, it must be from the list
                if (lungeSlotEx.exData.movement_pattern === "squat") {
                  fail(`${spec.id} day ${day.dayIndex} (${entry.label}): lunge slot (template slot ${lungeSlotIndex}) has ${lungeSlotEx.name} at orderIndex ${lungeSlotEx.orderIndex} (not in PAST_KNEE_LUNGE_EXERCISES)`);
                }
              }
            }
          }
        }
      }
    }
    
    // Invariant 3: Any knee user: every knee-risk exercise has targetSets <= prescribe() value
    // (M2 duration shrink may reduce sets for short sessions, but M3 time-fill must not add sets)
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
        
        // Check that targetSets does not exceed prescription (M3 time-fill must not add sets)
        if (ex.targetSets > prescribed.sets) {
          fail(`${spec.id} day ${day.dayIndex}: knee-risk ${ex.name} has ${ex.targetSets} sets, exceeds ${prescribed.sets} from prescribe()`);
        }
        
        // Check level caps at 60 min (but allow M2 shrink to reduce below)
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
console.log("\nTesting pk and pkb specific profiles...");
const pkInput = makeGeneratorInput(pkSpec!, catalogue);
const pkResult = generateProgram(pkInput);

const pkLower = pkResult.days.find(d => d.focus === "lower");
console.log("pk: Lower day found =", !!pkLower);
if (!pkLower) {
  fail("pk: No Lower day found");
} else {
  const lungeExercises = pkLower.exercises.filter(e => {
    const ex = catalogueById.get(e.exerciseId);
    return ex?.movement_pattern === "lunge" || ex?.movement_pattern === "squat";
  });
  
  if (lungeExercises.length === 0) {
    fail(`pk: Lower day has no lunge/squat exercises`);
  }
  
  const pastKneeLungeEx = lungeExercises.find(e => {
    const ex = catalogueById.get(e.exerciseId);
    return ex && PAST_KNEE_LUNGE_EXERCISES.has(ex.slug) && e.orderIndex !== 0;
  });
  
  if (!pastKneeLungeEx) {
    fail(`pk: Lower day has no PAST_KNEE_LUNGE_EXERCISES exercise outside squat slot`);
  }
  
  // Check Barbell Squat is in slot 0 (squat slot exception: slot 0 keeps Barbell Squat)
  const slot0 = pkLower.exercises.find(e => e.orderIndex === 0);
  if (!slot0 || catalogueById.get(slot0.exerciseId)?.slug !== "barbell-squat") {
    fail(`pk: Expected Barbell Squat in slot 0 but got ${slot0?.name || "nothing"}`);
  }
}

const pkbInput = makeGeneratorInput(pkbSpec!, catalogue);
const pkbResult = generateProgram(pkbInput);

const pkbLower = pkbResult.days.find(d => d.focus === "lower");
if (!pkbLower) {
  fail("pkb: No Lower day found");
} else {
  const lungeExercises = pkbLower.exercises.filter(e => {
    const ex = catalogueById.get(e.exerciseId);
    return ex?.movement_pattern === "lunge" || ex?.movement_pattern === "squat";
  });
  
  if (lungeExercises.length === 0) {
    fail(`pkb: Lower day has no lunge/squat exercises`);
  }
  
  const pastKneeLungeEx = lungeExercises.find(e => {
    const ex = catalogueById.get(e.exerciseId);
    return ex && PAST_KNEE_LUNGE_EXERCISES.has(ex.slug) && e.orderIndex !== 0;
  });
  
  if (!pastKneeLungeEx) {
    fail(`pkb: Lower day has no PAST_KNEE_LUNGE_EXERCISES exercise outside squat slot`);
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
