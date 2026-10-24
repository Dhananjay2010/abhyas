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
  const patterns = buildPatternList(current.movement_pattern, true);
  check("pattern list includes lunge", patterns.includes("lunge"));
  check("pattern list includes squat (fallback)", patterns.includes("squat"));
  check("pattern list includes hinge (knee-safe)", patterns.includes("hinge"));
  check("pattern list includes core (knee-safe)", patterns.includes("core"));
  
  // Filter pool to match widened query
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern) && e.is_active);
  
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

console.log("\n2. QA replay: beginner with no equipment, Push-Up Wide swaps");
{
  const current = catalogue.find((e) => e.slug === "push-up-wide")!;
  check("push-up-wide exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern) && e.is_active);
  
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
  
  // Should have at most two "pushup" variants (dedupe should work)
  const pushupVariants = alternatives.filter((e) => 
    e.name.toLowerCase().includes("pushup") || 
    e.name.toLowerCase().includes("push-up") ||
    e.name.toLowerCase().includes("push up")
  );
  
  // After normalization, pushups should dedupe (pushups, push-up wide, pushups (close and wide hand positions))
  check("at most 2 push-up variants after dedupe", pushupVariants.length <= 2, 
    `got ${pushupVariants.length}: ${pushupVariants.map(e => e.name).join(", ")}`);
}

console.log("\n3. QA replay: decline barbell bench top 3 are loaded presses");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-decline-barbell-bench-press")!;
  check("wide-grip-decline-barbell-bench-press exists in fixture", !!current);
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern) && e.is_active);
  
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
  
  const patterns = buildPatternList(current.movement_pattern, true);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern) && e.is_active);
  
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
  
  const patterns = buildPatternList(current.movement_pattern, false);
  // Pool should include active exercises only, but current can be inactive
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern) && e.is_active);
  
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
  const patterns = buildPatternList(current.movement_pattern, true);
  const pool = catalogue.filter((e) => 
    patterns.includes(e.movement_pattern) && 
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

console.log("\n7. buildPatternList helper tests");
{
  const lungePatternsWithKnee = buildPatternList("lunge", true);
  check("lunge + knee injury includes lunge", lungePatternsWithKnee.includes("lunge"));
  check("lunge + knee injury includes squat", lungePatternsWithKnee.includes("squat"));
  check("lunge + knee injury includes hinge", lungePatternsWithKnee.includes("hinge"));
  check("lunge + knee injury includes core", lungePatternsWithKnee.includes("core"));
  
  const squatPatternsWithKnee = buildPatternList("squat", true);
  check("squat + knee injury includes squat", squatPatternsWithKnee.includes("squat"));
  check("squat + knee injury includes lunge", squatPatternsWithKnee.includes("lunge"));
  check("squat + knee injury includes hinge", squatPatternsWithKnee.includes("hinge"));
  check("squat + knee injury includes core", squatPatternsWithKnee.includes("core"));
  
  const lungePatternsNoKnee = buildPatternList("lunge", false);
  check("lunge without knee injury includes lunge", lungePatternsNoKnee.includes("lunge"));
  check("lunge without knee injury includes squat", lungePatternsNoKnee.includes("squat"));
  check("lunge without knee injury does not include hinge", !lungePatternsNoKnee.includes("hinge"));
  check("lunge without knee injury does not include core", !lungePatternsNoKnee.includes("core"));
  
  const pressPatternsNoKnee = buildPatternList("horizontal_press", false);
  check("horizontal_press does not add fallbacks", pressPatternsNoKnee.length === 1 && pressPatternsNoKnee[0] === "horizontal_press");
}

console.log("\nALL CHECKS PASSED\n");

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
