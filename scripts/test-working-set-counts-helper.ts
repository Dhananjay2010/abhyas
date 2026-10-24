#!/usr/bin/env tsx
/**
 * Test: Working set counts helper
 *
 * Tests workingSetCountsBySession helper that groups session_exercises by session_id
 * and counts working sets, proving break a2 (warm-ups counted as working) fails.
 */

import { workingSetCountsBySession } from "../src/lib/today/working-set-counts";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    passedTests++;
    console.log(`✓ ${message}`);
  }
}

console.log("\n=== Test 1: Empty input ===\n");

const counts1 = workingSetCountsBySession([]);
assert(counts1.size === 0, "Empty input → empty map");

console.log("\n=== Test 2: Single session with working sets only ===\n");

const counts2 = workingSetCountsBySession([
  {
    session_id: "session-1",
    session_sets: [
      { is_warmup_set: false, reps: 10, duration_seconds: null },
      { is_warmup_set: false, reps: 8, duration_seconds: null },
      { is_warmup_set: false, reps: 6, duration_seconds: null },
    ],
  },
]);

assert(counts2.get("session-1") === 3, "3 working sets counted");

console.log("\n=== Test 3: Single session with warm-ups and working sets ===\n");

const counts3 = workingSetCountsBySession([
  {
    session_id: "session-2",
    session_sets: [
      { is_warmup_set: true, reps: 10, duration_seconds: null },
      { is_warmup_set: true, reps: 10, duration_seconds: null },
      { is_warmup_set: false, reps: 10, duration_seconds: null },
      { is_warmup_set: false, reps: 8, duration_seconds: null },
    ],
  },
]);

assert(counts3.get("session-2") === 2, "2 working sets (warm-ups excluded)");

console.log("\n=== Test 4: Multiple sessions ===\n");

const counts4 = workingSetCountsBySession([
  {
    session_id: "session-A",
    session_sets: [
      { is_warmup_set: false, reps: 10, duration_seconds: null },
      { is_warmup_set: false, reps: 8, duration_seconds: null },
    ],
  },
  {
    session_id: "session-B",
    session_sets: [
      { is_warmup_set: true, reps: 10, duration_seconds: null },
      { is_warmup_set: false, reps: 10, duration_seconds: null },
    ],
  },
  {
    session_id: "session-A",
    session_sets: [
      { is_warmup_set: false, reps: 6, duration_seconds: null },
    ],
  },
]);

assert(counts4.get("session-A") === 3, "session-A has 3 working sets");
assert(counts4.get("session-B") === 1, "session-B has 1 working set");

console.log("\n=== Test 5: Session with only warm-ups ===\n");

const counts5 = workingSetCountsBySession([
  {
    session_id: "session-warmup-only",
    session_sets: [
      { is_warmup_set: true, reps: 10, duration_seconds: null },
      { is_warmup_set: true, reps: 10, duration_seconds: null },
    ],
  },
]);

assert(counts5.get("session-warmup-only") === 0, "0 working sets when all are warm-ups");

console.log("\n=== Test 6: Session with duration-based sets ===\n");

const counts6 = workingSetCountsBySession([
  {
    session_id: "session-duration",
    session_sets: [
      { is_warmup_set: false, reps: null, duration_seconds: 60 },
      { is_warmup_set: false, reps: null, duration_seconds: 45 },
    ],
  },
]);

assert(counts6.get("session-duration") === 2, "Duration-based sets count as working");

console.log(`\n✅ All ${passedTests}/${totalTests} working set counts helper tests passed!\n`);
