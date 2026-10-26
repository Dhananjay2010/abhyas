#!/usr/bin/env tsx
/**
 * Test formatDurationMinutes '—' scope: completed strength sessions with null duration.
 *
 * Behavioral test ensuring that removing status/type props causes failure.
 * '—' only appears for completed strength sessions with null duration.
 *
 *   npx tsx scripts/test-format-duration-dash.ts
 */

import { formatDurationMinutes } from "../src/lib/history/compute-duration";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`❌ ${label}${detail ? `  -- ${detail}` : ""}`);
    failed++;
  }
}

console.log("Test formatDurationMinutes '—' scope\n");

console.log("1. Completed strength session, null duration → '—'");
{
  const result = formatDurationMinutes(null, "completed", "weights");
  check("completed weights with null → '—'", result === "—", `got ${JSON.stringify(result)}`);
}

console.log("\n2. Skipped strength session, null duration → null (not '—')");
{
  const result = formatDurationMinutes(null, "skipped", "weights");
  check("skipped weights with null → null", result === null, `got ${JSON.stringify(result)}`);
}

console.log("\n3. In-progress strength session, null duration → null");
{
  const result = formatDurationMinutes(null, "in_progress", "weights");
  check("in_progress weights with null → null", result === null, `got ${JSON.stringify(result)}`);
}

console.log("\n4. Completed yoga session, null duration → null");
{
  const result = formatDurationMinutes(null, "completed", "yoga");
  check("completed yoga with null → null", result === null, `got ${JSON.stringify(result)}`);
}

console.log("\n5. Completed breathing session, null duration → null");
{
  const result = formatDurationMinutes(null, "completed", "meditation");
  check("completed meditation with null → null", result === null, `got ${JSON.stringify(result)}`);
}

console.log("\n6. Completed strength session, 1800s → '30 min'");
{
  const result = formatDurationMinutes(1800, "completed", "weights");
  check("completed weights with 1800s → '30 min'", result === "30 min", `got ${JSON.stringify(result)}`);
}

console.log("\n7. Completed strength session, 0s → null (not '—')");
{
  const result = formatDurationMinutes(0, "completed", "weights");
  check("completed weights with 0s → null", result === null, `got ${JSON.stringify(result)}`);
}

console.log("\n8. Missing status/type (undefined) → null");
{
  // This simulates the bug where status/type props are removed
  const result = formatDurationMinutes(null, undefined, undefined);
  check("null duration, no status/type → null", result === null, `got ${JSON.stringify(result)}`);
}

console.log("\n9. Planted bug: removing status parameter breaks '—' detection");
{
  // If status is undefined, '—' will never show (this is the bug we're protecting against)
  const buggyResult = formatDurationMinutes(null, undefined, "weights");
  check("null duration, weights, no status → null (bug)", buggyResult === null, 
    `got ${JSON.stringify(buggyResult)} - if this was '—', the bug detector failed`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All format-duration-dash tests passed!");
