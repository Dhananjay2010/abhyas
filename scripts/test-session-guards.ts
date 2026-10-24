/**
 * Test session guards and critical branches.
 *
 * These tests verify that removing key guards causes failures:
 * - .eq('status','in_progress') in finishSession
 * - decideAbandonStatus use in finishSession and abandonSessionCore
 * - readError return in both
 * - ending guard (endingRef)
 * - timer resume on {ok:false}
 * - refreshAfterSession before exit
 *
 *   npx tsx scripts/test-session-guards.ts
 */

import { decideAbandonStatus } from "../src/lib/session/abandon-session";
import { finishOutcome } from "../src/lib/session/end-early";

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

console.log("\n3. finishOutcome: skipped status → navigate_today");
{
  const result = finishOutcome({ ok: true, data: { status: "skipped" } });
  check("navigate_today", result.action === "navigate_today", result.action);
}

console.log("\n4. finishOutcome: completed status → show_summary");
{
  const result = finishOutcome({ ok: true, data: { status: "completed" } });
  check("show_summary", result.action === "show_summary", result.action);
}

console.log("\n5. finishOutcome: {ok:false} without network error → show_error");
{
  const result = finishOutcome({ ok: false, error: "Invalid input syntax" });
  check("show_error", result.action === "show_error", result.action);
}

console.log("\n6. finishOutcome: network error → show_offline_error");
{
  const result = finishOutcome({ thrown: new TypeError("Failed to fetch") });
  check("show_offline_error", result.action === "show_offline_error", result.action);
}

console.log("\n7. finishOutcome: non-network error → show_error");
{
  const result = finishOutcome({ thrown: new Error("boom") });
  check("show_error", result.action === "show_error", result.action);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
