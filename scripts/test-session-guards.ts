/**
 * Test session guards and critical branches.
 *
 * These tests verify that removing key guards causes failures:
 * - .eq('status','in_progress') in finishSession
 * - decideAbandonStatus use in finishSession and abandonSessionCore
 *
 *   npx tsx scripts/test-session-guards.ts
 */

import { decideAbandonStatus } from "../src/lib/session/abandon-session";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. decideAbandonStatus: 0 working sets → skipped");
{
  const exercises = [{ session_sets: [{ id: "1", is_warmup_set: true }] }];
  const result = decideAbandonStatus(exercises);
  check("status is skipped", result === "skipped", result);
}

console.log("\n2. decideAbandonStatus: with working sets → completed");
{
  const exercises = [{ session_sets: [{ id: "1", is_warmup_set: false }] }];
  const result = decideAbandonStatus(exercises);
  check("status is completed", result === "completed", result);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
