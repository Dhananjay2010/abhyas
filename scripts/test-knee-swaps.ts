/**
 * Knee Swap Path Test (Real Swap Path)
 * 
 * Tests that swap/alternative exercise lists for knee-injured users
 * (both current and past knee) offer only knee-safe options.
 * 
 * Uses the REAL swap path from actions.ts:
 * - buildPatternList (pattern + fallbacks)
 * - isEligible (generator safety rules)
 * - rankAlternatives (scoring + ranking)
 * 
 * Tests pass on PR #73; fail on main for past knee injuries.
 * 
 *   npm run test:knee-swaps
 */
import { readFileSync } from "node:fs";
import { 
  isEligible, 
  type CandidateExercise, 
  type GeneratorInput 
} from "../src/lib/program/generate";
import { buildPatternList, rankAlternatives } from "../src/lib/program/alternatives";
import { hasAnyKneeInjury, currentInjuryRegions } from "../src/lib/program/injury-regions";

// Type definitions (matching database schema)
type BodyRegion = "core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle";
type InjurySeverity = "current" | "past";

interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

// Independent test oracle (not imported from generator) to verify safety
const BANNED_FOR_KNEE = new Set([
  // High-impact lower-body jumps/plyos
  "box-jump",
  "depth-jump",
  "tuck-jump",
  "star-jump",
  "rocket-jump",
  "scissor-jump",
  "split-jump",
  "jump-squat",
  "dumbbell-squat-jump",
  "barbell-jump-squat",
  "bench-jump",
  "lateral-bound",
  "high-knee-run",
  "butt-kicks",
  "fast-feet-run",
  "fast-skipping",
  "wind-sprints",
  "sprint-intervals",
  "lunge-sprint",
  
  // Unsafe lunges (deficit, pistol, side split)
  "pistol-squat",
  "smith-machine-pistol-squat",
  "kettlebell-pistol-squat",
  "elevated-back-lunge",
  "barbell-side-split-squat",
  
  // Sissy squats
  "sissy-squat",
  "weighted-sissy-squat",
]);

function simulateSwapPath(
  currentExercise: CandidateExercise,
  injuries: InjuryRow[],
  equipmentIds: string[] = [],
  hasAllEquipment = true,
): CandidateExercise[] {
  const anyKneeInjury = hasAnyKneeInjury(injuries);
  const currentInjuries = currentInjuryRegions(injuries);
  
  // Build GeneratorInput
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
    equipmentIds,
    currentInjuryRegions: currentInjuries,
    anyKneeInjury,
    catalogue,
  };
  
  // Build pattern list (current + fallbacks + knee-safe if applicable)
  const patterns = buildPatternList(currentExercise.movement_pattern, anyKneeInjury);
  
  // Filter catalogue by patterns
  const pool = catalogue.filter(ex => patterns.includes(ex.movement_pattern));
  
  // Filter by isEligible (REAL generator logic)
  const eligible = pool.filter(ex => isEligible(ex, input));
  
  // Rank alternatives (REAL swap logic from actions.ts)
  const wantCompound = currentExercise.mechanic !== "isolation";
  const hashString = (s: string) => {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  };
  const tieBreak = (slug: string) => hashString(`test:${slug}`);
  const scoreFn = (e: CandidateExercise) => {
    // Simplified score function (from generate.ts score())
    let pts = 0;
    if (e.mechanic === "compound") pts += 100;
    if (e.equipment_ids.length === 0) pts += 10;
    return pts;
  };
  
  const ranked = rankAlternatives(
    currentExercise,
    eligible,
    {
      level: input.level,
      availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
      injuryRegions: input.currentInjuryRegions,
      limit: 10, // Get more for testing
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

// Test patterns that might include unsafe exercises - use representative exercises from catalogue
const TEST_EXERCISES = [
  { slug: "bodyweight-squat", pattern: "squat", expectNonEmpty: true },
  { slug: "split-squat-with-dumbbells", pattern: "lunge", expectNonEmpty: true },
  { slug: "romanian-deadlift", pattern: "hinge", expectNonEmpty: true },
  { slug: "alternating-cable-shoulder-press", pattern: "vertical_press", expectNonEmpty: true },
];

const TEST_CASES: Array<{
  name: string;
  injuries: InjuryRow[];
  equipmentScenario: { hasAllEquipment: boolean; equipmentIds: string[] };
}> = [
  {
    name: "Current knee injury (home)",
    injuries: [{ region: "knee", severity: "current" }],
    equipmentScenario: { hasAllEquipment: false, equipmentIds: ["mat", "pull_up_bar"] },
  },
  {
    name: "Current knee injury (gym)",
    injuries: [{ region: "knee", severity: "current" }],
    equipmentScenario: { hasAllEquipment: true, equipmentIds: [] },
  },
  {
    name: "Past knee injury (home)",
    injuries: [{ region: "knee", severity: "past" }],
    equipmentScenario: { hasAllEquipment: false, equipmentIds: ["mat", "pull_up_bar"] },
  },
  {
    name: "Past knee injury (gym)",
    injuries: [{ region: "knee", severity: "past" }],
    equipmentScenario: { hasAllEquipment: true, equipmentIds: [] },
  },
];

console.log("Knee Swap Path Test (Real Swap Logic)");
console.log("─".repeat(60));

for (const testCase of TEST_CASES) {
  console.log(`\n${testCase.name}`);
  
  const anyKneeInjury = hasAnyKneeInjury(testCase.injuries);
  check("hasAnyKneeInjury() returns true", anyKneeInjury, `Got ${anyKneeInjury}`);
  
  for (const { slug, pattern, expectNonEmpty } of TEST_EXERCISES) {
    // Find the exercise in catalogue
    const currentExercise = catalogue.find(ex => ex.slug === slug);
    if (!currentExercise) {
      check(`${pattern}: exercise ${slug} found in catalogue`, false, "Exercise not found");
      continue;
    }
    
    const swapList = simulateSwapPath(
      currentExercise,
      testCase.injuries,
      testCase.equipmentScenario.equipmentIds,
      testCase.equipmentScenario.hasAllEquipment
    );
    
    // Check non-empty for expected patterns
    if (expectNonEmpty) {
      check(
        `${pattern}: non-empty swap list for ${slug}`,
        swapList.length > 0,
        `${swapList.length} exercises available`
      );
    }
    
    // Check no banned exercises in swap list
    const banned: string[] = [];
    for (const ex of swapList) {
      if (BANNED_FOR_KNEE.has(ex.slug)) {
        banned.push(`${ex.name} [${ex.slug}]`);
      }
    }
    
    check(
      `${pattern}: no banned exercises in ${swapList.length} options`,
      banned.length === 0,
      banned.length > 0 
        ? `Found ${banned.length} banned: ${banned.slice(0, 3).join(", ")}${banned.length > 3 ? "..." : ""}` 
        : undefined
    );
    
    // For squat/lunge patterns with knee injury, verify all are from safe lists or hinges
    if (anyKneeInjury && (pattern === "squat" || pattern === "lunge")) {
      const unsafeSquatsLunges: string[] = [];
      
      for (const ex of swapList) {
        // Squats and lunges must be knee-safe (hinges are allowed as fallback pattern)
        if (ex.movement_pattern === "squat" || ex.movement_pattern === "lunge") {
          // For current knee: all squats/lunges must be truly knee-safe
          // For past knee: lunges must be knee-safe, but squats can be regular (not in allowlist)
          const isCurrentKnee = testCase.injuries.some(i => i.region === "knee" && i.severity === "current");
          
          if (ex.movement_pattern === "lunge" && BANNED_FOR_KNEE.has(ex.slug)) {
            unsafeSquatsLunges.push(`${ex.name} [${ex.slug}]`);
          }
          
          if (ex.movement_pattern === "squat" && isCurrentKnee) {
            // For current knee, check if it's in the safe list or a basic squat variant
            // The test oracle already checked for banned exercises above
            // This is an additional check for squats specifically
            const knownUnsafe = ["box-squat", "pistol-squat", "sissy-squat"];
            if (knownUnsafe.some(unsafe => ex.slug.includes(unsafe))) {
              unsafeSquatsLunges.push(`${ex.name} [${ex.slug}]`);
            }
          }
        }
      }
      
      check(
        `${pattern}: all squats/lunges are safe for ${slug}`,
        unsafeSquatsLunges.length === 0,
        unsafeSquatsLunges.length > 0 
          ? `Found ${unsafeSquatsLunges.length} unsafe: ${unsafeSquatsLunges.join(", ")}` 
          : undefined
      );
    }
  }
}

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
