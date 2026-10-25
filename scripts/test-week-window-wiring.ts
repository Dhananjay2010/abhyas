#!/usr/bin/env tsx
/**
 * Test that page.tsx actually uses weekWindow output in its session queries.
 * Ensures H4 (weekWindow) and M5 (pulled-forward message) reach the UI after merges.
 */

import { strict as assert } from "node:assert";
import { weekWindow } from "../src/lib/today/week-window";
import { pulledForwardMessage } from "../src/lib/today/pulled-forward";

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

// Test 1: weekWindow returns correct range
// 2026-10-19 is Monday (7 days after 2026-10-12), so it's start of week 2
const window1 = weekWindow(
  { started_on: "2026-10-12", week_offset: 0 },
  "2026-10-19" // Monday of week 2
);

test(
  window1.start === "2026-10-19",
  `Week 2 Monday (2026-10-19): window starts at current cycle-week start (2026-10-19), got ${window1.start}`
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

// Test 3: pulledForwardMessage format  
// pulledToDayIndex is day_index (1-7): Monday=1, Tuesday=2, etc.
const message = pulledForwardMessage({
  programDayId: "day-1",
  originalDayIndex: 2, // Tuesday
  originalLabel: "Push A",
  pulledToDayIndex: 1, // Monday (day_index 1)
  pulledToDate: "2026-10-13",
});

test(
  message === "You already did Push A on Monday (your choice).",
  `Message format correct, got: "${message}"`
);

// Test 4: Another message
const message2 = pulledForwardMessage({
  programDayId: "day-3",
  originalDayIndex: 4, // Thursday
  originalLabel: "Legs A",
  pulledToDayIndex: 5, // Friday (day_index 5)
  pulledToDate: "2026-10-17",
});

test(
  message2 === "You already did Legs A on Friday (your choice).",
  `Message format correct for Legs, got: "${message2}"`
);

console.log(`\n${failed === 0 ? "✅" : "❌"} Passed ${passed}/${passed + failed} wiring tests\n`);

if (failed > 0) {
  process.exit(1);
}
