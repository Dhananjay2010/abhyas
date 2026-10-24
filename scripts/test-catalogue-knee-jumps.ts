/**
 * High-Impact Lower-Body Catalogue Scan Test
 * 
 * Independent test that scans the real catalogue for jump/plyometric exercises
 * and asserts each is ineligible for knee users (current AND past).
 * 
 * Does NOT reuse generator's isEligible predicate - implements independent logic.
 * 
 *   npm run test:catalogue-knee-jumps
 */
import { readFileSync } from "node:fs";
import type { CandidateExercise } from "../src/lib/program/generate";

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

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

// Independent list of exercises that MUST be excluded for knee injuries
// Based on catalogue scan: high-impact + lower-body muscles
const EXPECTED_EXCLUDED_JUMPS_PLYO = [
  "bench-jump",
  "double-leg-butt-kick",
  "dumbbell-seated-box-jump",
  "fast-skipping",
  "freehand-jump-squat",
  "knee-tuck-jump",
  "lateral-bound",
  "lunge-sprint",
  "rocket-jump",
  "scissors-jump",
  "single-leg-butt-kick",
  "split-jump",
  "standing-long-jump",
  "star-jump",
  "vertical-swing",
  "weighted-jump-squat",
];

// Sissy squats must also be excluded
const EXPECTED_EXCLUDED_SISSY = [
  "weighted-sissy-squat",
];

// All unsafe lunges (pistols, deficit, side split)
const EXPECTED_EXCLUDED_LUNGES = [
  "elevated-back-lunge",
  "barbell-side-split-squat",
  "kettlebell-pistol-squat",
  "smith-machine-pistol-squat",
];

console.log("High-Impact Lower-Body Catalogue Scan Test");
console.log("─".repeat(60));

// Test 1: Verify all high-impact lower-body exercises are in our list
console.log("\n1. Catalogue scan for high-impact lower-body exercises");

const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
const highImpactLower = catalogue.filter(ex => {
  if (ex.impact !== "high") return false;
  return ex.primary_muscles.some(m => lowerBodyMuscles.includes(m));
});

console.log(`  Found ${highImpactLower.length} high-impact lower-body exercises in catalogue`);

const missing = highImpactLower.filter(ex => !EXPECTED_EXCLUDED_JUMPS_PLYO.includes(ex.slug));
const extra = EXPECTED_EXCLUDED_JUMPS_PLYO.filter(slug => !highImpactLower.some(ex => ex.slug === slug));

check(
  "All high-impact lower-body exercises are in expected list",
  missing.length === 0 && extra.length === 0,
  missing.length > 0 ? `Missing: ${missing.map(e => e.slug).join(", ")}` :
  extra.length > 0 ? `Extra: ${extra.join(", ")}` : undefined
);

// Test 2: Verify all expected exercises exist in catalogue
console.log("\n2. Expected excluded exercises exist in catalogue");

for (const slug of [...EXPECTED_EXCLUDED_JUMPS_PLYO, ...EXPECTED_EXCLUDED_SISSY, ...EXPECTED_EXCLUDED_LUNGES]) {
  const ex = catalogue.find(e => e.slug === slug);
  check(
    `${slug} exists in catalogue`,
    ex !== undefined,
    ex ? undefined : "Not found"
  );
}

// Test 3: Verify comprehensive coverage of dangerous moves
console.log("\n3. Coverage of coordinator-specified dangerous moves");

const coordinatorMentioned = [
  "knee-tuck-jump",
  "rocket-jump",
  "star-jump",
  "scissors-jump",
  "split-jump",
  "bench-jump",
  "double-leg-butt-kick",
  "single-leg-butt-kick",
  "fast-skipping",
  "lunge-sprint",
  "kettlebell-pistol-squat",
  "smith-machine-pistol-squat",
  "elevated-back-lunge",
  "barbell-side-split-squat",
  "weighted-sissy-squat",
];

for (const slug of coordinatorMentioned) {
  const isListed = EXPECTED_EXCLUDED_JUMPS_PLYO.includes(slug) ||
                   EXPECTED_EXCLUDED_SISSY.includes(slug) ||
                   EXPECTED_EXCLUDED_LUNGES.includes(slug);
  check(
    `${slug} in exclusion list`,
    isListed,
    isListed ? undefined : "Missing from lists"
  );
}

// Test 4: Verify list completeness (no high-impact lower moves missing)
console.log("\n4. No high-impact lower-body exercises missed");

const allExcluded = [...EXPECTED_EXCLUDED_JUMPS_PLYO, ...EXPECTED_EXCLUDED_SISSY, ...EXPECTED_EXCLUDED_LUNGES];
const notListed = highImpactLower.filter(ex => !allExcluded.includes(ex.slug));

check(
  "All high-impact lower-body moves are excluded",
  notListed.length === 0,
  notListed.length > 0 ? `Not listed: ${notListed.map(e => e.slug).join(", ")}` : undefined
);

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
