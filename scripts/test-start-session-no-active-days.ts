#!/usr/bin/env tsx
/**
 * Test: startSession with program_days!inner filter returns clear error when no active days
 *
 * With the status='active' filter on program_days using !inner join, if a program
 * has no active days, the query returns null. This test verifies that startSession
 * handles this gracefully and returns a clear error message instead of crashing.
 *
 * This is a type-level and control-flow check; no database needed.
 */

import * as fs from "fs";
import * as path from "path";

let failures = 0;

function check(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function main() {
  console.log("\nTesting startSession null program handling\n");

  // Read the startSession source
  const actionsPath = path.join(__dirname, "..", "src", "app", "session", "actions.ts");
  const source = fs.readFileSync(actionsPath, "utf-8");

  // Check that program_days uses !inner join
  const hasProgramDaysInner = source.includes("program_days!inner");
  check(hasProgramDaysInner, "program_days query uses !inner join");

  // Check that status='active' filter is present
  const hasStatusFilter = source.includes('.eq("program_days.status", "active")');
  check(hasStatusFilter, "program_days filtered by status='active'");

  // Check that startSession handles null program
  const hasNullCheck = source.includes('if (!program) return { ok: false, error: "Could not load the training block." }');
  check(hasNullCheck, "startSession checks for null program and returns error");

  // Verify the null check comes after the query
  const queryIndex = source.indexOf("program_days!inner");
  const nullCheckIndex = source.indexOf('if (!program) return { ok: false, error: "Could not load the training block." }');
  check(
    queryIndex > 0 && nullCheckIndex > queryIndex,
    "null check comes after program query"
  );

  console.log(failures === 0 ? "\n✅ ALL CHECKS PASSED\n" : `\n❌ ${failures} FAILURES\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
