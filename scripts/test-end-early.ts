/**
 * Test end-early outcome logic.
 *
 * Validates:
 * - endEarlyOutcome: navigate_today, show_summary, show_offline, show_error
 * - finishOutcome: navigate_today, show_summary, show_offline_error, show_error
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

console.log("\n9. finishOutcome: {ok:true, status:completed} → show_summary");
{
  const result = finishOutcome({ ok: true, data: { status: "completed" } });
  check("show_summary", result.action === "show_summary", result.action);
}

console.log("\n10. finishOutcome: {ok:true, status:skipped} → navigate_today");
{
  const result = finishOutcome({ ok: true, data: { status: "skipped" } });
  check("navigate_today", result.action === "navigate_today", result.action);
}

console.log("\n11. finishOutcome: {ok:false} → show_error");
{
  const result = finishOutcome({ ok: false });
  check("show_error", result.action === "show_error", result.action);
}

console.log("\n12. finishOutcome: {ok:false, error:'msg'} → show_error");
{
  const result = finishOutcome({ ok: false, error: "Database error" });
  check("show_error", result.action === "show_error", result.action);
}

console.log("\n13. finishOutcome: network error (Failed to fetch) → show_offline_error");
{
  const result = finishOutcome({ thrown: new TypeError("Failed to fetch") });
  check("show_offline_error", result.action === "show_offline_error", result.action);
}

console.log("\n14. finishOutcome: non-network error → show_error");
{
  const result = finishOutcome({ thrown: new Error("Something went wrong") });
  check("show_error", result.action === "show_error", result.action);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
