/**
 * Knee Swap Path Test (Real Swap Logic, Scoped Policy)
 * 
 * Tests that swap/alternative exercise lists for knee-injured users
 * (both current and past knee) offer only knee-safe options through the
 * REAL swap path (buildPatternList → isEligible → rankAlternatives).
 * 
 * Covers:
 * - High-impact lower-body ban (tuck-jump, box-jump, etc.)
 * - Sissy squat ban (sissy-squat, weighted-sissy-squat)
 * - Deficit lunge ban (elevated-back-lunge)
 * - Pistol ban (pistol-squat, kettlebell-pistol-squat, smith-machine-pistol-squat)
 * - Side split squat ban (barbell-side-split-squat)
 * - Lunge pattern: no widening into squat pattern for knee users
 * - Past-knee lunge swaps use ONLY the 5-exercise knee-safe list
 * 
 * Test MUST fail on main (no anyKneeInjury handling).
 * 
 *   npm run test:knee-swaps
 */
import { readFileSync } from "node:fs";
import { 
  isEligible, 
  score,
  hashString,
  type CandidateExercise, 
  type GeneratorInput,
} from "../src/lib/program/generate";
import { buildPatternList, rankAlternatives } from "../src/lib/program/alternatives";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import { hasAnyKneeInjury, currentInjuryRegions } from "../src/lib/program/injury-regions";

type BodyRegion = "core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle";
type InjurySeverity = "current" | "past";

interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

const fixture = "scripts/fixtures/catalogue.json";
const rawCatalogue: unknown = JSON.parse(readFileSync(fixture, "utf8"));
if (!Array.isArray(rawCatalogue)) throw new Error("Catalogue must be an array");
const catalogue: CandidateExercise[] = rawCatalogue;

// Hard-coded test oracle (independent of generator)
const BANNED_FOR_KNEE = new Set([
  // High-impact lower-body
  "box-jump", "tuck-jump", "star-jump", "rocket-jump", "scissor-jump", "split-jump",
  "jump-squat", "dumbbell-squat-jump", "barbell-jump-squat",
  "bench-jump", "lateral-bound", "butt-kicks", "fast-skipping", "wind-sprints", "lunge-sprint",
  // Pistols
  "pistol-squat", "kettlebell-pistol-squat", "smith-machine-pistol-squat",
  // Deficit/side split
  "elevated-back-lunge", "barbell-side-split-squat",
  // Sissy squats
  "sissy-squat", "weighted-sissy-squat",
]);

// Knee-safe lunge list for CURRENT knee (must match generator)
// Current knee: NO lunge-pattern exercises allowed (only quad isolation in KNEE_SAFE_QUAD_EXERCISES)
const EXPECTED_CURRENT_KNEE_SAFE_LUNGES: string[] = [];

// Past knee: lunge-pattern exercises from tier system ARE allowed
// Tier 1: dumbbell-rear-lunge
// Tier 3: split squats
// Tier 4: step-ups
const EXPECTED_PAST_KNEE_SAFE_LUNGES = [
  "dumbbell-rear-lunge",
  "split-squat-with-dumbbells",
  "smith-single-leg-split-squat",
  "barbell-step-ups",
  "dumbbell-step-ups",
  "step-up-with-knee-raise",
];

function simulateSwapPath(
  currentExercise: CandidateExercise,
  injuries: InjuryRow[],
  hasAllEquipment = true,
): CandidateExercise[] {
  const anyKneeInjury = hasAnyKneeInjury(injuries);
  const currentInjuries = currentInjuryRegions(injuries);
  
  const input: GeneratorInput = {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment,
    equipmentIds: [],
    currentInjuryRegions: currentInjuries,
    anyKneeInjury,
    catalogue,
  };
  
  // REAL swap path from actions.ts
  const patterns = getSwapPatterns(currentExercise.movement_pattern, input);
  const pool = catalogue.filter(ex => patterns.includes(ex.movement_pattern));
  const eligible = pool.filter(ex => isEligible(ex, input));
  
  // Debug: log pattern expansion
  if (process.env.DEBUG_SWAPS) {
    console.log(`    patterns: ${patterns.join(", ")} (pool: ${pool.length}, eligible: ${eligible.length})`);
  }
  
  const wantCompound = currentExercise.mechanic !== "isolation";
  const tieBreak = (slug: string) => hashString(`test:${slug}`);
  const scoreFn = (e: CandidateExercise) => score(e, wantCompound, input.level, input.primaryTrack);
  
  const ranked = rankAlternatives(
    currentExercise,
    eligible,
    {
      level: input.level,
      availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
      injuryRegions: input.currentInjuryRegions,
      anyKneeInjury: input.anyKneeInjury,
      limit: 20,
      scoreFn,
      tieBreakFn: tieBreak,
    }
  );
  
  return ranked;
}

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Test exercises from catalogue (real slugs)
const TEST_EXERCISES = [
  { slug: "bodyweight-squat", pattern: "squat" },
  { slug: "split-squat-with-dumbbells", pattern: "lunge" },
  { slug: "romanian-deadlift", pattern: "hinge" },
  { slug: "barbell-bench-press-medium-grip", pattern: "horizontal_press" },
];

const TEST_CASES: Array<{
  name: string;
  injuries: InjuryRow[];
}> = [
  {
    name: "Current knee injury",
    injuries: [{ region: "knee", severity: "current" }],
  },
  {
    name: "Past knee injury",
    injuries: [{ region: "knee", severity: "past" }],
  },
];

console.log("Knee Swap Path Test (Real Swap Logic, Scoped Policy)");
console.log("─".repeat(60));

for (const testCase of TEST_CASES) {
  console.log(`\n${testCase.name}`);
  
  const anyKneeInjury = hasAnyKneeInjury(testCase.injuries);
  check("hasAnyKneeInjury() returns true", anyKneeInjury);
  
  for (const { slug, pattern } of TEST_EXERCISES) {
    const currentExercise = catalogue.find(ex => ex.slug === slug);
    if (!currentExercise) {
      check(`${pattern}: exercise ${slug} found`, false, "Not in catalogue");
      continue;
    }
    
    const swapList = simulateSwapPath(currentExercise, testCase.injuries);
    
    // Check non-empty - real swap path returns hinge/core alternatives for current-knee lunges
    check(
      `${pattern} (${slug}): non-empty swap list`,
      swapList.length > 0,
      `${swapList.length} options`
    );
    
    // Check no banned exercises
    const banned: string[] = [];
    for (const ex of swapList) {
      if (BANNED_FOR_KNEE.has(ex.slug)) {
        banned.push(ex.slug);
      }
    }
    
    check(
      `${pattern} (${slug}): no banned exercises`,
      banned.length === 0,
      banned.length > 0 ? `Found: ${banned.slice(0, 3).join(", ")}` : undefined
    );
    
    // For lunge pattern, verify ALL are from knee-safe list
    if (pattern === "lunge") {
      const lungeExercises = swapList.filter(ex => ex.movement_pattern === "lunge");
      const hasCurrentKnee = testCase.injuries.some(inj => inj.region === "knee" && inj.severity === "current");
      const expectedLunges = hasCurrentKnee ? EXPECTED_CURRENT_KNEE_SAFE_LUNGES : EXPECTED_PAST_KNEE_SAFE_LUNGES;
      const unsafeLunges: string[] = [];
      
      for (const ex of lungeExercises) {
        if (!expectedLunges.includes(ex.slug)) {
          unsafeLunges.push(ex.slug);
        }
      }
      
      check(
        `${pattern} (${slug}): all lunges from knee-safe list`,
        unsafeLunges.length === 0,
        unsafeLunges.length > 0 ? `Unsafe: ${unsafeLunges.join(", ")}` : undefined
      );
      
      // Verify NO squat-pattern exercises in lunge swaps for CURRENT knee users
      // (Past knee users get squat-pattern quad isolation exercises, which is correct)
      const squatExercises = swapList.filter(ex => ex.movement_pattern === "squat");
      
      if (hasCurrentKnee) {
        check(
          `${pattern} (${slug}): no squat pattern widening for current knee`,
          squatExercises.length === 0,
          squatExercises.length > 0 ? `Found squats: ${squatExercises.map(e => e.slug).slice(0, 3).join(", ")}` : undefined
        );
      } else {
        // Past knee: squat pattern exercises (PAST_KNEE_LUNGE_EXERCISES) are expected
        check(
          `${pattern} (${slug}): past knee includes squat pattern (quad isolation)`,
          squatExercises.length > 0,
          `Expected squat pattern exercises for past knee`
        );
      }
    }
  }
}

// Test 3: Verify pattern list doesn't widen for knee lunge
console.log("\n3. Verify buildPatternList behavior for knee lunge");
const testExercise = catalogue.find(e => e.slug === "split-squat-with-dumbbells");
if (testExercise) {
  const noKneePatterns = buildPatternList("lunge", false);
  const kneePatterns = buildPatternList("lunge", true);
  
  const noKneeHasSquat = noKneePatterns.includes("squat");
  const kneeHasSquat = kneePatterns.includes("squat");
  
  check("No-knee lunge patterns include squat fallback", noKneeHasSquat);
  check("Knee lunge patterns exclude squat fallback", !kneeHasSquat,
    kneeHasSquat ? "Squat pattern found in knee lunge patterns!" : undefined);
}

// Test 4: QA Bot 1 - Past-knee Barbell Squat swaps must not include Goblet Squat or Turkish Get-Up
console.log("\n4. QA Bot 1: Past-knee Barbell Squat swaps (no Goblet Squat, no Turkish Get-Up)");
{
  const barbellSquat = catalogue.find(e => e.slug === "barbell-squat");
  const pastKneeInjuries: InjuryRow[] = [{ region: "knee", severity: "past" }];
  
  if (barbellSquat) {
    const swaps = simulateSwapPath(barbellSquat, pastKneeInjuries, true);
    
    check("Barbell Squat swaps for past-knee: non-empty", swaps.length > 0);
    
    const hasGobletSquat = swaps.some(ex => ex.slug === "goblet-squat");
    check("Barbell Squat swaps: no Goblet Squat", !hasGobletSquat,
      hasGobletSquat ? "Goblet Squat found in past-knee barbell squat swaps!" : undefined);
    
    const hasTurkishGetUp = swaps.some(ex => 
      ex.slug === "kettlebell-turkish-get-up-lunge-style" || 
      ex.slug === "kettlebell-turkish-get-up-squat-style"
    );
    check("Barbell Squat swaps: no Turkish Get-Up", !hasTurkishGetUp,
      hasTurkishGetUp ? "Turkish Get-Up found in squat swaps!" : undefined);
    
    // Log the swap list for inspection
    if (process.env.DEBUG_SWAPS) {
      console.log("  Past-knee Barbell Squat swaps:", swaps.map(e => e.slug).slice(0, 10));
    }
  }
}

// Test 5: QA Bot 1 - Past-knee Spanish Squat swaps
console.log("\n5. QA Bot 1: Past-knee Spanish Squat swaps");
{
  const spanishSquat = catalogue.find(e => e.slug === "spanish-squat");
  const pastKneeInjuries: InjuryRow[] = [{ region: "knee", severity: "past" }];
  
  if (spanishSquat) {
    const swaps = simulateSwapPath(spanishSquat, pastKneeInjuries, true);
    
    check("Spanish Squat swaps for past-knee: non-empty", swaps.length > 0);
    
    const hasGobletSquat = swaps.some(ex => ex.slug === "goblet-squat");
    check("Spanish Squat swaps: no Goblet Squat", !hasGobletSquat,
      hasGobletSquat ? "Goblet Squat found in past-knee spanish squat swaps!" : undefined);
    
    // Log the swap list for inspection
    if (process.env.DEBUG_SWAPS) {
      console.log("  Past-knee Spanish Squat swaps:", swaps.map(e => e.slug).slice(0, 10));
    }
  }
}

// Test 6: QA Bot 1 - Past-knee lunge slot swaps with extended list check
console.log("\n6. QA Bot 1: Past-knee lunge swaps (extended list for fallback check)");
{
  const splitSquat = catalogue.find(e => e.slug === "split-squat-with-dumbbells");
  const pastKneeInjuries: InjuryRow[] = [{ region: "knee", severity: "past" }];
  
  if (splitSquat) {
    // Get top 5 swaps
    const swaps = simulateSwapPath(splitSquat, pastKneeInjuries, true);
    check("Lunge swaps for past-knee: non-empty", swaps.length > 0);
    
    // MED-3: Verify no normal squats (only PAST_KNEE_LUNGE_EXERCISES allowed)
    const squatExercises = swaps.filter(ex => ex.movement_pattern === "squat");
    const unsafeSquats: string[] = [];
    for (const ex of squatExercises) {
      if (!EXPECTED_PAST_KNEE_SAFE_LUNGES.includes(ex.slug)) {
        // Check if it's in the allowed quad-isolation list
        const allowedQuadIsolation = ["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"];
        if (!allowedQuadIsolation.includes(ex.slug)) {
          unsafeSquats.push(ex.slug);
        }
      }
    }
    
    check("Lunge swaps: no unsafe squat-pattern exercises (MED-3)", unsafeSquats.length === 0,
      unsafeSquats.length > 0 ? `Unsafe squats: ${unsafeSquats.join(", ")}` : undefined);
    
    // Get extended swap list (limit 20) to check for hinge/bridge fallbacks
    const input: GeneratorInput = {
      userId: "test-user",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 23,
      hasAllEquipment: true,
      equipmentIds: [],
      currentInjuryRegions: [],
      anyKneeInjury: true,
      catalogue,
    };
    const patterns = getSwapPatterns(splitSquat.movement_pattern, input);
    const pool = catalogue.filter(ex => patterns.includes(ex.movement_pattern));
    const eligible = pool.filter(ex => isEligible(ex, input));
    const wantCompound = splitSquat.mechanic !== "isolation";
    const tieBreak = (slug: string) => hashString(`test:${slug}`);
    const scoreFn = (e: CandidateExercise) => score(e, wantCompound, input.level, input.primaryTrack);
    const extendedSwaps = rankAlternatives(
      splitSquat,
      eligible,
      {
        level: input.level,
        availableEquipment: null,
        injuryRegions: input.currentInjuryRegions,
        anyKneeInjury: input.anyKneeInjury,
        limit: 20,
        scoreFn,
        tieBreakFn: tieBreak,
      }
    );
    
    // Check for safe hinge/bridge exercises in extended list
    const hasSafeHingeOrBridge = extendedSwaps.some(ex => 
      ex.movement_pattern === "hinge" || 
      (ex.movement_pattern === "core" && (ex.slug.includes("bridge") || ex.slug.includes("thrust")))
    );
    
    check("Lunge swaps (extended): includes safe hinge/bridge fallbacks", hasSafeHingeOrBridge,
      !hasSafeHingeOrBridge ? "No safe hinge/bridge fallbacks found in top 20!" : undefined);
    
    // Log the swap lists for inspection
    if (process.env.DEBUG_SWAPS) {
      console.log("  Past-knee lunge swaps (top 5):", swaps.map(e => `${e.slug} [${e.movement_pattern}]`).slice(0, 5));
      console.log("  Past-knee lunge swaps (extended top 20):", extendedSwaps.map(e => `${e.slug} [${e.movement_pattern}]`).slice(0, 20));
    }
  }
}

// Count empty swap lists for all current-knee lunge exercises
console.log("\n4. Count empty swap lists for current-knee lunges (comprehensive)");
const currentKneeInjuries: InjuryRow[] = [{ region: "knee", severity: "current" }];
const allLunges = catalogue.filter(e => e.movement_pattern === "lunge");
let emptyCount = 0;
let totalCount = 0;

for (const ex of allLunges) {
  const swaps = simulateSwapPath(ex, currentKneeInjuries, true);
  totalCount++;
  if (swaps.length === 0) {
    emptyCount++;
    console.log(`  ⚠ ${ex.slug}: EMPTY`);
  }
}

console.log(`  Empty swap lists: ${emptyCount}/${totalCount} current-knee lunge swaps`);
check("Zero empty current-knee lunge swap lists", emptyCount === 0,
  emptyCount > 0 ? `Found ${emptyCount} empty lists` : undefined);

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
