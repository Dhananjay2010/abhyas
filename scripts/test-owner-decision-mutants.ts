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
  // G-3: Remove calf-press from past-knee exclusions
  {
    name: "G-3.1: Remove calf-press inline exclusion for past-knee",
    file: "src/lib/program/generate.ts",
    original: '  // Owner decision (a): Past-knee specific NEW exclusions (3 slugs added in this PR)\n  // Calf-press is knee-contraindicated but only excluded for past-knee (not current, see tag check above)\n  const hasCurrentKnee = input.currentInjuryRegions.includes("knee");\n  const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;\n  if (hasPastKnee && ex.slug === "calf-press-on-the-leg-press-machine") {\n    return false;\n  }',
    mutated: '  // MUTANT: Removed calf-press exclusion\n  const hasCurrentKnee = input.currentInjuryRegions.includes("knee");\n  const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;',
    tests: ["test:owner-decision-a", "test:past-knee-calf-swap-exclusion"],
  },
  
  // G-3: Remove jammer check in generate.ts (primary defense)
  {
    name: "G-3.4: Remove jammer check in generate.ts",
    file: "src/lib/program/generate.ts",
    original: '  // G-3: Landmine jammers excluded for ANY knee injury (leg-driven presses)\n  if (input.anyKneeInjury && (ex.slug === "landmine-linear-jammer" || ex.slug === "single-arm-linear-jammer")) {\n    return false;\n  }',
    mutated: '  // MUTANT: Removed jammer check',
    tests: ["test:knee-contraindicated"],
  },
  
  // Global tag filtering would break past-knee swaps
  {
    name: "Decision(a).1: Add global tag filtering in rankAlternatives",
    file: "src/lib/program/alternatives.ts",
    original: '    // G-3: Landmine jammers excluded for ANY knee injury (leg-driven presses)\n    if ((ctx.anyKneeInjury ?? false) && (candidate.slug === "landmine-linear-jammer" || candidate.slug === "single-arm-linear-jammer")) {\n      continue;\n    }',
    mutated: '    // MUTANT: Apply GLOBAL tag filtering to ANY knee (WRONG - breaks 174 swap lists)\n    if ((ctx.anyKneeInjury ?? false) && candidate.contraindicated_regions.includes("knee")) {\n      continue;\n    }',
    tests: ["test:past-knee-keeps-tier"],
  },
  
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
  
  // M7: Remove both jammer slugs from PAST_KNEE_EXCLUDED_SLUGS (EQUIVALENT)
  {
    name: "M7: Remove both jammer slugs from PAST_KNEE_EXCLUDED_SLUGS",
    file: "src/lib/program/past-knee.ts",
    original: 'export function getPastKneeExcludedSlugs(): Set<string> {\n  return new Set([\n    "calf-press-on-the-leg-press-machine",\n    "landmine-linear-jammer",\n    "single-arm-linear-jammer",\n  ]);\n}',
    mutated: 'export function getPastKneeExcludedSlugs(): Set<string> {\n  return new Set([\n    "calf-press-on-the-leg-press-machine",\n    // MUTANT: Removed both jammer slugs\n  ]);\n}',
    tests: ["test:owner-decision-a", "test:past-knee-calf-swap-exclusion"],
    equivalent: true,
    notes: "rankAlternatives' only production caller is buildEligibleSwapList (eligible-swap-list.ts:71), which first applies isEligible's any-knee jammer check. Evidence: byte-identical output across 483,912 swap lists (4 injury sets x 11 equipment x 3 levels x 2 tracks x 611 exercises x 3 session ids) and 7,290 plans.",
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
