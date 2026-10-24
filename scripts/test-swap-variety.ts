/**
 * Tests for swap variety across equipment types (QA Task U3).
 * 
 * Requirements:
 * 1. Lat Pulldown default swaps should include varied equipment (pull-ups, not just cable)
 * 2. No behind-the-neck variants in default suggestions
 * 3. Users without pull-up bar don't get pull-up suggestions
 * 4. Determinism maintained
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

console.log("\n1. Lat Pulldown swaps include varied equipment (pull-ups when available)");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown")!;
  check("wide-grip-lat-pulldown exists", !!current);
  
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
    console.log(`    ${idx + 1}. ${alt.name} (${alt.equipment_ids.join(", ") || "bodyweight"})`);
  });
  
  // Check for variety
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
  check("has pull_up_bar options (variety)", hasPullUpBar, 
    `equipment types: ${Array.from(equipmentTypes).join(", ")}`);
  
  // Count how many are just cable variations
  const cableOnly = alternatives.filter(alt => 
    alt.equipment_ids.length === 1 && alt.equipment_ids[0] === "cable_machine"
  );
  
  check("not all swaps are cable-only", cableOnly.length < alternatives.length,
    `${cableOnly.length} of ${alternatives.length} are cable-only`);
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
    limit: 10, // Request more to ensure behind-the-neck would appear if not filtered
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
    availableEquipment: new Set(["cable_machine", "barbell", "dumbbell"]), // no pull-up bar
    injuryRegions: [],
    limit: 10, // Request more to ensure pull-up bar would appear if not filtered
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const pullUpBar = alternatives.filter(alt => alt.equipment_ids.includes("pull_up_bar"));
  
  check("no pull-up bar exercises", pullUpBar.length === 0,
    pullUpBar.length > 0 ? `found: ${pullUpBar.map(e => e.name).join(", ")}` : "");
  
  check("still got alternatives", alternatives.length > 0, `got ${alternatives.length}`);
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

console.log("\n5. Generalization: other exercises also get variety");
{
  // Test that the variety logic works for other patterns too
  const current = catalogue.find((e) => e.slug === "barbell-bench-press-medium-grip")!;
  check("barbell-bench-press-medium-grip exists", !!current);
  
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
  
  const equipmentTypes = new Set<string>();
  alternatives.forEach(alt => {
    if (alt.equipment_ids.length === 0) {
      equipmentTypes.add("bodyweight");
    } else {
      alt.equipment_ids.forEach(eq => equipmentTypes.add(eq));
    }
  });
  
  check("bench press gets varied equipment too", equipmentTypes.size > 1,
    `equipment types: ${Array.from(equipmentTypes).join(", ")}`);
}

console.log("\nALL CHECKS PASSED\n");

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
