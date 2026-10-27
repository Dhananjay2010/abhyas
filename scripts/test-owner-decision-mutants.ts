#!/usr/bin/env tsx
/**
 * Targeted mutation tests for owner decision (a) implementation
 * Tests that removing key safety checks causes test failures
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

interface Mutant {
  name: string;
  file: string;
  original: string;
  mutated: string;
  tests: string[];
}

const MUTANTS: Mutant[] = [
  // G-3: Remove calf-press from past-knee exclusions
  {
    name: "G-3.1: Remove calf-press from PAST_KNEE_EXCLUDED_SLUGS",
    file: "src/lib/program/past-knee.ts",
    original: '  "calf-press-on-the-leg-press-machine",',
    mutated: '  // MUTANT: Removed "calf-press-on-the-leg-press-machine",',
    tests: ["test:owner-decision-a", "test:past-knee-calf-swap-exclusion"],
  },
  
  // G-3: Remove landmine jammer from past-knee exclusions
  {
    name: "G-3.2: Remove landmine-linear-jammer from PAST_KNEE_EXCLUDED_SLUGS",
    file: "src/lib/program/past-knee.ts",
    original: '  "landmine-linear-jammer",',
    mutated: '  // MUTANT: Removed "landmine-linear-jammer",',
    tests: ["test:owner-decision-a"],
  },
  
  // G-3: Remove single-arm jammer from past-knee exclusions
  {
    name: "G-3.3: Remove single-arm-linear-jammer from PAST_KNEE_EXCLUDED_SLUGS",
    file: "src/lib/program/past-knee.ts",
    original: '  "single-arm-linear-jammer",',
    mutated: '  // MUTANT: Removed "single-arm-linear-jammer",',
    tests: ["test:owner-decision-a"],
  },
  
  // Remove jammer check in generate.ts
  {
    name: "G-3.4: Remove jammer check in generate.ts",
    file: "src/lib/program/generate.ts",
    original: '  // G-3: Landmine jammers excluded for ANY knee injury (leg-driven presses)\n  if (input.anyKneeInjury && (ex.slug === "landmine-linear-jammer" || ex.slug === "single-arm-linear-jammer")) {\n    return false;\n  }',
    mutated: '  // MUTANT: Removed jammer check',
    tests: ["test:knee-contraindicated"],
  },
  
  // Remove jammer check in alternatives.ts
  {
    name: "G-3.5: Remove jammer check in alternatives.ts",
    file: "src/lib/program/alternatives.ts",
    original: '    // G-3: Landmine jammers excluded for ANY knee injury (leg-driven presses)\n    if ((ctx.anyKneeInjury ?? false) && \n        (candidate.slug === "landmine-linear-jammer" || candidate.slug === "single-arm-linear-jammer")) {\n      continue;\n    }',
    mutated: '    // MUTANT: Removed jammer check',
    tests: ["test:owner-decision-a"],
  },
  
  // Global tag filtering in alternatives (changes 174 swap lists)
  {
    name: "Decision(a).1: Add global tag filtering in rankAlternatives",
    file: "src/lib/program/alternatives.ts",
    original: '    // Tag-based knee contraindication applies to CURRENT knee only (owner decision a)\n    if (ctx.injuryRegions.includes("knee") && candidate.contraindicated_regions.includes("knee")) {\n      continue;\n    }',
    mutated: '    // MUTANT: Apply tag filtering to ANY knee (WRONG - breaks 174 swap lists)\n    if ((ctx.anyKneeInjury ?? false) && candidate.contraindicated_regions.includes("knee")) {\n      continue;\n    }',
    tests: ["test:past-knee-keeps-tier"],
  },
  
  // Remove past-knee exclusion check in isEligible
  {
    name: "Decision(a).2: Remove past-knee exclusion check in isEligible",
    file: "src/lib/program/generate.ts",
    original: '  // Owner decision (a): Past-knee specific NEW exclusions (3 slugs added in this PR)\n  // Calf-press is knee-contraindicated but only excluded for past-knee (not current, see tag check above)\n  const hasCurrentKnee = input.currentInjuryRegions.includes("knee");\n  const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;\n  if (hasPastKnee && isExcludedForPastKnee(ex)) {\n    return false;\n  }',
    mutated: '  // MUTANT: Removed past-knee exclusion check\n  const hasCurrentKnee = input.currentInjuryRegions.includes("knee");\n  const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;',
    tests: ["test:owner-decision-a"],
  },
];

let killed = 0;
let survived = 0;
let crashed = 0;

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
        const stdout = typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
        const stderr = typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
        const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 1;
        const output = stdout + stderr;
        
        // Crash detection: string throw, stack trace, or silent exit(1) without assertion
        const hasStackTrace = output.includes("    at ") || /^\s+at\s+/m.test(output) || output.includes("Error:");
        const hasAssertion = output.includes("✗ FAIL") || output.includes("❌ FAILED");
        const isSilentExit = status !== 0 && !output.trim();
        
        if (hasStackTrace || isSilentExit) {
          // This is a crash, not a kill
          console.log(`  💥 CRASH: ${test} crashed (${hasStackTrace ? 'stack trace' : 'silent exit'})`);
          if (output) {
            console.log(`  Output preview: ${output.substring(0, 200)}`);
          }
          crashed++;
          testFailed = "crash";
          break;
        } else if (hasAssertion) {
          // Normal test failure with assertion
          testFailed = true;
        } else {
          // Non-zero exit without clear signal - treat as crash
          console.log(`  💥 CRASH: ${test} exited ${status} without clear assertion`);
          crashed++;
          testFailed = "crash";
          break;
        }
      }
    }
    
    if (testFailed === "crash") {
      // Already counted as crash
    } else if (testFailed) {
      console.log(`  ✓ KILLED: Tests failed as expected`);
      killed++;
    } else {
      console.log(`  ✗ SURVIVED: All tests passed with mutant active`);
      survived++;
    }
  } finally {
    // Restore original
    writeFileSync(mutant.file, content, "utf-8");
  }
  
  console.log("");
}

console.log("=".repeat(80));
console.log(`RESULTS: ${killed} killed, ${survived} survived, ${crashed} crashed`);
console.log("=".repeat(80));

if (survived > 0) {
  console.error(`\n❌ FAILED: ${survived} mutant(s) survived`);
  process.exit(1);
}

if (crashed > 0) {
  console.error(`\n❌ FAILED: ${crashed} mutant(s) caused crashes (not clean kills)`);
  process.exit(1);
}

console.log(`\n✅ PASSED: All ${killed} mutants killed cleanly`);
process.exit(0);
