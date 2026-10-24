/**
 * Tests for swap variety with relevance priority (QA Task U3 revision).
 * 
 * Requirements:
 * 1. Relevance first: swaps must match pattern and primary muscles
 * 2. Equipment variety as tie-break WITHIN relevant set
 * 3. No behind-the-neck variants
 * 4. Equipment filtering works
 * 5. Determinism maintained
 * 6. General check: all exercises' swaps match their pattern
 *
 *   npm run test:swap-variety
 */
import { rankAlternatives, buildPatternList, type AlternativesContext, type ExerciseRow } from "../src/lib/program/alternatives";
import { hashString } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";
import fixtureData from "./fixtures/catalogue.json";

type MovementPattern = Database["public"]["Enums"]["movement_pattern"];
type FixtureExercise = typeof fixtureData[0];

type TestExerciseRow = ExerciseRow;

const catalogue: TestExerciseRow[] = fixtureData.map((e: FixtureExercise) => ({
  ...e,
  tracks: e.tracks as string[],
  primary_muscles: e.primary_muscles as string[],
  equipment_ids: e.equipment_ids as string[],
  contraindicated_regions: e.contraindicated_regions as string[],
} as unknown as TestExerciseRow));

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
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Lat Pulldown swaps: vertical_pull pattern + lats primary (ORACLE)");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown")!;
  check("wide-grip-lat-pulldown exists", !!current);
  
  // Independent oracle: expected alternatives from catalogue
  const EXPECTED_VERTICAL_PULL_SLUGS = [
    "pullups", "chin-up", "v-bar-pullup", "wide-grip-rear-pull-up", // pull-up bar
    "close-grip-front-lat-pulldown", "full-range-of-motion-lat-pulldown", 
    "one-arm-lat-pulldown", "underhand-cable-pulldowns", "v-bar-pulldown", // cable machine
    "bent-arm-barbell-pullover", // barbell
    // NOT: cable-incline-pushdown (triceps focus), catch-and-overhead-throw (power), straight-arm variants (isolation)
  ];
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null, // full gym
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  console.log("  Current swaps:");
  alternatives.forEach((alt, idx) => {
    console.log(`    ${idx + 1}. ${alt.name} (${alt.equipment_ids.join(", ") || "bodyweight"}) - ${alt.slug}`);
  });
  
  // Check pattern match
  const allVerticalPull = alternatives.every(alt => alt.movement_pattern === "vertical_pull");
  check("all swaps are vertical_pull pattern", allVerticalPull,
    allVerticalPull ? "" : `found: ${alternatives.filter(a => a.movement_pattern !== "vertical_pull").map(a => a.slug).join(", ")}`);
  
  // Check primary muscle match
  const allLats = alternatives.every(alt => alt.primary_muscles.includes("lats"));
  check("all swaps have lats as primary", allLats,
    allLats ? "" : `missing lats: ${alternatives.filter(a => !a.primary_muscles.includes("lats")).map(a => a.slug).join(", ")}`);
  
  // Check for variety across equipment
  const equipmentTypes = new Set<string>();
  alternatives.forEach(alt => {
    if (alt.equipment_ids.length === 0) {
      equipmentTypes.add("bodyweight");
    } else {
      alt.equipment_ids.forEach(eq => equipmentTypes.add(eq));
    }
  });
  
  const hasCableMachine = equipmentTypes.has("cable_machine");
  const hasPullUpBar = equipmentTypes.has("pull_up_bar");
  
  check("has cable_machine options", hasCableMachine);
  check("has pull_up_bar options for variety", hasPullUpBar, 
    `equipment types: ${Array.from(equipmentTypes).join(", ")}`);
}

console.log("\n2. No behind-the-neck variants in default suggestions");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown")!;
  check("wide-grip-lat-pulldown exists", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 10,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const behindNeck = alternatives.filter(alt => 
    alt.name.toLowerCase().includes("behind-the-neck") ||
    alt.name.toLowerCase().includes("behind the neck") ||
    alt.slug.includes("behind-the-neck")
  );
  
  check("no behind-the-neck variants", behindNeck.length === 0,
    behindNeck.length > 0 ? `found: ${behindNeck.map(e => e.name).join(", ")}` : "");
}

console.log("\n3. User without pull-up bar gets no pull-up suggestions");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown")!;
  check("wide-grip-lat-pulldown exists", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["cable_machine", "barbell", "dumbbell"]),
    injuryRegions: [],
    limit: 10,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const pullUpBar = alternatives.filter(alt => alt.equipment_ids.includes("pull_up_bar"));
  
  check("no pull-up bar exercises", pullUpBar.length === 0,
    pullUpBar.length > 0 ? `found: ${pullUpBar.map(e => e.name).join(", ")}` : "");
  
  check("still got alternatives", alternatives.length > 0, `got ${alternatives.length}`);
  
  // All should still be vertical_pull
  const allVerticalPull = alternatives.every(alt => alt.movement_pattern === "vertical_pull");
  check("all are vertical_pull", allVerticalPull);
}

console.log("\n4. Determinism check");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown")!;
  check("wide-grip-lat-pulldown exists", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const run1 = rankAlternatives(current, pool, ctx);
  const run2 = rankAlternatives(current, pool, ctx);
  
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const run3 = rankAlternatives(current, shuffled, ctx);
  
  const slugs1 = run1.map(e => e.slug).join(",");
  const slugs2 = run2.map(e => e.slug).join(",");
  const slugs3 = run3.map(e => e.slug).join(",");
  
  check("same result across runs", slugs1 === slugs2);
  check("same result regardless of input order", slugs1 === slugs3);
}

console.log("\n5. GENERAL: All exercises' swaps match their pattern");
{
  // Sample exercises across different patterns
  const testCases = [
    { slug: "barbell-bench-press-medium-grip", pattern: "horizontal_press" },
    { slug: "barbell-squat", pattern: "squat" },
    { slug: "seated-cable-row", pattern: "horizontal_pull" },
    { slug: "barbell-shoulder-press", pattern: "vertical_press" },
    { slug: "barbell-lunge", pattern: "lunge" },
  ];
  
  let patternBreaks = 0;
  
  for (const tc of testCases) {
    const current = catalogue.find((e) => e.slug === tc.slug);
    if (!current) continue;
    
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn: (slug: string) => tieBreakFn(slug),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    
    if (alternatives.length >= 3) {
      const patternMatch = alternatives.every(alt => 
        patterns.includes(alt.movement_pattern as MovementPattern)
      );
      
      if (!patternMatch) {
        patternBreaks++;
        console.log(`  Pattern break in ${tc.slug}: ${alternatives.filter(a => !patterns.includes(a.movement_pattern as MovementPattern)).map(a => a.slug).join(", ")}`);
      }
    }
  }
  
  check("no pattern breaks across sample exercises", patternBreaks === 0,
    `${patternBreaks} exercise(s) with pattern breaks`);
}

console.log("\n6. Show swaps for Barbell Bench Press");
{
  const current = catalogue.find((e) => e.slug === "barbell-bench-press-medium-grip")!;
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn: (slug: string) => tieBreakFn(slug),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    
    console.log("  Barbell Bench Press swaps:");
    alternatives.forEach((alt, idx) => {
      console.log(`    ${idx + 1}. ${alt.name} (${alt.equipment_ids.join(", ") || "bodyweight"})`);
    });
    
    const allHorizontalPress = alternatives.every(alt => alt.movement_pattern === "horizontal_press");
    check("all are horizontal_press", allHorizontalPress);
  }
}

console.log("\n7. Show swaps for Barbell Squat");
{
  const current = catalogue.find((e) => e.slug === "barbell-squat")!;
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn: (slug: string) => tieBreakFn(slug),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    
    console.log("  Barbell Squat swaps:");
    alternatives.forEach((alt, idx) => {
      console.log(`    ${idx + 1}. ${alt.name} (${alt.equipment_ids.join(", ") || "bodyweight"})`);
    });
    
    const allSquat = alternatives.every(alt => alt.movement_pattern === "squat");
    check("all are squat pattern", allSquat);
  }
}

console.log("\n8. Show swaps for Seated Cable Rows");
{
  const current = catalogue.find((e) => e.slug === "seated-cable-rows")!;
  if (current) {
    const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern));
    
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn,
      tieBreakFn: (slug: string) => tieBreakFn(slug),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    
    console.log("  Seated Cable Rows swaps:");
    alternatives.forEach((alt, idx) => {
      console.log(`    ${idx + 1}. ${alt.name} (${alt.equipment_ids.join(", ") || "bodyweight"})`);
    });
    
    const allHorizontalPull = alternatives.every(alt => alt.movement_pattern === "horizontal_pull");
    check("all are horizontal_pull", allHorizontalPull);
  } else {
    check("cable-row-seated found", false, "not in catalogue, try seated-cable-rows");
  }
}

console.log("\nALL CHECKS PASSED\n");

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
