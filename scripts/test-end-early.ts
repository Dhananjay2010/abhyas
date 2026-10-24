/**
 * Test end-early outcome logic.
 *
 * Validates:
 * - endEarlyOutcome: navigate_today, show_summary, show_offline, show_error
 * - finishOutcome: done, resume
 *
 *   npx tsx scripts/test-end-early.ts
 */

import { endEarlyOutcome, finishOutcome } from "../src/lib/session/end-early";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. endEarlyOutcome: {ok:true} with 0 sets → navigate_today");
{
  const result = endEarlyOutcome({ ok: true }, 0);
  check("navigate_today", result === "navigate_today", result);
}

console.log("\n2. endEarlyOutcome: {ok:true} with >0 sets → show_summary");
{
  const result = endEarlyOutcome({ ok: true }, 5);
  check("show_summary", result === "show_summary", result);
}

console.log("\n3. endEarlyOutcome: {ok:false} → show_error");
{
  const result = endEarlyOutcome({ ok: false }, 3);
  check("show_error", result === "show_error", result);
}

console.log("\n4. endEarlyOutcome: {ok:false, error:'msg'} → show_error");
{
  const result = endEarlyOutcome({ ok: false, error: "Database error" }, 3);
  check("show_error", result === "show_error", result);
}

console.log("\n5. endEarlyOutcome: network error (Failed to fetch) → show_offline");
{
  const result = endEarlyOutcome({ thrown: new TypeError("Failed to fetch") }, 3);
  check("show_offline", result === "show_offline", result);
}

console.log("\n6. endEarlyOutcome: network error (NetworkError) → show_offline");
{
  const result = endEarlyOutcome({ thrown: new TypeError("NetworkError when attempting to fetch resource.") }, 3);
  check("show_offline", result === "show_offline", result);
}

console.log("\n7. endEarlyOutcome: non-network TypeError → show_error");
{
  const result = endEarlyOutcome({ thrown: new TypeError("Cannot read property 'x' of undefined") }, 3);
  check("show_error", result === "show_error", result);
}

console.log("\n8. endEarlyOutcome: generic Error → show_error");
{
  const result = endEarlyOutcome({ thrown: new Error("Something went wrong") }, 3);
  check("show_error", result === "show_error", result);
}

console.log("\n9. finishOutcome: ok=true → done");
{
  const result = finishOutcome(true);
  check("done", result === "done", result);
}

console.log("\n10. finishOutcome: ok=false → resume");
{
  const result = finishOutcome(false);
  check("resume", result === "resume", result);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
