#!/usr/bin/env tsx
/**
 * Targeted mutation tests for owner decision (a) implementation
 * Tests that removing key safety checks causes test failures
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { isCrash } from "./lib/mutant-classify";

interface Mutant {
  name: string;
  file: string;
  original: string;
  mutated: string;
  tests: string[];
  equivalent?: boolean;
  notes?: string;
}

const MUTANTS: Mutant[] = [
  // M3: Remove jammer continue in rankAlternatives (EQUIVALENT)
  {
    name: "M3: Remove jammer continue in rankAlternatives",
    file: "src/lib/program/alternatives.ts",
    original: '    // G-3: Landmine jammers excluded for ANY knee injury (leg-driven presses)\n    if ((ctx.anyKneeInjury ?? false) && (candidate.slug === "landmine-linear-jammer" || candidate.slug === "single-arm-linear-jammer")) {\n      continue;\n    }',
    mutated: '    // MUTANT: Removed jammer check in rankAlternatives',
    tests: ["test:owner-decision-a", "test:past-knee-calf-swap-exclusion"],
    equivalent: true,
    notes: "rankAlternatives' only production caller is buildEligibleSwapList (eligible-swap-list.ts:71), which first applies isEligible's any-knee jammer check. Evidence: byte-identical output across 483,912 swap lists (4 injury sets x 11 equipment x 3 levels x 2 tracks x 611 exercises x 3 session ids) and 7,290 plans.",
  },
  
  // M7: Remove both jammer slugs from PAST_KNEE_EXCLUDED_SLUGS
  {
    name: "M7: Remove both jammer slugs from PAST_KNEE_EXCLUDED_SLUGS",
    file: "src/lib/program/past-knee.ts",
    original: '  // Calf Press on Leg Press: knee-contraindicated (QA Bot 1 finding)\n  "calf-press-on-the-leg-press-machine",\n  \n  // G-3: Landmine jammers are leg-driven presses (push from legs through shoulders)\n  "landmine-linear-jammer",\n  "single-arm-linear-jammer",',
    mutated: '  // Calf Press on Leg Press: knee-contraindicated (QA Bot 1 finding)\n  "calf-press-on-the-leg-press-machine",\n  \n  // MUTANT: Removed both jammer slugs\n  // "landmine-linear-jammer",\n  // "single-arm-linear-jammer",',
    tests: ["test:owner-decision-a", "test:knee-contraindicated", "test:past-knee-calf-swap-exclusion"],
    equivalent: false,
  },
  
  // M8: Make Day 5 appear unused (guard should catch it)
  {
    name: "M8: Simulate Day 5 allow-list not used",
    file: "scripts/test-med2-comparison.ts",
    original: '  if (prDay.dayIndex === ALLOWED_DAY5_DIFF.dayIndex) {\n    day5AllowListUsed = true;\n  }',
    mutated: '  // MUTANT: Don\'t track Day 5 usage\n  if (prDay.dayIndex === ALLOWED_DAY5_DIFF.dayIndex) {\n    // day5AllowListUsed = true;\n  }',
    tests: ["test:med2-comparison"],
    equivalent: false,
  },
  
  // M9: Remove baseline Day 2 (guard should catch missing day)
  {
    name: "M9: Remove baseline Day 2",
    file: "scripts/fixtures/med2-baseline-main.json",
    original: '  {\n    "dayIndex": 2,',
    mutated: '  {\n    "dayIndex": 999,',
    tests: ["test:med2-comparison"],
    equivalent: false,
  },
  
  // M10: Add unknown profile to allow-list (guard should catch it)
  {
    name: "M10: Add unknown profile to allow-list",
    file: "scripts/test-identity-vs-main.ts",
    original: 'const ALLOWED_DIFFS: Array<{ profile: string; day: number; slot: number; mainExercise: string; expectedExercise: string }> = [\n  { profile: "current-knee-intermediate",',
    mutated: 'const ALLOWED_DIFFS: Array<{ profile: string; day: number; slot: number; mainExercise: string; expectedExercise: string }> = [\n  { profile: "FAKE-UNKNOWN-PROFILE-XYZ", day: 1, slot: 1, mainExercise: "fake", expectedExercise: "fake" },\n  { profile: "current-knee-intermediate",',
    tests: ["test:identity-vs-main"],
    equivalent: false,
  },
];

let killed = 0;
let survived = 0;
let crashed = 0;
let equivalent = 0;

console.log("=".repeat(80));
console.log("MUTATION TESTING - Owner Decision (a) Implementation");
console.log("=".repeat(80));
console.log("");

for (const mutant of MUTANTS) {
  console.log(`Testing: ${mutant.name}`);
  
  // Backup original
  const content = readFileSync(mutant.file, "utf-8");
  
  // Check if original pattern exists
  if (!content.includes(mutant.original)) {
    console.log(`  ❌ FAIL: Original pattern not found in ${mutant.file}`);
    console.log(`  Looking for: ${mutant.original.substring(0, 80)}...`);
    console.log(`  This mutant cannot be applied - pattern is stale or missing`);
    survived++;
    console.log("");
    // Continue to next mutant - will fail at end if any survived
    continue;
  }
  
  // Verify the mutation makes a change
  const mutated = content.replace(mutant.original, mutant.mutated);
  if (mutated === content) {
    console.log(`  ❌ FAIL: Mutation produced no diff in ${mutant.file}`);
    survived++;
    console.log("");
    continue;
  }
  
  writeFileSync(mutant.file, mutated, "utf-8");
  
  try {
    // Run tests
    let testFailed: boolean | "crash" = false;
    for (const test of mutant.tests) {
      try {
        execSync(`npm run ${test}`, {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
          cwd: process.cwd(),
        });
      } catch (error: unknown) {
        const output = (typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "") +
                       (typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "");
        
        // Use shared crash detection
        if (isCrash(error)) {
          console.log(`  💥 CRASH: ${test} crashed`);
          if (output) {
            console.log(`  Output preview: ${output.substring(0, 200)}`);
          }
          crashed++;
          testFailed = "crash";
          break;
        } else {
          // Normal test failure with assertion
          testFailed = true;
        }
      }
    }
    
    if (testFailed === "crash") {
      // Already counted as crash
    } else if (testFailed) {
      if (mutant.equivalent) {
        console.log(`  ✗ UNEXPECTED KILL: Expected to survive (marked equivalent) but tests failed`);
        console.log(`  Notes: ${mutant.notes || "none"}`);
        survived++;  // Count as survived because it didn't behave as expected
      } else {
        console.log(`  ✓ KILLED: Tests failed as expected`);
        killed++;
      }
    } else {
      if (mutant.equivalent) {
        console.log(`  ≡ EQUIVALENT: Tests passed (expected to survive)`);
        console.log(`  Notes: ${mutant.notes || "none"}`);
        equivalent++;
      } else {
        console.log(`  ✗ SURVIVED: All tests passed with mutant active`);
        survived++;
      }
    }
  } finally {
    // Restore original
    writeFileSync(mutant.file, content, "utf-8");
  }
  
  console.log("");
}

console.log("=".repeat(80));
console.log(`RESULTS: ${killed} killed, ${equivalent} equivalent, ${survived} survived, ${crashed} crashed`);
console.log("=".repeat(80));

if (survived > 0) {
  console.error(`\n❌ FAILED: ${survived} mutant(s) survived`);
  process.exit(1);
}

if (crashed > 0) {
  console.error(`\n❌ FAILED: ${crashed} mutant(s) caused crashes (not clean kills)`);
  process.exit(1);
}

console.log(`\n✅ PASSED: ${killed} killed, ${equivalent} equivalent`);
process.exit(0);
