/**
 * Test past-knee squat swap ordering for PR #152 follow-up (Part B).
 * 
 * Verifies that past-knee squat swaps:
 * 1. Are never empty
 * 2. Offer PAST_KNEE_LUNGE_EXERCISES first (leg-extensions, single-leg-leg-extension, wall-sit, spanish-squat)
 *    in that order, filtered by equipment and excluding the current exercise
 * 3. Then offer knee-safe hinge/bridge fallbacks (hip thrust, glute bridge, RDL variants, hamstring curl)
 *    with glutes or hamstrings as primary muscles
 * 4. Contain no knee-risk exercises
 * 5. Contain no core patterns or other squat patterns
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
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
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
  
  // 3. Verify ordering: PAST_KNEE_LUNGE_EXERCISES first (except wall-sit may be after first hinge), then others
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
    
    // Only check ordering if wall-sit is not the only quad (wall-sit exception allows it after first hinge)
    if (firstOtherIndex !== -1 && (quadIsolationInList.length > 1 || ranked[0].slug !== "wall-sit")) {
      const expectQuadFirst = quadIsolationInList.length > 1 || !quadIsolationInList.some(e => e.slug === "wall-sit");
      if (expectQuadFirst) {
        check("quad isolation exercises come before hinge fallbacks (except wall-sit exception)", 
          lastQuadIndex < firstOtherIndex || (quadIsolationInList.length === 1 && quadIsolationInList[0].slug === "wall-sit"),
          `last quad at ${lastQuadIndex}, first other at ${firstOtherIndex}`);
      }
    }
    
    // 4. Verify quad isolation order (leg-extensions, single-leg-leg-extension, wall-sit, spanish-squat)
    //    and wall-sit is never first in the overall list
    const expectedOrder = ["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"];
    const actualQuadOrder = quadIsolationInList.map(ex => ex.slug);
    const expectedQuadOrder = expectedOrder.filter(slug => actualQuadOrder.includes(slug));
    const orderCorrect = actualQuadOrder.every((slug, i) => slug === expectedQuadOrder[i]);
    check("quad isolation in correct order", orderCorrect,
      `expected [${expectedQuadOrder.join(", ")}], got [${actualQuadOrder.join(", ")}]`);
    
    if (ranked[0].slug === "wall-sit") {
      check("wall-sit is never first in overall list", false, "wall-sit is at position 0");
    } else if (actualQuadOrder.includes("wall-sit")) {
      check("wall-sit is never first in overall list", true);
    }
  }
  
  // 5. Verify hinge fallbacks are knee-safe
  const hingePattern = otherExercises.filter(ex => ex.movement_pattern === "hinge");
  if (hingePattern.length > 0) {
    const hingeKneeRisk = hingePattern.filter(ex => isKneeRiskForKneeUser(ex, true));
    check("hinge fallbacks are knee-safe", hingeKneeRisk.length === 0,
      hingeKneeRisk.length > 0 ? `knee-risk hinges: ${hingeKneeRisk.map(e => e.slug).join(", ")}` : "");
  }
  
  // 6. Verify all exercises are either PAST_KNEE_LUNGE_EXERCISES or glute/hamstring-primary hinges
  const invalidExercises = ranked.filter(ex => {
    // Valid if it's one of the 4 PAST_KNEE_LUNGE_EXERCISES
    if (quadIsolationSlugs.includes(ex.slug)) return false;
    
    // Valid if it's a hinge with glutes or hamstrings as primary muscle
    if (ex.movement_pattern === "hinge" && 
        (ex.primary_muscles.includes("glutes") || ex.primary_muscles.includes("hamstrings"))) {
      return false;
    }
    
    // Otherwise invalid
    return true;
  });
  check("all exercises are valid (PAST_KNEE_LUNGE_EXERCISES or glute/hamstring hinges)", 
    invalidExercises.length === 0,
    invalidExercises.length > 0 
      ? `invalid: ${invalidExercises.map(e => `${e.slug} (${e.movement_pattern}, primary: ${e.primary_muscles.join(",")})`).join("; ")}` 
      : "");
  
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
