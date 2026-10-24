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
};

const mutants: Mutant[] = [
  // 1. Past-knee 4-list: Remove leg-extensions from PAST_KNEE_LUNGE_EXERCISES
  {
    name: "Remove leg-extensions from PAST_KNEE_LUNGE_EXERCISES",
    file: "src/lib/program/generate.ts",
    pattern: '"leg-extensions"',
    mutate: '"leg-extensions-MUTANT-REMOVED"',
    tests: ["test:knee-swaps", "test:past-knee-coordinator"],
  },

  // 2. Ban list: Disable high-impact lower-body ban for knee injury
  {
    name: "Disable high-impact lower-body ban for knee injury",
    file: "src/lib/program/generate.ts",
    pattern: /if \(input\.anyKneeInjury && ex\.impact === "high"\) {/,
    mutate: 'if (false && input.anyKneeInjury && ex.impact === "high") {',
    tests: ["test:catalogue-knee-jumps", "test:past-knee-coordinator"],
  },

  // 3. Ban list: Disable sissy squat ban
  {
    name: "Disable sissy squat ban for knee injury",
    file: "src/lib/program/generate.ts",
    pattern: /if \(input\.anyKneeInjury && ex\.slug\.includes\("sissy"\)\) {/,
    mutate: 'if (false && input.anyKneeInjury && ex.slug.includes("sissy")) {',
    tests: ["test:catalogue-knee-jumps"],
  },

  // 4. Ban list: Disable UNSAFE_KNEE_LUNGES ban
  {
    name: "Disable UNSAFE_KNEE_LUNGES ban for knee injury",
    file: "src/lib/program/generate.ts",
    pattern: /if \(input\.anyKneeInjury && UNSAFE_KNEE_LUNGES\.has\(ex\.slug\)\) {/,
    mutate: 'if (false && input.anyKneeInjury && UNSAFE_KNEE_LUNGES.has(ex.slug)) {',
    tests: ["test:catalogue-knee-jumps"],
  },

  // 5. Knee gate on backfill insertion (first occurrence)
  {
    name: "Bypass knee gate on backfill insertIndex (first occurrence)",
    file: "src/lib/program/generate.ts",
    pattern: /let insertIndex = hasKneeInjury && lastCoreIndex >= 0 \? lastCoreIndex : exercises\.length;/,
    mutate: "let insertIndex = false && lastCoreIndex >= 0 ? lastCoreIndex : exercises.length;",
    tests: ["test:no-injury-baseline"],
  },

  // 6. Past-knee lunge filter: Block the 4-list filter (allow all lunges for past knee)
  {
    name: "Disable past-knee lunge filter (allow unsafe lunges for past knee)",
    file: "src/lib/program/generate.ts",
    pattern: /if \(hasPastKnee && !PAST_KNEE_LUNGE_EXERCISES\.has\(ex\.slug\)\) {/,
    mutate: 'if (false && hasPastKnee && !PAST_KNEE_LUNGE_EXERCISES.has(ex.slug)) {',
    tests: ["test:past-knee-coordinator", "test:knee-swaps"],
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
  const patternToFind = typeof pattern === "string" ? pattern : pattern.source;
  const regex = typeof pattern === "string" ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern;
  
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

    // 4. Verify it compiles
    try {
      execSync("npx tsc --noEmit", { stdio: "pipe", encoding: "utf8" });
    } catch (err) {
      console.log(`  ⊘ SKIP: Does not compile after mutation`);
      skipped++;
      return;
    }

    // 5. Run targeted test(s)
    let testFailed = false;
    for (const test of tests) {
      try {
        execSync(`npm run ${test}`, { stdio: "pipe", encoding: "utf8" });
      } catch (err) {
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

for (const mutant of mutants) {
  runMutation(mutant);
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
