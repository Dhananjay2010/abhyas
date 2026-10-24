#!/usr/bin/env tsx
/**
 * L4 QA test: Equipment save request sequencing.
 * 
 * Tests that overlapping equipment saves ignore stale responses,
 * so only the latest save's result can roll back or confirm.
 */

import { createRequestSequence } from "../src/app/settings/equipment-logic";

let failures = 0;

console.log("Testing equipment save request sequencing (L4)...\n");

// Test basic sequence generation
const seq1 = createRequestSequence();
const req1 = seq1.next();
const req2 = seq1.next();
const req3 = seq1.next();

if (req1 !== 1) {
  console.error(`❌ First request should be 1, got ${req1}`);
  failures++;
} else {
  console.log(`✓ First request number is 1`);
}

if (req2 !== 2) {
  console.error(`❌ Second request should be 2, got ${req2}`);
  failures++;
} else {
  console.log(`✓ Second request number is 2`);
}

if (req3 !== 3) {
  console.error(`❌ Third request should be 3, got ${req3}`);
  failures++;
} else {
  console.log(`✓ Third request number is 3`);
}

// Test current check
if (!seq1.isCurrent(req3)) {
  console.error(`❌ Latest request should be current`);
  failures++;
} else {
  console.log(`✓ Latest request is current`);
}

if (seq1.isCurrent(req1)) {
  console.error(`❌ Old request 1 should not be current`);
  failures++;
} else {
  console.log(`✓ Old request 1 is not current`);
}

if (seq1.isCurrent(req2)) {
  console.error(`❌ Old request 2 should not be current`);
  failures++;
} else {
  console.log(`✓ Old request 2 is not current`);
}

// Test overlapping save scenario
console.log("\n▶ Testing overlapping save scenario...");
const seq2 = createRequestSequence();

// Request 1 starts
const save1 = seq2.next();
console.log(`  Request 1 starts (seq ${save1})`);

// Request 2 starts (before 1 completes)
const save2 = seq2.next();
console.log(`  Request 2 starts (seq ${save2})`);

// Request 2 completes first
if (seq2.isCurrent(save2)) {
  console.log(`  ✓ Request 2 completes and is current`);
} else {
  console.error(`  ❌ Request 2 should be current`);
  failures++;
}

// Request 1 completes later (should be ignored)
if (!seq2.isCurrent(save1)) {
  console.log(`  ✓ Request 1 result is ignored (stale)`);
} else {
  console.error(`  ❌ Request 1 should not be current`);
  failures++;
}

// Test independent sequences
console.log("\n▶ Testing independent sequences...");
const seqA = createRequestSequence();
const seqB = createRequestSequence();

const a1 = seqA.next();
const b1 = seqB.next();

if (a1 === 1 && b1 === 1) {
  console.log(`  ✓ Independent sequences start at 1`);
} else {
  console.error(`  ❌ Independent sequences should both start at 1`);
  failures++;
}

const a2 = seqA.next();
if (seqA.isCurrent(a2) && !seqA.isCurrent(a1)) {
  console.log(`  ✓ Sequence A tracks its own current request`);
} else {
  console.error(`  ❌ Sequence A should track independently`);
  failures++;
}

if (seqB.isCurrent(b1)) {
  console.log(`  ✓ Sequence B is unaffected by sequence A`);
} else {
  console.error(`  ❌ Sequence B should be independent`);
  failures++;
}

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
