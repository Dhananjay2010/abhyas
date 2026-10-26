/**
 * Test past-knee squat swap ordering for PR #152 follow-up (Part B).
 * 
 * Verifies that past-knee squat swaps:
 * 1. Are never empty
 * 2. Offer PAST_KNEE_LUNGE_EXERCISES first (spanish-squat, wall-sit, leg-extensions, single-leg-leg-extension)
 *    in that order, filtered by equipment and excluding the current exercise
 * 3. Then offer knee-safe hinge/bridge fallbacks (hip thrust, glute bridge, RDL variants, hamstring curl)
 * 4. Contain no knee-risk exercises
 * 
 * Tests three equipment profiles:
 * - Full gym
 * - Dumbbells only
 * - Home bodyweight
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { PAST_KNEE_LUNGE_EXERCISES } from "../src/lib/program/generate";
import { buildEligibleSwapList, buildGeneratorInput } from "../src/lib/session/eligible-swap-list";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Real equipment IDs from seed data
const FULL_GYM_EQUIPMENT = [
  "00000000-0000-4000-8000-000000000001", // barbell
  "00000000-0000-4000-8000-000000000002", // dumbbell
  "00000000-0000-4000-8000-000000000003", // flat_bench
  "00000000-0000-4000-8000-000000000004", // squat_rack
  "00000000-0000-4000-8000-000000000005", // pull_up_bar
  "00000000-0000-4000-8000-000000000006", // cable_machine
  "00000000-0000-4000-8000-000000000007", // kettlebell
  "00000000-0000-4000-8000-000000000008", // resistance_band
  "00000000-0000-4000-8000-000000000009", // leg_extension
  "00000000-0000-4000-8000-00000000000a", // leg_curl
  "00000000-0000-4000-8000-00000000000b", // machine_generic
];

const DUMBBELL_EQUIPMENT = [
  "00000000-0000-4000-8000-000000000002", // dumbbell
  "00000000-0000-4000-8000-000000000003", // flat_bench
];

const HOME_BODYWEIGHT_EQUIPMENT: string[] = [];

let failures = 0;
let passes = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function testProfile(profileName: string, equipmentIds: string[], currentSlug: string) {
  console.log(`\n${profileName} — Current: ${currentSlug}`);
  
  const generatorInput = buildGeneratorInput({
    userId: "test-user",
    profile: {
      goal: "muscle",
      level: "intermediate",
      primary_track: "strength",
      days_per_week: 3,
      yoga_days_per_week: 0,
      date_of_birth: "1990-01-01",
      height_cm: 175,
      has_all_equipment: equipmentIds.length >= FULL_GYM_EQUIPMENT.length,
    },
    equipmentIds,
    injuries: [{ body_region: "knee", severity: "past" }],
    weightKg: 75,
  });
  
  const current = catalogue.find(e => e.slug === currentSlug);
  if (!current) {
    console.error(`  ✗ ${currentSlug} not found in catalogue`);
    failures++;
    return;
  }
  
  const ranked = buildEligibleSwapList({
    currentExercise: current,
    sessionExerciseId: "test-id",
    generatorInput,
    pool: catalogue,
    alreadyInSession: new Set([current.id]),
  });
  
  // 1. Never empty
  check("swap list is non-empty", ranked.length > 0, `got ${ranked.length} exercises`);
  
  if (ranked.length === 0) {
    return; // Skip further checks if empty
  }
  
  // 2. No knee-risk exercises
  const kneeRisk = ranked.filter(ex => isKneeRiskForKneeUser(ex, true));
  check("contains no knee-risk exercises", kneeRisk.length === 0, 
    kneeRisk.length > 0 ? `found: ${kneeRisk.map(e => e.slug).join(", ")}` : "");
  
  // 3. Verify ordering: PAST_KNEE_LUNGE_EXERCISES first, then others
  const quadIsolationSlugs = Array.from(PAST_KNEE_LUNGE_EXERCISES);
  const quadIsolationInList = ranked.filter(ex => quadIsolationSlugs.includes(ex.slug));
  const otherExercises = ranked.filter(ex => !quadIsolationSlugs.includes(ex.slug));
  
  if (quadIsolationInList.length > 0) {
    // Find the last quad isolation exercise index
    let lastQuadIndex = -1;
    for (let i = 0; i < ranked.length; i++) {
      if (quadIsolationSlugs.includes(ranked[i].slug)) {
        lastQuadIndex = i;
      }
    }
    
    // Find the first non-quad exercise index
    let firstOtherIndex = -1;
    for (let i = 0; i < ranked.length; i++) {
      if (!quadIsolationSlugs.includes(ranked[i].slug)) {
        firstOtherIndex = i;
        break;
      }
    }
    
    if (firstOtherIndex !== -1) {
      check("quad isolation exercises come before hinge fallbacks", 
        lastQuadIndex < firstOtherIndex,
        `last quad at ${lastQuadIndex}, first other at ${firstOtherIndex}`);
    }
    
    // 4. Verify quad isolation order (spanish-squat, wall-sit, leg-extensions, single-leg-leg-extension)
    const expectedOrder = ["spanish-squat", "wall-sit", "leg-extensions", "single-leg-leg-extension"];
    const actualQuadOrder = quadIsolationInList.map(ex => ex.slug);
    const expectedQuadOrder = expectedOrder.filter(slug => actualQuadOrder.includes(slug));
    const orderCorrect = actualQuadOrder.every((slug, i) => slug === expectedQuadOrder[i]);
    check("quad isolation in correct order", orderCorrect,
      `expected [${expectedQuadOrder.join(", ")}], got [${actualQuadOrder.join(", ")}]`);
  }
  
  // 5. Verify hinge fallbacks are knee-safe
  const hingePattern = otherExercises.filter(ex => ex.movement_pattern === "hinge");
  if (hingePattern.length > 0) {
    const hingeKneeRisk = hingePattern.filter(ex => isKneeRiskForKneeUser(ex, true));
    check("hinge fallbacks are knee-safe", hingeKneeRisk.length === 0,
      hingeKneeRisk.length > 0 ? `knee-risk hinges: ${hingeKneeRisk.map(e => e.slug).join(", ")}` : "");
  }
  
  // Print the list for inspection
  console.log(`  List (${ranked.length}):`);
  ranked.forEach((ex, i) => {
    const isQuad = quadIsolationSlugs.includes(ex.slug);
    const marker = isQuad ? " [quad]" : ` [${ex.movement_pattern}]`;
    console.log(`    ${i + 1}. ${ex.slug}${marker}`);
  });
}

console.log("=== Past-knee squat swap ordering tests ===\n");

// Test 1: Full gym with barbell-squat
testProfile("Full gym", FULL_GYM_EQUIPMENT, "barbell-squat");

// Test 2: Dumbbells only with goblet-squat
testProfile("Dumbbells only", DUMBBELL_EQUIPMENT, "goblet-squat");

// Test 3: Home bodyweight with bodyweight-squat
// Note: bodyweight-squat is itself knee-risk for past-knee users, 
// but Spanish Squat (current) would work
testProfile("Home bodyweight", HOME_BODYWEIGHT_EQUIPMENT, "spanish-squat");

console.log(`\n${failures === 0 ? "✓" : "✗"} ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
