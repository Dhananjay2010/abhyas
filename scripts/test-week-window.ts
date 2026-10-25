#!/usr/bin/env tsx
/**
 * Test weekWindow with week_offset 0 and 2
 */

import { weekWindow } from "../src/lib/today/week-window";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

console.log("\n=== Test 1: week_offset = 0 ===\n");

// Program started Mon 2026-10-12, week_offset 0
const prog0 = {
  started_on: "2026-10-12",
  current_cycle: 1,
  week_offset: 0,
};

// View Thu 2026-10-15 (day 4 of week 1)
const window1 = weekWindow(prog0, "2026-10-15");
assert(
  window1.start === "2026-10-12",
  `Week 1 start is 2026-10-12, got ${window1.start}`
);
assert(
  window1.end === "2026-10-21",
  `Week 1 end is 2026-10-21 (today+6), got ${window1.end}`
);

// View Mon 2026-10-19 (week 2)
const window2 = weekWindow(prog0, "2026-10-19");
assert(
  window2.start === "2026-10-18",
  `Week 2 start includes yesterday (2026-10-18), got ${window2.start}`
);
assert(
  window2.end === "2026-10-25",
  `Week 2 end is 2026-10-25, got ${window2.end}`
);

console.log("\n=== Test 2: week_offset = 2 ===\n");

// Program started Mon 2026-10-19, rebuild set week_offset = 2
const prog2 = {
  started_on: "2026-10-19",
  current_cycle: 2,
  week_offset: 2,
};

// View Thu 2026-10-29 (should be week starting 2026-10-26)
const window3 = weekWindow(prog2, "2026-10-29");
assert(
  window3.start === "2026-10-26",
  `Week_offset=2, today 10-29: start is 2026-10-26, got ${window3.start}`
);
assert(
  window3.end === "2026-11-04",
  `Week_offset=2, today 10-29: end is 2026-11-04 (today+6), got ${window3.end}`
);
assert(
  window3.start <= window3.end,
  `Window start <= end (${window3.start} <= ${window3.end})`
);

// Verify start is not after today
assert(
  window3.start <= "2026-10-29",
  `Window start ${window3.start} is not after today 2026-10-29`
);

console.log("\n=== Test 3: Before program start ===\n");

// View a date before started_on (edge case)
const window4 = weekWindow(prog0, "2026-10-10");
assert(
  window4.start === "2026-10-12",
  `Before start: clamped to started_on 2026-10-12, got ${window4.start}`
);

console.log(`\n${failed === 0 ? "✅" : "❌"} Passed ${passed}/${passed + failed} week-window tests\n`);

if (failed > 0) {
  process.exit(1);
}
