/**
 * Mutation testing for knee-safety rules (PR #73)
 * 
 * Tests that critical patterns are covered by the test suite.
 * A mutant "survives" if tests pass after the mutation (bad).
 * A mutant is "killed" if tests fail after the mutation (good).
 * 
 * Workflow per mutant:
 * 1. Verify pattern exists
 * 2. Backup file
 * 3. Apply mutation
 * 4. Verify it compiles
 * 5. Run targeted test(s)
 * 6. Restore from backup with byte comparison
 * 7. Report killed/survived
 * 
 * Exit 1 if any mutant survives or is skipped.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

type Mutant = {
  name: string;
  file: string;
  pattern: string | RegExp;
  mutate: string;
  tests: string[]; // Test script names (test:knee-swaps, test:catalogue-knee-jumps, etc.)
  notes?: string; // Optional explanation for why a mutant behaves a certain way
};

const mutants: Mutant[] = [
  // 1. High-impact lower-body ban for knee injury (core knee-safety logic)
  {
    name: "Disable high-impact lower-body ban for knee injury",
    file: "src/lib/program/generate.ts",
    pattern: /if \(input\.anyKneeInjury && ex\.impact === "high"\) \{/,
    mutate: 'if (!input.anyKneeInjury && ex.impact === "high") {',
    tests: ["test:knee-safety-matrix"],
  },

  // 2. Past-knee lunge filter (PR #73 core logic)
  {
    name: "Disable past-knee lunge filter (allow unsafe lunges for past knee)",
    file: "src/lib/program/generate.ts",
    pattern: /if \(hasPastKnee && !PAST_KNEE_LUNGE_EXERCISES\.has\(ex\.slug\)\) \{/,
    mutate: 'if (!hasPastKnee && !PAST_KNEE_LUNGE_EXERCISES.has(ex.slug)) {',
    tests: ["test:knee-safety-matrix"],
  },

  // 3. Beginner high-impact filter (PR #73 Step C)
  {
    name: "Disable beginner high-impact exclusion for knee injury",
    file: "src/lib/program/generate.ts",
    pattern: /\/\/ SAFETY: Beginners with knee injury \(any\) exclude ALL high-impact exercises\s+if \(input\.level === "beginner"\) \{/,
    mutate: '// SAFETY: Beginners with knee injury (any) exclude ALL high-impact exercises\n    if (input.level !== "beginner") {',
    tests: ["test:knee-safety-matrix"],
  },

  // 4. Force-add quad work (PR #73 Task 3b)
  {
    name: "Disable force-add quad work for knee injury (allow empty quad days)",
    file: "src/lib/program/generate.ts",
    pattern: /if \(\(hasKneeInjury \|\| hasPastKnee\) && isLowerOrFullDay\) \{/,
    mutate: 'if (!(hasKneeInjury || hasPastKnee) && isLowerOrFullDay) {',
    tests: ["test:knee-safety-matrix"],
  },

  // 5a. Drop knee high-impact filter in swap path (alternatives.ts)
  {
    name: "Drop knee high-impact filter in alternatives (swaps)",
    file: "src/lib/program/alternatives.ts",
    pattern: /\/\/ 6b\. PR #73: Knee injuries exclude high-impact lower-body moves\s+if \(\(ctx\.anyKneeInjury \?\? false\) && candidate\.impact === "high"\) \{/,
    mutate: '// 6b. PR #73: Knee injuries exclude high-impact lower-body moves\n    if (!(ctx.anyKneeInjury ?? false) && candidate.impact === "high") {',
    tests: ["test:swap-mutations"],
  },

  // 5b. Drop past-knee 4-list restriction in swaps (alternatives.ts)
  {
    name: "Drop past-knee 4-list restriction in swaps",
    file: "src/lib/program/alternatives.ts",
    pattern: /if \(hasPastKnee && current\.movement_pattern === "lunge"\) \{/,
    mutate: 'if (!hasPastKnee && current.movement_pattern === "lunge") {',
    tests: ["test:knee-swaps"],
  },

  // 5e. getSwapPatterns dropping anyKneeInjury
  {
    name: "Drop anyKneeInjury in getSwapPatterns",
    file: "src/lib/program/swap-patterns.ts",
    pattern: /const hasKneeInjury = input\.anyKneeInjury \?\? false;/,
    mutate: 'const hasKneeInjury = false;',
    tests: ["test:swap-mutations"],
  },

  // 5f. hasCurrentKnee forced to false
  {
    name: "Force hasCurrentKnee to false in buildPatternList",
    file: "src/lib/program/alternatives.ts",
    pattern: /const skipFallback = \(hasCurrentKnee \?\? hasKneeInjury\) && currentPattern === "lunge";/,
    mutate: 'const skipFallback = (false) && currentPattern === "lunge";',
    tests: ["test:knee-swaps"],
  },

  // 5d. Unsafe-lunge list check (checking if truly equivalent to contraindication check)
  {
    name: "Drop unsafe-lunge list check (deficit lunges, pistols)",
    file: "src/lib/program/generate.ts",
    pattern: /\/\/ PR #73 coordinator: ANY knee injury \(current or past\) excludes unsafe lunges\s+\/\/ \(deficit lunges, pistol squats, side split squat\)\s+if \(input\.anyKneeInjury && UNSAFE_KNEE_LUNGES\.has\(ex\.slug\)\) \{/,
    mutate: '// PR #73 coordinator: ANY knee injury (current or past) excludes unsafe lunges\n  // (deficit lunges, pistol squats, side split squat)\n  if (!input.anyKneeInjury && UNSAFE_KNEE_LUNGES.has(ex.slug)) {',
    tests: ["test:swap-mutations"],
    notes: "UNSAFE_KNEE_LUNGES is NOT redundant with contraindication tags - these exercises are not explicitly tagged as contraindicated in the catalogue, so this filter is necessary."
  },

  // 5h. Re-add current-knee skip for step-ups and split-squats
  {
    name: "Re-add current-knee contraindication skip for step-ups/split-squats",
    file: "src/lib/program/generate.ts",
    pattern: /if \(allContraindications\.some\(\(r\) => input\.currentInjuryRegions\.includes\(r\)\)\) \{\s+return false;\s+\}/,
    mutate: `if (allContraindications.some((r) => input.currentInjuryRegions.includes(r))) {
      const KNEE_SAFE_LUNGE_EXERCISES = new Set([
        "step-up-with-knee-raise",
        "barbell-step-ups",
        "dumbbell-step-ups",
        "split-squat-with-dumbbells",
        "smith-single-leg-split-squat",
      ]);
      if (!(input.currentInjuryRegions.includes("knee") && KNEE_SAFE_LUNGE_EXERCISES.has(ex.slug))) {
        return false;
      }
    }`,
    tests: ["test:knee-safety-matrix", "test:knee-swaps"],
  },

  // B0. BMI>=30 high-impact ban
  {
    name: "Drop BMI>=30 high-impact ban",
    file: "src/lib/program/generate.ts",
    pattern: /if \(input\.bmi !== null && input\.bmi >= 30 && ex\.impact === "high"\) return false;/,
    mutate: '// MUTANT: Removed BMI>=30 high-impact ban',
    tests: ["test:bmi-high-impact"],
  },

  // B1. Remove anyKneeInjury from buildSwapContext
  {
    name: "Drop anyKneeInjury from swap context",
    file: "src/lib/program/swap-context.ts",
    pattern: /anyKneeInjury: input\.anyKneeInjury,/,
    mutate: 'anyKneeInjury: false,',
    tests: ["test:swap-context"],
  },

  // PR #73 Run 13: Protected quad trimming mutant
  {
    name: "Remove quad protection from duration trim (allow dropping the only quad)",
    file: "src/lib/program/generate.ts",
    pattern: /\/\/ Never drop the only quad \(protect it for knee-injured users\)\s+if \(quadCount === 1 && ex\.primary_muscles\.includes\("quads"\)\) continue;/,
    mutate: '// MUTANT: Removed quad protection\n              // if (quadCount === 1 && ex.primary_muscles.includes("quads")) continue;',
    tests: ["test:quad-coverage-grid", "test:knee-safety-matrix"],
  },

  // PR #73 Run 13: Wall-sit reuse mutant
  {
    name: "Disable wall-sit reuse for current-knee (mark as used in block)",
    file: "src/lib/program/generate.ts",
    pattern: /\/\/ For current-knee, allow wall-sit reuse; for past-knee, check usedInBlock\s+if \(!hasCurrentKneeLocal && usedInBlock\.has\(e\.id\)\) return false;\s+if \(hasCurrentKneeLocal && e\.slug !== "wall-sit" && usedInBlock\.has\(e\.id\)\) return false;/,
    mutate: '// MUTANT: Disabled wall-sit reuse\n            if (usedInBlock.has(e.id)) return false;',
    tests: ["test:quad-coverage-grid", "test:knee-safety-matrix"],
  },
  
  // PR #73 Run 21: Sissy ban in isEligible is the PRIMARY barrier for past-knee plans
  // (weighted-sissy-squat has contraindicated_regions: ["knee"], but that only filters
  // current-knee. Past-knee users have currentInjuryRegions: [] and rely on this explicit
  // anyKneeInjury check at 570 to block sissy from plans). Removing 570 changes 139 past-knee plans.
  // The alternatives.ts ban is the BACKSTOP for swaps (rankAlternatives doesn't call isEligible).
  {
    name: "Remove sissy-squat ban in isEligible (plan generation for past-knee)",
    file: "src/lib/program/generate.ts",
    pattern: /\/\/ PR #73 coordinator: ANY knee injury excludes sissy squats \(including weighted-sissy-squat\)\s+if \(input\.anyKneeInjury && ex\.slug\.includes\("sissy"\)\) \{\s+return false;\s+\}/,
    mutate: '// MUTANT: Removed sissy ban from isEligible\n  // if (input.anyKneeInjury && ex.slug.includes("sissy")) {\n  //   return false;\n  // }',
    tests: ["test:sissy-squat-ban"],
  },
  
  {
    name: "Remove sissy-squat ban in rankAlternatives (swap generation)",
    file: "src/lib/program/alternatives.ts",
    pattern: /\/\/ 6c\. PR #73: ANY knee injury excludes sissy squats \(defense-in-depth with isEligible\)\s+if \(\(ctx\.anyKneeInjury \?\? false\) && candidate\.slug\.includes\("sissy"\)\) \{\s+continue;\s+\}/,
    mutate: '// MUTANT: Removed sissy ban from swaps',
    tests: ["test:sissy-squat-ban"],
  },
  
  // PR #73 Run 20: M3 protection - never drop the only pull on knee-injured full-body days
  {
    name: "Remove M3 pull protection (allow dropping only pull during trim)",
    file: "src/lib/program/generate.ts",
    pattern: /\/\/ Never drop the only pull or only push\s+if \(isPull && pullCount === 1\) continue;/,
    mutate: '// MUTANT: Removed pull protection\n                // if (isPull && pullCount === 1) continue;',
    tests: ["test:knee-safety-matrix"],
  },
  
  // PR #73 Run 20: M3 protection - never drop the only push on knee-injured full-body days
  {
    name: "Remove M3 push protection (allow dropping only push during trim)",
    file: "src/lib/program/generate.ts",
    pattern: /if \(isPush && pushCount === 1\) continue;/,
    mutate: '// MUTANT: Removed push protection\n                // if (isPush && pushCount === 1) continue;',
    tests: ["test:knee-safety-matrix"],
  },
];

let killed = 0;
let survived = 0;
let skipped = 0;

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function runMutation(mutant: Mutant): void {
  const { name, file, pattern, mutate, tests } = mutant;
  const backupFile = `${file}.backup`;

  console.log(`\n${name}`);

  // 1. Verify pattern exists
  const original = readFileSync(file, "utf8");
  const regex = typeof pattern === "string" ? new RegExp(pattern.replace(/[.*+?^${}()|[\]/]/g, '/$&')) : pattern;
  
  if (!regex.test(original)) {
    console.log(`  ⊘ SKIP: Pattern not found`);
    skipped++;
    return;
  }

  // 2. Backup
  writeFileSync(backupFile, original, "utf8");
  const originalHash = sha256(original);

  try {
    // 3. Apply mutation
    const mutated = original.replace(regex, mutate);
    if (mutated === original) {
      console.log(`  ⊘ SKIP: Mutation did not change file`);
      skipped++;
      return;
    }
    writeFileSync(file, mutated, "utf8");
    
    // 3b. Verify file actually changed (re-read from disk and compare)
    const writtenContent = readFileSync(file, "utf8");
    const writtenHash = sha256(writtenContent);
    if (writtenHash === originalHash) {
      console.log(`  ⊘ SKIP: File hash unchanged after mutation (on-disk check)`);
      skipped++;
      return;
    }

    // 4. Verify it compiles
    try {
      execSync("npx tsc --noEmit", { stdio: "pipe", encoding: "utf8" });
    } catch {
      console.log(`  ⊘ SKIP: Does not compile after mutation`);
      skipped++;
      return;
    }

    // 5. Run targeted test(s)
    let testFailed = false;
    for (const test of tests) {
      try {
        execSync(`npm run ${test}`, { stdio: "pipe", encoding: "utf8" });
      } catch {
        testFailed = true;
        break;
      }
    }

    // 6. Report
    if (testFailed) {
      console.log(`  ✓ KILLED`);
      killed++;
    } else {
      console.log(`  ✗ SURVIVED (tests passed with mutation)`);
      survived++;
    }
  } finally {
    // 7. Restore from backup with byte comparison
    if (existsSync(backupFile)) {
      const backup = readFileSync(backupFile, "utf8");
      writeFileSync(file, backup, "utf8");
      unlinkSync(backupFile);

      const restoredHash = sha256(readFileSync(file, "utf8"));
      if (restoredHash !== originalHash) {
        console.error(`\n❌ FATAL: File ${file} restore failed (hash mismatch)`);
        process.exit(1);
      }
    }
  }
}

console.log("Knee Safety Mutation Testing");
console.log("─".repeat(60));

// Baseline: ensure all tests pass before any mutations
console.log("\nRunning baseline tests...");
const testedAlready = new Set<string>();
for (const mutant of mutants) {
  for (const test of mutant.tests) {
    if (testedAlready.has(test)) continue;
    testedAlready.add(test);
    
    // Run test - must pass with exit code 0
    try {
      execSync(`npm run ${test}`, { stdio: "pipe", encoding: "utf8" });
    } catch {
      console.error(`❌ FATAL: Baseline test ${test} failed`);
      process.exit(1);
    }
  }
}
console.log("✓ Baseline tests pass\n");

// Setup SIGINT/SIGTERM trap to restore files on interrupt
const backupFiles: string[] = [];
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Interrupted - restoring files...");
  for (const backup of backupFiles) {
    if (existsSync(backup)) {
      const file = backup.replace(".backup", "");
      const original = readFileSync(backup, "utf8");
      writeFileSync(file, original, "utf8");
      unlinkSync(backup);
    }
  }
  process.exit(130);
});
process.on("SIGTERM", () => {
  console.log("\n\n⚠️  Terminated - restoring files...");
  for (const backup of backupFiles) {
    if (existsSync(backup)) {
      const file = backup.replace(".backup", "");
      const original = readFileSync(backup, "utf8");
      writeFileSync(file, original, "utf8");
      unlinkSync(backup);
    }
  }
  process.exit(143);
});

for (const mutant of mutants) {
  const backupFile = `${mutant.file}.backup`;
  backupFiles.push(backupFile);
  runMutation(mutant);
  // Remove from list after successful restore
  const idx = backupFiles.indexOf(backupFile);
  if (idx !== -1) backupFiles.splice(idx, 1);
}

console.log("\n" + "─".repeat(60));
console.log(`Mutants killed:   ${killed}`);
console.log(`Mutants survived: ${survived}`);
console.log(`Mutants skipped:  ${skipped}`);
console.log("");

if (survived > 0 || skipped > 0) {
  console.log(`FAILED: ${survived} survived, ${skipped} skipped`);
  process.exit(1);
} else {
  console.log("PASSED: All mutants killed");
  process.exit(0);
}
