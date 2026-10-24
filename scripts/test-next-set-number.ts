/**
 * Tests for nextSetNumberFor() calculation with pending sets
 */

import { nextSetNumberFor } from "../src/lib/session/next-set-number";

console.log("\n--- nextSetNumberFor calculation tests ---\n");

let failed = false;

// Test 1: No sets done, no pending
const test1 = nextSetNumberFor(0, 0);
if (test1 !== 1) {
  console.error(`❌ Expected 1, got ${test1}`);
  failed = true;
} else {
  console.log("✓ No sets done, no pending → set number 1");
}

// Test 2: 2 sets done, no pending
const test2 = nextSetNumberFor(2, 0);
if (test2 !== 3) {
  console.error(`❌ Expected 3, got ${test2}`);
  failed = true;
} else {
  console.log("✓ 2 sets done, no pending → set number 3");
}

// Test 3: 2 sets done, 1 pending
const test3 = nextSetNumberFor(2, 1);
if (test3 !== 4) {
  console.error(`❌ Expected 4, got ${test3}`);
  failed = true;
} else {
  console.log("✓ 2 sets done, 1 pending → set number 4");
}

// Test 4: 0 sets done, 2 pending (logged during session expiry)
const test4 = nextSetNumberFor(0, 2);
if (test4 !== 3) {
  console.error(`❌ Expected 3, got ${test4}`);
  failed = true;
} else {
  console.log("✓ 0 sets done, 2 pending → set number 3");
}

// Test 5: Edge case - many pending
const test5 = nextSetNumberFor(5, 3);
if (test5 !== 9) {
  console.error(`❌ Expected 9, got ${test5}`);
  failed = true;
} else {
  console.log("✓ 5 sets done, 3 pending → set number 9");
}

if (failed) {
  console.log("\n❌ nextSetNumberFor tests FAILED\n");
  process.exit(1);
} else {
  console.log("\n✅ All nextSetNumberFor tests passed\n");
}

