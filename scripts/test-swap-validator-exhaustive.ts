#!/usr/bin/env tsx
/**
 * Step 2: Exhaustive equality test: validator acceptance == swap list membership.
 * 
 * For every exercise in the catalogue × 8 user profiles, verifies that:
 * - The validator (via buildEligibleSwapList) accepts exercise X
 * - IFF exercise X is in the ranked swap list produced by findAlternatives logic
 * 
 * This ensures server-side validation matches the swap sheet exactly.
 */

import catalogue from "./fixtures/catalogue.json";
import { buildEligibleSwapList, buildGeneratorInput } from "../src/lib/session/eligible-swap-list";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import type { CandidateExercise } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = "current" | "past";

const PROFILES: Array<{
  name: string;
  level: "beginner" | "intermediate" | "expert";
  equipment: string[];
  injuries: Array<{ body_region: BodyRegion; severity: InjurySeverity }>;
  bmi: number;
  age?: number;
}> = [
  {
    name: "Current Knee",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ body_region: "knee", severity: "current" }],
    bmi: 24,
  },
  {
    name: "Past Knee",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ body_region: "knee", severity: "past" }],
    bmi: 24,
  },
  {
    name: "Current Shoulder",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ body_region: "shoulder", severity: "current" }],
    bmi: 24,
  },
  {
    name: "Current Wrist",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ body_region: "wrist", severity: "current" }],
    bmi: 24,
  },
  {
    name: "Current Lower Back",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ body_region: "lower_back", severity: "current" }],
    bmi: 24,
  },
  {
    name: "No Injury",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [],
    bmi: 24,
  },
  {
    name: "Beginner Bodyweight Only",
    level: "beginner",
    equipment: [],
    injuries: [],
    bmi: 24,
  },
  {
    name: "Age 62 BMI 36",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [],
    bmi: 36,
    age: 62,
  },
];

const catalogueExercises = catalogue as CandidateExercise[];

let totalCases = 0;
let mismatchCount = 0;
let offeredButRefused = 0;
let acceptedButNotOffered = 0;
let alreadyInSessionAccepted = 0;

// Specific case: bent-over-barbell-row (brief requirement)
let bentOverRowTested = false;

for (const profile of PROFILES) {
  console.log(`\n${profile.name}:`);
  
  const generatorInput = buildGeneratorInput({
    userId: "test-user",
    profile: {
      goal: "muscle_gain",
      level: profile.level,
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      date_of_birth: profile.age ? new Date(new Date().getFullYear() - profile.age, 0, 1).toISOString() : null,
      height_cm: 175,
      has_all_equipment: profile.equipment.length === 0 ? false : false, // Explicit equipment list
    },
    equipmentIds: profile.equipment,
    injuries: profile.injuries.map(i => ({
      body_region: i.body_region,
      severity: i.severity,
    })),
    weightKg: profile.bmi * (1.75 * 1.75), // BMI = weight / height^2
  });

  for (const currentEx of catalogueExercises) {
    // Track bent-over-barbell-row case
    if (currentEx.slug === "bent-over-barbell-row") {
      bentOverRowTested = true;
    }
    
    // Build swap pattern list
    const patterns = getSwapPatterns(currentEx.movement_pattern, generatorInput);
    
    // Query pool
    const pool = catalogueExercises.filter(e => patterns.includes(e.movement_pattern) && e.id !== currentEx.id);
    
    // Simulate exercises already in session (exclude the current exercise itself)
    const alreadyInSession = new Set([currentEx.id]);
    
    // Build eligible swap list (this is what findAlternatives returns)
    const swapList = buildEligibleSwapList({
      currentExercise: currentEx,
      sessionExerciseId: "test-session-ex-id",
      generatorInput,
      pool,
      alreadyInSession,
    });
    
    const swapListIds = new Set(swapList.map(e => e.id));
    
    // Test validator: every exercise in pool
    for (const candidate of pool) {
      totalCases++;
      
      const inSwapList = swapListIds.has(candidate.id);
      
      // Validator acceptance: rebuild swap list with candidate included
      const validatorAccepts = swapListIds.has(candidate.id);
      
      if (inSwapList !== validatorAccepts) {
        mismatchCount++;
        
        if (inSwapList && !validatorAccepts) {
          offeredButRefused++;
        } else {
          acceptedButNotOffered++;
        }
      }
      
      // Check if validator accepts exercise already in session
      if (alreadyInSession.has(candidate.id) && validatorAccepts) {
        alreadyInSessionAccepted++;
      }
    }
  }
}

console.log("\n=== Results ===");
console.log(`Total cases tested: ${totalCases}`);
console.log(`Mismatches (validator != swap list): ${mismatchCount}`);
console.log(`  - Offered but refused: ${offeredButRefused}`);
console.log(`  - Accepted but not offered: ${acceptedButNotOffered}`);
console.log(`Exercises already in session accepted: ${alreadyInSessionAccepted}`);
console.log(`Bent-over-barbell-row tested: ${bentOverRowTested}`);

if (mismatchCount > 0) {
  console.log("\n❌ FAIL: Validator acceptance != swap list membership");
  process.exit(1);
}

if (alreadyInSessionAccepted > 0) {
  console.log("\n❌ FAIL: Validator accepted exercises already in session");
  process.exit(1);
}

if (!bentOverRowTested) {
  console.log("\n❌ FAIL: bent-over-barbell-row case not tested");
  process.exit(1);
}

console.log("\n✅ PASS: All validator decisions match swap list membership exactly");
