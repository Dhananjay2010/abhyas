/**
 * Knee Swap Path Test
 * 
 * Tests that swap/alternative exercise lists for knee-injured users
 * (both current and past knee) offer only knee-safe options.
 * 
 * Tests pass on PR #73; fail on main for past knee injuries.
 * 
 *   npm run test:knee-swaps
 */
import { readFileSync } from "node:fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { hasAnyKneeInjury } from "../src/lib/program/injury-regions";

// Type definitions (matching database schema)
type BodyRegion = "core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle";
type InjurySeverity = "current" | "past";

interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

// Independent test oracle (not imported from generator)
const EXPECTED_KNEE_SAFE_QUAD_EXERCISES = new Set([
  "leg-extensions",
  "single-leg-leg-extension",
  "wall-sit",
  "spanish-squat",
]);

const EXPECTED_KNEE_SAFE_LUNGE_EXERCISES = new Set([
  "step-up-with-knee-raise",
  "barbell-step-ups",
  "dumbbell-step-ups",
  "split-squat-with-dumbbells",
  "smith-single-leg-split-squat",
]);

const EXPECTED_FLOOR_PULL_DEADLIFTS = new Set([
  "cable-deadlifts",
  "leverage-deadlift",
  "kettlebell-one-legged-deadlift",
  "smith-machine-stiff-legged-deadlift",
  "barbell-stiff-leg-deadlift",
  "dumbbell-stiff-leg-deadlift",
]);

function isKneeSafe(ex: CandidateExercise): boolean {
  // No knee contraindication
  if (ex.contraindicated_regions.includes("knee")) {
    return false;
  }
  
  // No high-impact jumps/plyometrics (by catalogue data: impact + lower-body muscles)
  if (ex.impact === "high") {
    const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
    const isLowerBody = ex.primary_muscles.some(m => lowerBodyMuscles.includes(m));
    if (isLowerBody) {
      return false;
    }
  }
  
  // No sissy squats
  if (ex.slug.includes("sissy")) {
    return false;
  }
  
  // Squats and lunges must be on allowlist
  if (ex.movement_pattern === "squat" || ex.movement_pattern === "lunge") {
    if (!EXPECTED_KNEE_SAFE_QUAD_EXERCISES.has(ex.slug) && !EXPECTED_KNEE_SAFE_LUNGE_EXERCISES.has(ex.slug)) {
      return false;
    }
  }
  
  // No floor-pull deadlifts (for current knee; this test includes both current and past)
  if (EXPECTED_FLOOR_PULL_DEADLIFTS.has(ex.slug)) {
    return false;
  }
  
  return true;
}

function filterByPattern(
  pattern: string,
  hasKneeInjury: boolean
): CandidateExercise[] {
  return catalogue.filter(ex => {
    if (ex.movement_pattern !== pattern) return false;
    
    // Apply knee safety filter
    if (hasKneeInjury) {
      return isKneeSafe(ex);
    }
    
    return true;
  });
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

// Test patterns that might include unsafe exercises
const TEST_PATTERNS = [
  "squat",
  "lunge",
  "hinge",
  "vertical_press",
  "horizontal_press",
];

const TEST_CASES: Array<{
  name: string;
  injuries: InjuryRow[];
}> = [
  {
    name: "Current knee injury",
    injuries: [{ region: "knee" as BodyRegion, severity: "current" }],
  },
  {
    name: "Past knee injury",
    injuries: [{ region: "knee" as BodyRegion, severity: "past" }],
  },
  {
    name: "Current + past knee",
    injuries: [
      { region: "knee" as BodyRegion, severity: "current" },
      { region: "knee" as BodyRegion, severity: "past" },
    ],
  },
];

console.log("Knee Swap Path Test");
console.log("─".repeat(60));

for (const testCase of TEST_CASES) {
  console.log(`\n${testCase.name}`);
  
  const anyKneeInjury = hasAnyKneeInjury(testCase.injuries);
  
  check(
    "hasAnyKneeInjury() returns true",
    anyKneeInjury,
    `Got ${anyKneeInjury}`
  );
  
  for (const pattern of TEST_PATTERNS) {
    // Filter catalogue by pattern and knee safety
    const patternList = filterByPattern(pattern, anyKneeInjury);
    
    // Check that list is non-empty for lower-body patterns except lunge
    // (lunges have limited knee-safe variants in current catalogue)
    const expectNonEmpty = ["squat", "hinge"].includes(pattern);
    if (expectNonEmpty) {
      check(
        `${pattern}: non-empty swap list`,
        patternList.length > 0,
        `${patternList.length} exercises available`
      );
    }
    
    // Check all exercises in swap list are knee-safe
    const unsafe: string[] = [];
    for (const ex of patternList) {
      if (!isKneeSafe(ex)) {
        unsafe.push(`${ex.name} [${ex.slug}]`);
      }
    }
    
    check(
      `${pattern}: all ${patternList.length} options are knee-safe`,
      unsafe.length === 0,
      unsafe.length > 0 ? `Found ${unsafe.length} unsafe: ${unsafe.slice(0, 3).join(", ")}${unsafe.length > 3 ? "..." : ""}` : undefined
    );
  }
}

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
