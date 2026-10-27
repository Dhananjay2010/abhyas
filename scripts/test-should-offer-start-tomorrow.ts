/**
 * Test: shouldOfferStartTomorrow decision logic
 * 
 * Verifies:
 * - Only shown on first day, after 20:00, with no session started
 * - Hidden before 20:00, on later days, or if session started
 * 
 * Run: npx tsx scripts/test-should-offer-start-tomorrow.ts
 */

import { strict as assert } from "node:assert";
import { shouldOfferStartTomorrow } from "../src/lib/program/should-offer-start-tomorrow";

console.log("Test: shouldOfferStartTomorrow decision logic\n");

type TestCase = {
  name: string;
  isFirstDay: boolean;
  sessionStarted: boolean;
  localHour: number;
  expected: boolean;
};

const cases: TestCase[] = [
  // Happy path: first day, after 20:00, no session
  { name: "First day, 20:00, not started", isFirstDay: true, sessionStarted: false, localHour: 20, expected: true },
  { name: "First day, 21:00, not started", isFirstDay: true, sessionStarted: false, localHour: 21, expected: true },
  { name: "First day, 23:59, not started", isFirstDay: true, sessionStarted: false, localHour: 23, expected: true },
  
  // Before 20:00: hidden
  { name: "First day, 19:59, not started", isFirstDay: true, sessionStarted: false, localHour: 19, expected: false },
  { name: "First day, 12:00, not started", isFirstDay: true, sessionStarted: false, localHour: 12, expected: false },
  { name: "First day, 00:00, not started", isFirstDay: true, sessionStarted: false, localHour: 0, expected: false },
  
  // Not first day: hidden
  { name: "Second day, 20:00, not started", isFirstDay: false, sessionStarted: false, localHour: 20, expected: false },
  { name: "Second day, 23:00, not started", isFirstDay: false, sessionStarted: false, localHour: 23, expected: false },
  
  // Session started: hidden
  { name: "First day, 20:00, session started", isFirstDay: true, sessionStarted: true, localHour: 20, expected: false },
  { name: "First day, 22:00, session started", isFirstDay: true, sessionStarted: true, localHour: 22, expected: false },
  
  // Multiple conditions: all must be true
  { name: "Second day, 19:00, not started", isFirstDay: false, sessionStarted: false, localHour: 19, expected: false },
  { name: "Second day, 20:00, session started", isFirstDay: false, sessionStarted: true, localHour: 20, expected: false },
  { name: "First day, 19:00, session started", isFirstDay: true, sessionStarted: true, localHour: 19, expected: false },
];

console.log("Running table tests...\n");

for (const tc of cases) {
  const result = shouldOfferStartTomorrow({
    isFirstDay: tc.isFirstDay,
    sessionStarted: tc.sessionStarted,
    localHour: tc.localHour,
  });
  
  assert.equal(result, tc.expected, `${tc.name}: expected ${tc.expected}, got ${result}`);
  console.log(`  ✓ ${tc.name}: ${result}`);
}

console.log("\n✅ All shouldOfferStartTomorrow tests passed");
