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
  KNEE_SAFE_LUNGE_EXERCISES,
} from "../src/lib/program/generate";
import { buildPatternList, rankAlternatives } from "../src/lib/program/alternatives";
import { hasAnyKneeInjury, currentInjuryRegions } from "../src/lib/program/injury-regions";

type BodyRegion = "core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle";
type InjurySeverity = "current" | "past";

interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

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

// Knee-safe lunge list (must match generator)
const EXPECTED_KNEE_SAFE_LUNGES = Array.from(KNEE_SAFE_LUNGE_EXERCISES);

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
  const patterns = buildPatternList(currentExercise.movement_pattern, anyKneeInjury);
  const pool = catalogue.filter(ex => patterns.includes(ex.movement_pattern));
  const eligible = pool.filter(ex => isEligible(ex, input));
  
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
    
    // Check non-empty
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
    
    // For lunge pattern, verify ALL are from knee-safe list (no squat pattern widening)
    if (pattern === "lunge") {
      const lungeExercises = swapList.filter(ex => ex.movement_pattern === "lunge");
      const unsafeLunges: string[] = [];
      
      for (const ex of lungeExercises) {
        if (!EXPECTED_KNEE_SAFE_LUNGES.includes(ex.slug)) {
          unsafeLunges.push(ex.slug);
        }
      }
      
      check(
        `${pattern} (${slug}): all lunges from knee-safe list`,
        unsafeLunges.length === 0,
        unsafeLunges.length > 0 ? `Unsafe: ${unsafeLunges.join(", ")}` : undefined
      );
      
      // Verify NO squat-pattern exercises in lunge swaps for knee users
      const squatExercises = swapList.filter(ex => ex.movement_pattern === "squat");
      check(
        `${pattern} (${slug}): no squat pattern widening`,
        squatExercises.length === 0,
        squatExercises.length > 0 ? `Found squats: ${squatExercises.map(e => e.slug).slice(0, 3).join(", ")}` : undefined
      );
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

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
