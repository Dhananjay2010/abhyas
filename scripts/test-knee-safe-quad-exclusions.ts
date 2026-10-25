/**
 * Knee-Safe Quad Exclusions Static Test (PR #73 Run 20)
 * 
 * Verifies that KNEE_SAFE_QUAD_EXERCISES and PAST_KNEE_LUNGE_EXERCISES
 * have zero overlap with EXCLUDED_EXERCISE_SLUGS (behind-neck presses,
 * guillotine bench, Bradford presses, etc.).
 * 
 * The filter at generate.ts:1071 applies only to knee-safe candidates,
 * ensuring no unsafe exercises leak into knee-injured plans.
 */

import {
  KNEE_SAFE_QUAD_EXERCISES,
  PAST_KNEE_LUNGE_EXERCISES,
} from "../src/lib/program/generate";
import { EXCLUDED_EXERCISE_SLUGS } from "../src/lib/program/exclusions";

console.log("Knee-Safe Quad Exclusions Static Test");
console.log("─".repeat(60));

let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const kneeSafeArray = Array.from(KNEE_SAFE_QUAD_EXERCISES);
const pastKneeArray = Array.from(PAST_KNEE_LUNGE_EXERCISES);
const excludedArray = Array.from(EXCLUDED_EXERCISE_SLUGS);

console.log(`KNEE_SAFE_QUAD_EXERCISES: ${kneeSafeArray.length} exercises`);
console.log(`PAST_KNEE_LUNGE_EXERCISES: ${pastKneeArray.length} exercises`);
console.log(`EXCLUDED_EXERCISE_SLUGS: ${excludedArray.length} exercises`);
console.log("");

// Check for overlap
const kneeSafeOverlap = kneeSafeArray.filter((s) =>
  EXCLUDED_EXERCISE_SLUGS.has(s)
);
const pastKneeOverlap = pastKneeArray.filter((s) =>
  EXCLUDED_EXERCISE_SLUGS.has(s)
);

check(
  `KNEE_SAFE_QUAD_EXERCISES has zero overlap with EXCLUDED_EXERCISE_SLUGS`,
  kneeSafeOverlap.length === 0,
  kneeSafeOverlap.length > 0
    ? `Found overlap: ${kneeSafeOverlap.join(", ")}`
    : undefined
);

check(
  `PAST_KNEE_LUNGE_EXERCISES has zero overlap with EXCLUDED_EXERCISE_SLUGS`,
  pastKneeOverlap.length === 0,
  pastKneeOverlap.length > 0
    ? `Found overlap: ${pastKneeOverlap.join(", ")}`
    : undefined
);

console.log("");
console.log("─".repeat(60));

if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log("PASSED: No overlap between knee-safe and excluded exercises");
  process.exit(0);
}
