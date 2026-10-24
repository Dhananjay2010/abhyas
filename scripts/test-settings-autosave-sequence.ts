#!/usr/bin/env tsx
/**
 * Test request sequencing for settings autosave.
 * 
 * Tests that overlapping saves ignore stale responses,
 * so only the latest save's result determines the final state.
 */

import { createRequestSequence } from "../src/app/settings/request-sequence";

let failures = 0;

console.log("Testing settings autosave request sequencing...\n");

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

// Test overlapping save scenario: 4,5,3,4 with responses out of order
console.log("\n▶ Testing overlapping save scenario (4→5→3→4)...");
const seq2 = createRequestSequence();

const save4a = seq2.next();
console.log(`  Request for 4 starts (seq ${save4a})`);

const save5 = seq2.next();
console.log(`  Request for 5 starts (seq ${save5})`);

const save3 = seq2.next();
console.log(`  Request for 3 starts (seq ${save3})`);

const save4b = seq2.next();
console.log(`  Request for 4 (final) starts (seq ${save4b})`);

// Responses arrive out of order: 5, 4a, 3, 4b
console.log("\n  Responses arrive out of order:");

// At the time request 4b was made, it became current
if (seq2.isCurrent(save4b)) {
  console.log(`  ✓ After all requests, only the final request (4) is current`);
} else {
  console.error(`  ❌ After all requests, the final request should be current`);
  failures++;
}

// Response for 5 arrives first (should be ignored because 4b is already current)
if (!seq2.isCurrent(save5)) {
  console.log(`  ✓ Response for 5 is stale (newer request 4 already made)`);
} else {
  console.error(`  ❌ Response for 5 should be stale`);
  failures++;
}

// Response for 4a arrives second (should be ignored)
if (!seq2.isCurrent(save4a)) {
  console.log(`  ✓ Response for 4 (first) is stale and ignored`);
} else {
  console.error(`  ❌ Response for 4 (first) should not be current`);
  failures++;
}

// Response for 3 arrives third (should be ignored)
if (!seq2.isCurrent(save3)) {
  console.log(`  ✓ Response for 3 is stale (newer request 4 already made)`);
} else {
  console.error(`  ❌ Response for 3 should be stale`);
  failures++;
}

// Response for 4b arrives last (should be current)
if (seq2.isCurrent(save4b)) {
  console.log(`  ✓ Response for 4 (final) is still current`);
} else {
  console.error(`  ❌ Response for 4 (final) should be current`);
  failures++;
}

// Final check: only the last request should be current
if (!seq2.isCurrent(save4a) && !seq2.isCurrent(save5) && !seq2.isCurrent(save3) && seq2.isCurrent(save4b)) {
  console.log(`  ✓ Only the final request (4) is current`);
} else {
  console.error(`  ❌ Only the final request should be current`);
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
