#!/usr/bin/env tsx
/**
 * Run all 13 mutants and report results in a table
 */

import { execSync } from "child_process";
import * as fs from "fs";

type Mutant = {
  id: string;
  file: string;
  lineStart: number;
  lineEnd?: number;
  mutation: string;
  testCommand: string;
};

const mutants: Mutant[] = [
  {
    id: "X1",
    file: "src/lib/program/persist.ts",
    lineStart: 127,
    lineEnd: 138,
    mutation: "Remove repoint call for first build (change if condition)",
    testCommand: "npm run test:persist-block",
  },
  {
    id: "X2",
    file: "src/lib/program/persist.ts",
    lineStart: 129,
    lineEnd: 134,
    mutation: "Comment out repointSessionsAfterRebuild call in rebuild",
    testCommand: "npm run test:persist-block",
  },
  {
    id: "X5",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 299,
    mutation: "Remove program_id from .update() call",
    testCommand: "npm run test:repoint-db-writes",
  },
  {
    id: "X7",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 92,
    mutation: "Change has_sets condition to always keep",
    testCommand: "npm run test:repoint-db-writes",
  },
  {
    id: "X8",
    file: "src/lib/resolve-today-days.ts",
    lineStart: 39,
    lineEnd: 44,
    mutation: "Comment out retired blocks section",
    testCommand: "npm run test:resolve-today-days",
  },
  {
    id: "X9",
    file: "src/lib/resolve-today-days.ts",
    lineStart: 20,
    lineEnd: 29,
    mutation: "Comment out active blocks section",
    testCommand: "npm run test:resolve-today-days",
  },
  {
    id: "X10-X15",
    file: "src/lib/program/prescription.ts",
    lineStart: 108,
    mutation: "Remove deload reduction (return p.sets instead of formula)",
    testCommand: "npm run test:deload-prescription",
  },
  {
    id: "X11",
    file: "src/lib/program/persist.ts",
    lineStart: 26,
    mutation: "Use UTC date instead of timezone-aware date",
    testCommand: "npm run test:block-start-date-tz",
  },
  {
    id: "X16",
    file: "src/lib/resolve-today-days.ts",
    lineStart: 55,
    mutation: "Set is_first_day_of_block to false always",
    testCommand: "npm run test:resolve-today-days",
  },
  {
    id: "NEW1",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 103,
    mutation: "Remove day_type check from label match",
    testCommand: "npm run test:repoint-db-writes",
  },
  {
    id: "NEW2",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 106,
    lineEnd: 109,
    mutation: "Comment out index match fallback",
    testCommand: "npm run test:repoint-matching",
  },
  {
    id: "NEW3",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 92,
    mutation: "Always keep sessions (change has_sets to true)",
    testCommand: "npm run test:repoint-db-writes",
  },
  {
    id: "NEW4",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 269,
    lineEnd: 272,
    mutation: "Comment out session_exercises delete",
    testCommand: "npm run test:repoint-db-writes",
  },
  {
    id: "NEW5",
    file: "src/lib/program/repoint-sessions.ts",
    lineStart: 280,
    lineEnd: 285,
    mutation: "Comment out session_exercises insert",
    testCommand: "npm run test:repoint-db-writes",
  },
];

console.log("Running all mutants...\n");

const results: Array<{ id: string; file: string; line: string; status: string; firstFailure: string }> = [];

for (const mutant of mutants) {
  console.log(`Testing ${mutant.id}...`);
  
  const backup = `${mutant.file}.bak`;
  const content = fs.readFileSync(mutant.file, "utf-8");
  fs.writeFileSync(backup, content);
  
  try {
    // Apply mutation
    const lines = content.split("\n");
    for (let i = mutant.lineStart - 1; i < (mutant.lineEnd ?? mutant.lineStart); i++) {
      if (lines[i]) {
        lines[i] = `// MUTANT ${mutant.id}: ${lines[i]}`;
      }
    }
    fs.writeFileSync(mutant.file, lines.join("\n"));
    
    // Run test
    try {
      execSync(mutant.testCommand, { stdio: "pipe", encoding: "utf-8" });
      results.push({
        id: mutant.id,
        file: mutant.file,
        line: mutant.lineEnd ? `${mutant.lineStart}-${mutant.lineEnd}` : `${mutant.lineStart}`,
        status: "SURVIVED",
        firstFailure: "",
      });
    } catch (error: unknown) {
      const output = error && typeof error === "object" && "stdout" in error && "stderr" in error
        ? String(error.stdout) + String(error.stderr)
        : "";
      const failMatch = output.match(/✗ FAIL: ([^\n]+)/);
      results.push({
        id: mutant.id,
        file: mutant.file,
        line: mutant.lineEnd ? `${mutant.lineStart}-${mutant.lineEnd}` : `${mutant.lineStart}`,
        status: "KILLED",
        firstFailure: failMatch ? failMatch[1] : "Test failed",
      });
    }
  } finally {
    // Restore original
    fs.copyFileSync(backup, mutant.file);
    fs.unlinkSync(backup);
  }
}

console.log("\n=== MUTANT TEST RESULTS ===\n");
console.log("| ID | File:Line | Status | First Failing Test |");
console.log("|---|---|---|---|");
for (const r of results) {
  const fileName = r.file.replace("src/", "").replace("lib/", "");
  console.log(`| ${r.id} | ${fileName}:${r.line} | ${r.status} | ${r.firstFailure} |`);
}

const survivors = results.filter((r) => r.status === "SURVIVED");
if (survivors.length > 0) {
  console.log(`\n❌ ${survivors.length} mutant(s) survived!`);
  process.exit(1);
} else {
  console.log("\n✅ All mutants killed!");
}
