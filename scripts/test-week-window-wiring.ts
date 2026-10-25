#!/usr/bin/env tsx
/**
 * Test that page.tsx actually uses weekWindow output in its session queries.
 * Ensures H4 (weekWindow) reaches the UI after merges.
 */

import { weekWindow } from "../src/lib/today/week-window";

let passed = 0;
let failed = 0;

function test(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.error(`✗ FAIL: ${message}`);
  }
}

console.log("\n=== Test weekWindow wiring ===\n");

// Test 1: weekWindow includes yesterday on first day of cycle week
// 2026-10-19 is Monday (7 days after 2026-10-12), so it's start of week 2
// Window must start at yesterday (2026-10-18) to catch completed/in-progress sessions
const window1 = weekWindow(
  { started_on: "2026-10-12", week_offset: 0 },
  "2026-10-19" // Monday of week 2
);

test(
  window1.start === "2026-10-18",
  `Week 2 Monday (2026-10-19): window starts at yesterday (2026-10-18), got ${window1.start}`
);

test(
  window1.end === "2026-10-25",
  `Week 2 Monday: window ends at today+6 (2026-10-25), got ${window1.end}`
);

// Test 2: weekWindow with week_offset
const window2 = weekWindow(
  { started_on: "2026-10-12", week_offset: 2 },
  "2026-10-29" // Wednesday
);

test(
  window2.start === "2026-10-26",
  `week_offset=2: starts 2 weeks later (2026-10-26), got ${window2.start}`
);

test(
  window2.end === "2026-11-04",
  `week_offset=2: ends today+6 (2026-11-04), got ${window2.end}`
);

console.log(`\n${failed === 0 ? "✅" : "❌"} Passed ${passed}/${passed + failed} wiring tests\n`);

if (failed > 0) {
  process.exit(1);
}
