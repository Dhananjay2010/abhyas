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
    tests: ["test:owner-decision-a"],
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
  
  // Re-apply tag exclusion to past-knee in generate.ts
  {
    name: "Decision(a).1: Re-apply tag exclusion to past-knee in generate.ts",
    file: "src/lib/program/generate.ts",
    original: '  // Tag-based knee contraindication applies to CURRENT knee only (owner decision a)\n  if (input.currentInjuryRegions.includes("knee") && ex.contraindicated_regions.includes("knee")) {\n    return false;\n  }',
    mutated: '  // MUTANT: Re-apply tag exclusion to ANY knee\n  if (input.anyKneeInjury && ex.contraindicated_regions.includes("knee")) {\n    return false;\n  }',
    tests: ["test:owner-decision-a", "test:knee-contraindicated"],
  },
  
  // Re-apply tag exclusion to past-knee in alternatives.ts
  {
    name: "Decision(a).2: Re-apply tag exclusion to past-knee in alternatives.ts",
    file: "src/lib/program/alternatives.ts",
    original: '    // Tag-based knee contraindication applies to CURRENT knee only (owner decision a)\n    if (ctx.injuryRegions.includes("knee") && candidate.contraindicated_regions.includes("knee")) {\n      continue;\n    }',
    mutated: '    // MUTANT: Re-apply tag exclusion to ANY knee\n    if ((ctx.anyKneeInjury ?? false) && candidate.contraindicated_regions.includes("knee")) {\n      continue;\n    }',
    tests: ["test:owner-decision-a"],
  },
  
  // Remove past-knee exclusion check in isEligible
  {
    name: "Decision(a).3: Remove past-knee exclusion check in isEligible",
    file: "src/lib/program/generate.ts",
    original: '  // Owner decision (a): Past-knee specific exclusions (explicit slug list)\n  const hasCurrentKnee = input.currentInjuryRegions.includes("knee");\n  const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;\n  if (hasPastKnee && isExcludedForPastKnee(ex)) {\n    return false;\n  }',
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
    console.log(`  ⚠ WARNING: Original pattern not found in ${mutant.file}`);
    console.log(`  Looking for: ${mutant.original.substring(0, 60)}...`);
    survived++;
    continue;
  }
  
  // Apply mutation
  const mutated = content.replace(mutant.original, mutant.mutated);
  writeFileSync(mutant.file, mutated, "utf-8");
  
  try {
    // Run tests
    let testFailed = false;
    for (const test of mutant.tests) {
      try {
        execSync(`npm run ${test}`, {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
          cwd: process.cwd(),
        });
      } catch (error: any) {
        const output = error.stdout || error.stderr || "";
        if (output.includes("Error:") || output.includes("at ")) {
          // Stack trace detected - this is a crash
          console.log(`  💥 CRASH: ${test} crashed with error`);
          crashed++;
          testFailed = "crash";
          break;
        } else {
          // Normal test failure
          testFailed = true;
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

if (survived > 0 || crashed > 0) {
  process.exit(1);
} else {
  console.log("✅ All mutants killed");
  process.exit(0);
}
