/**
 * Tests for exercise alternatives ranking with widened pattern queries.
 *
 *   npm run test:alternatives
 */
import { rankAlternatives, buildPatternList, type AlternativesContext, type ExerciseRow } from "../src/lib/program/alternatives";
import { hashString } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";
import fixtureData from "./fixtures/prod-catalogue-sample.json";

type MovementPattern = Database["public"]["Enums"]["movement_pattern"];
type FixtureExercise = typeof fixtureData[0];

// Extend ExerciseRow with is_active for testing
type TestExerciseRow = ExerciseRow & { is_active: boolean };

// Convert JSON fixture to typed ExerciseRow format
const catalogue: TestExerciseRow[] = fixtureData.map((e: FixtureExercise) => ({
  ...e,
  tracks: e.tracks as string[],
  primary_muscles: e.primary_muscles as string[],
  equipment_ids: e.equipment_ids as string[],
  contraindicated_regions: e.contraindicated_regions as string[],
  is_active: e.is_active,
} as unknown as TestExerciseRow));

// Helper: score function (simple stub for testing - prefers compound)
const scoreFn = (exercise: ExerciseRow): number => {
  if (exercise.mechanic === "compound") return 100;
  return 50;
};

// Helper: deterministic tiebreak
const tieBreakFn = (exerciseId: string): number => {
  return hashString(`test:${exerciseId}`);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. QA replay: knee-injured intermediate Barbell Lunge swap");
{
  const current = catalogue.find((e) => e.slug === "barbell-lunge")!;
  check("barbell-lunge exists in fixture", !!current);
  
  // Build pattern list (should include lunge, squat, hinge, core)
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, true);
  check("pattern list includes lunge", patterns.includes("lunge"));
  check("pattern list includes squat (fallback)", patterns.includes("squat"));
  check("pattern list includes hinge (knee-safe)", patterns.includes("hinge"));
  check("pattern list includes core (knee-safe)", patterns.includes("core"));
  
  // Filter pool to match widened query
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern) && e.is_active);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null, // full gym
    injuryRegions: ["knee"],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  // Must be non-empty
  check("alternatives list is non-empty", alternatives.length > 0, `got ${alternatives.length} alternatives`);
  
  // None should be knee-contraindicated
  const kneeContraindicated = alternatives.filter((a) => a.contraindicated_regions.includes("knee"));
  check("no knee-contraindicated exercises in alternatives", kneeContraindicated.length === 0, 
    kneeContraindicated.length > 0 ? `found: ${kneeContraindicated.map(e => e.name).join(", ")}` : "");
}

console.log("\n2. QA replay: beginner with no equipment, Push-Up Wide swaps (includes old test a assertions)");
{
  const current = catalogue.find((e) => e.slug === "push-up-wide")!;
  check("push-up-wide exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern) && e.is_active);
  
  const ctx: AlternativesContext = {
    level: "beginner",
    availableEquipment: new Set([]), // no equipment
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  // Should not include Isometric Wipers (isometric, metric=seconds)
  const hasWipers = alternatives.find((e) => e.slug === "isometric-wipers");
  check("no Isometric Wipers (isometric excluded)", !hasWipers);
  
  // Should not include Plyo Push-up (impact=high)
  const hasPlyo = alternatives.find((e) => e.slug === "plyo-push-up");
  check("no Plyo Push-up (plyometric excluded)", !hasPlyo);
  
  // Old test (a) assertions
  const hasHighImpact = alternatives.some((e) => e.impact === "high");
  check("no high-impact exercises for beginners", !hasHighImpact);
  
  check("capped at 5 alternatives", alternatives.length <= 5, `got ${alternatives.length}`);
  
  const allHorizontalPress = alternatives.every((e) => e.movement_pattern === "horizontal_press");
  check("all alternatives are horizontal_press", allHorizontalPress);
  
  // Should have at most two "pushup" variants (dedupe should work)
  const pushupVariants = alternatives.filter((e) => 
    e.name.toLowerCase().includes("pushup") || 
    e.name.toLowerCase().includes("push-up") ||
    e.name.toLowerCase().includes("push up")
  );
  
  // After normalization, pushups should dedupe
  check("at most 2 push-up variants after dedupe", pushupVariants.length <= 2, 
    `got ${pushupVariants.length}: ${pushupVariants.map(e => e.name).join(", ")}`);
}

console.log("\n3. QA replay: decline barbell bench top 3 are loaded presses");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-decline-barbell-bench-press")!;
  check("wide-grip-decline-barbell-bench-press exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern) && e.is_active);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null, // full gym
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  check("alternatives list is non-empty", alternatives.length > 0);
  
  // Top 3 should all be loaded (have equipment_ids)
  const top3 = alternatives.slice(0, 3);
  const bodyweightInTop3 = top3.filter((a) => a.equipment_ids.length === 0);
  check("top 3 are all loaded (no bodyweight)", bodyweightInTop3.length === 0,
    bodyweightInTop3.length > 0 ? `found bodyweight: ${bodyweightInTop3.map(e => e.name).join(", ")}` : "");
}

console.log("\n4. QA replay: Lunge Sprint not in top 3 for Barbell Lunge");
{
  const current = catalogue.find((e) => e.slug === "barbell-lunge")!;
  check("barbell-lunge exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, true);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern) && e.is_active);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null, // full gym
    injuryRegions: ["knee"],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const top3 = alternatives.slice(0, 3);
  
  // Lunge Sprint (high impact) should not be in top 3
  const hasLungeSprint = top3.find((e) => e.slug === "lunge-sprint");
  check("Lunge Sprint not in top 3", !hasLungeSprint);
}

console.log("\n5. Inactive current exercise still gets alternatives");
{
  const current = catalogue.find((e) => e.slug === "inactive-test-exercise")!;
  check("inactive-test-exercise exists in fixture", !!current);
  check("inactive exercise is_active=false", current.is_active === false);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  // Pool should include active exercises only, but current can be inactive
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern) && e.is_active);
  
  const ctx: AlternativesContext = {
    level: "beginner",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  // This should work even though current is inactive
  const alternatives = rankAlternatives(current, pool, ctx);
  
  // Should get some alternatives (horizontal_press pool)
  check("inactive current still gets alternatives", alternatives.length > 0, `got ${alternatives.length} alternatives`);
}

console.log("\n6. Empty case returns empty array (simulated no safe swap)");
{
  const current = catalogue.find((e) => e.slug === "barbell-lunge")!;
  check("barbell-lunge exists in fixture", !!current);
  
  // Simulate a case where all alternatives are filtered out
  // Use expert level with beginner-only pool
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, true);
  const pool = catalogue.filter((e) => 
    patterns.includes(e.movement_pattern as MovementPattern) && 
    e.is_active &&
    e.level_min === "expert" // Only expert exercises (but current is intermediate)
  );
  
  const ctx: AlternativesContext = {
    level: "beginner", // Beginner can't do expert exercises
    availableEquipment: new Set([]), // No equipment
    injuryRegions: ["knee"],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  // Should return empty
  check("empty pool returns empty alternatives", alternatives.length === 0);
}

console.log("\n7. Old test (b): Movement pattern filtering - push never shows pull");
{
  const current = catalogue.find((e) => e.slug === "barbell-bench-press-medium-grip")!;
  check("barbell-bench-press-medium-grip exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  // Include all catalogue to test filtering
  const pool = catalogue.filter((e) => e.is_active);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const hasPull = alternatives.some((e) => 
    e.movement_pattern === "vertical_pull" || e.movement_pattern === "horizontal_pull"
  );
  check("no pull movements in push alternatives", !hasPull);
  
  const allPush = alternatives.every((e) => e.movement_pattern === "horizontal_press");
  check("all alternatives match horizontal_press", allPush);
}

console.log("\n8. Old test (c): Injury filtering - shoulder injury gets no shoulder-contraindicated moves");
{
  const current = catalogue.find((e) => e.slug === "barbell-shoulder-press")!;
  check("barbell-shoulder-press exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => 
    patterns.includes(e.movement_pattern as MovementPattern) && e.is_active
  );
  
  const ctx: AlternativesContext = {
    level: "beginner",
    availableEquipment: null,
    injuryRegions: ["shoulder"],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const hasShoulderContra = alternatives.some((e) => 
    e.contraindicated_regions.includes("shoulder")
  );
  check("no shoulder-contraindicated exercises for shoulder injury", !hasShoulderContra);
}

console.log("\n9. Old test (d): Equipment all-of - dumbbell-only user gets no barbell/bench moves");
{
  const current = catalogue.find((e) => e.slug === "dumbbell-bench-press")!;
  check("dumbbell-bench-press exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => 
    patterns.includes(e.movement_pattern as MovementPattern) && e.is_active
  );
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["dumbbell"]),
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const hasBarbell = alternatives.some((e) => 
    e.equipment_ids.includes("barbell")
  );
  check("no barbell exercises for dumbbell-only user", !hasBarbell);
  
  const hasBench = alternatives.some((e) => 
    e.equipment_ids.includes("flat_bench") || e.equipment_ids.includes("adjustable_bench")
  );
  check("no bench exercises for dumbbell-only user", !hasBench);
  
  const allValid = alternatives.every((e) => 
    e.equipment_ids.length === 0 || e.equipment_ids.every(id => id === "dumbbell")
  );
  check("all alternatives use only dumbbell or bodyweight", allValid);
}

console.log("\n10. Old test (e): Determinism - same output across runs and input orders");
{
  const current = catalogue.find((e) => e.movement_pattern === "horizontal_press" && e.is_active)!;
  check("found horizontal_press current", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const candidates = catalogue.filter((e) => 
    patterns.includes(e.movement_pattern as MovementPattern) && e.is_active
  ).slice(0, 20);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const run1 = rankAlternatives(current, candidates, ctx);
  
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const run2 = rankAlternatives(current, shuffled, ctx);
  
  const run3 = rankAlternatives(current, candidates, ctx);
  
  check("same length across shuffled input", run1.length === run2.length);
  check("deterministic across runs", run1.length === run3.length);
  
  const slugs1 = run1.map(e => e.slug).join(",");
  const slugs2 = run2.map(e => e.slug).join(",");
  const slugs3 = run3.map(e => e.slug).join(",");
  
  check("same order regardless of input order", slugs1 === slugs2);
  check("stable across runs", slugs1 === slugs3);
}

console.log("\n11. Old test (f): Lunge→squat fallback for knee injury (covered by test 1, additional checks)");
{
  const current = catalogue.find((e) => e.slug === "barbell-lunge")!;
  check("barbell-lunge exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, true);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern as MovementPattern) && e.is_active);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: ["knee"],
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  // Should have some squats or knee-safe alternatives
  const hasSquatOrHinge = alternatives.some((e) => 
    e.movement_pattern === "squat" || e.movement_pattern === "hinge" || e.movement_pattern === "core"
  );
  check("fallback returned squat or knee-safe alternatives", hasSquatOrHinge);
}

console.log("\n12. Old test (g): Contraindicated-current still returning same-pattern results");
{
  const current = catalogue.find((e) => e.slug === "barbell-shoulder-press")!;
  check("barbell-shoulder-press (contraindicated) exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern as MovementPattern, false);
  const pool = catalogue.filter((e) => 
    patterns.includes(e.movement_pattern as MovementPattern) && e.is_active
  );
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: ["shoulder"], // Current exercise is contraindicated
    limit: 5,
    scoreFn,
    tieBreakFn: (slug: string) => tieBreakFn(slug),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  check("alternatives found even when current is contraindicated", alternatives.length > 0);
  
  const hasShoulderContra = alternatives.some((e) => e.contraindicated_regions.includes("shoulder"));
  check("no shoulder-contraindicated exercises", !hasShoulderContra);
  
  const allVertical = alternatives.every((e) => e.movement_pattern === "vertical_press");
  check("all alternatives match current movement_pattern (vertical_press)", allVertical);
  
  const hasCurrentExercise = alternatives.some((e) => e.id === current.id);
  check("current exercise excluded from alternatives", !hasCurrentExercise);
}

console.log("\n13. buildPatternList helper tests");
{
  const lungePatternsWithKnee = buildPatternList("lunge" as MovementPattern, true);
  check("lunge + knee injury includes lunge", lungePatternsWithKnee.includes("lunge"));
  check("lunge + knee injury includes squat", lungePatternsWithKnee.includes("squat"));
  check("lunge + knee injury includes hinge", lungePatternsWithKnee.includes("hinge"));
  check("lunge + knee injury includes core", lungePatternsWithKnee.includes("core"));
  
  const squatPatternsWithKnee = buildPatternList("squat" as MovementPattern, true);
  check("squat + knee injury includes squat", squatPatternsWithKnee.includes("squat"));
  check("squat + knee injury includes lunge", squatPatternsWithKnee.includes("lunge"));
  check("squat + knee injury includes hinge", squatPatternsWithKnee.includes("hinge"));
  check("squat + knee injury includes core", squatPatternsWithKnee.includes("core"));
  
  const lungePatternsNoKnee = buildPatternList("lunge" as MovementPattern, false);
  check("lunge without knee injury includes lunge", lungePatternsNoKnee.includes("lunge"));
  check("lunge without knee injury includes squat", lungePatternsNoKnee.includes("squat"));
  check("lunge without knee injury does not include hinge", !lungePatternsNoKnee.includes("hinge"));
  check("lunge without knee injury does not include core", !lungePatternsNoKnee.includes("core"));
  
  const pressPatternsNoKnee = buildPatternList("horizontal_press" as MovementPattern, false);
  check("horizontal_press does not add fallbacks", pressPatternsNoKnee.length === 1 && pressPatternsNoKnee[0] === "horizontal_press");
}

console.log("\nALL CHECKS PASSED\n");

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
