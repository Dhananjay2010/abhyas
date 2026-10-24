/**
 * Tests for swap variety with safety exclusions (QA Task U3 + L-8).
 * 
 * Requirements:
 * 1. Hard-coded exclusions: behind-the-neck, wide-grip-rear-pull-up, barbell-guillotine-bench-press
 * 2. Pullover exclusion for compound pulls
 * 3. All-catalogue check: 0 new breaks vs main, 0 excluded slugs anywhere
 * 4. Oracle checks for 4 key exercises
 * 5. No tie-break variety (step 4 skipped)
 *
 *   npm run test:swap-variety
 */
import { rankAlternatives, buildPatternList, EXCLUDED_EXERCISE_SLUGS, type AlternativesContext, type ExerciseRow } from "../src/lib/program/alternatives";
import { hashString } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";
import fixtureData from "./fixtures/catalogue.json";

type MovementPattern = Database["public"]["Enums"]["movement_pattern"];
type FixtureExercise = typeof fixtureData[0];

const catalogue = fixtureData as unknown as ExerciseRow[];

const scoreFn = (exercise: ExerciseRow): number => {
  if (exercise.mechanic === "compound") return 100;
  return 50;
};

const tieBreakFn = (exerciseId: string): number => {
  return hashString(`test:${exerciseId}`);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
}

// Equipment profiles for all-catalogue testing
const EQUIPMENT_PROFILES = {
  "full-gym": null,
  "home-dumbbell-bands": new Set(["dumbbell", "resistance_band", "adjustable_bench"]),
  "cable-dumbbell": new Set(["cable_machine", "dumbbell"]),
  "pullup-bar-only": new Set(["pull_up_bar"]),
  "bodyweight": new Set([]),
  "barbell-rack": new Set(["barbell", "squat_rack", "flat_bench"]),
};

console.log("\n1. Oracle check: Lat Pulldown (wide-grip-lat-pulldown, full gym)");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn,
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Expected: no behind-the-neck, no wide-grip-rear-pull-up, no pullovers
    const expected = [
      "full-range-of-motion-lat-pulldown",
      "one-arm-lat-pulldown",
      "close-grip-front-lat-pulldown",
      "v-bar-pulldown",
      "underhand-cable-pulldowns",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected), 
      slugs.join(", "));
    
    check("no excluded slugs", slugs.every(s => !EXCLUDED_EXERCISE_SLUGS.has(s)));
    check("no pullovers", slugs.every(s => !s.includes("pullover")));
  }
}

console.log("\n2. Oracle check: Barbell Bench Press (barbell-bench-press-medium-grip, full gym)");
{
  const current = catalogue.find((e) => e.slug === "barbell-bench-press-medium-grip");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn,
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Expected: no guillotine bench press
    const expected = [
      "wide-grip-decline-barbell-bench-press",
      "barbell-incline-bench-press-medium-grip",
      "wide-grip-barbell-bench-press",
      "reverse-band-bench-press",
      "bench-press-powerlifting",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected),
      slugs.join(", "));
    
    check("no guillotine", !slugs.includes("barbell-guillotine-bench-press"));
    check("no excluded slugs", slugs.every(s => !EXCLUDED_EXERCISE_SLUGS.has(s)));
  }
}

console.log("\n3. Oracle check: Barbell Squat (barbell-squat, full gym)");
{
  const current = catalogue.find((e) => e.slug === "barbell-squat");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn,
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    const expected = [
      "box-squat",
      "squat-with-plate-movers",
      "wide-stance-barbell-squat",
      "front-squat-clean-grip",
      "squat-with-bands",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected),
      slugs.join(", "));
  }
}

console.log("\n4. Oracle check: Seated Cable Rows (seated-cable-rows, full gym)");
{
  const current = catalogue.find((e) => e.slug === "seated-cable-rows");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn,
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Expected: no pullovers (compound horizontal_pull)
    const expected = [
      "seated-one-arm-cable-pulley-rows",
      "low-pulley-row-to-neck",
      "shotgun-row",
      "face-pull",
      "elevated-cable-rows",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected),
      slugs.join(", "));
    
    check("no pullovers", slugs.every(s => !s.includes("pullover")));
  }
}

console.log("\n5. All-catalogue check: 0 excluded slugs appear anywhere");
{
  let totalLists = 0;
  let excludedFound = 0;
  
  for (const exercise of catalogue) {
    const patterns = buildPatternList(exercise.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    for (const [profileName, equipment] of Object.entries(EQUIPMENT_PROFILES)) {
      const ctx: AlternativesContext = {
        level: "intermediate",
        availableEquipment: equipment,
        injuryRegions: [],
        limit: 5,
        scoreFn,
        tieBreakFn,
      };
      
      const alternatives = rankAlternatives(exercise, pool, ctx);
      
      if (alternatives.length >= 3) {
        totalLists++;
        
        for (const alt of alternatives) {
          if (EXCLUDED_EXERCISE_SLUGS.has(alt.slug)) {
            excludedFound++;
            console.log(`  Found excluded slug: ${alt.slug} in ${exercise.slug} (${profileName})`);
          }
        }
      }
    }
  }
  
  check(`checked ${totalLists} lists`, totalLists > 0, `${totalLists} lists`);
  check("no excluded slugs found", excludedFound === 0, `${excludedFound} violations`);
}

console.log("\n6. All-catalogue check: no pullovers in compound pull lists");
{
  let pullLists = 0;
  let pulloverViolations = 0;
  
  for (const exercise of catalogue) {
    const isCompoundPull = 
      (exercise.movement_pattern === "horizontal_pull" || exercise.movement_pattern === "vertical_pull") &&
      exercise.mechanic === "compound";
    
    if (!isCompoundPull) continue;
    
    const patterns = buildPatternList(exercise.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn,
    };
    
    const alternatives = rankAlternatives(exercise, pool, ctx);
    
    if (alternatives.length >= 3) {
      pullLists++;
      
      for (const alt of alternatives) {
        if (alt.name.toLowerCase().includes("pullover") || alt.slug.includes("pullover")) {
          pulloverViolations++;
          console.log(`  Pullover in ${exercise.slug}: ${alt.slug}`);
        }
      }
    }
  }
  
  check(`checked ${pullLists} compound pull lists`, pullLists > 0, `${pullLists} lists`);
  check("no pullovers found", pulloverViolations === 0, `${pulloverViolations} violations`);
}

if (failures === 0) {
  console.log("\n✓ All tests passed\n");
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
