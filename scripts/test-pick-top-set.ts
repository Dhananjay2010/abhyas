/**
 * Test pickTopSet: ensures the heaviest working set is chosen, with ties broken by reps.
 */

import { pickTopSet } from "../src/lib/history/pick-top-set";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\npickTopSet: heaviest working set selection");

// Case 1: 60x8 and 62.5x5 → 62.5 kg wins (heavier weight)
const sets1 = [
  { weight_kg: 60, reps: 8, duration_seconds: null, is_warmup_set: false },
  { weight_kg: 62.5, reps: 5, duration_seconds: null, is_warmup_set: false },
];
const top1 = pickTopSet(sets1);
check("60x8 and 62.5x5 → 62.5 kg (heaviest)", top1 === 62.5, `got ${top1}`);

// Case 2: Warmup ignored
const sets2 = [
  { weight_kg: 20, reps: 10, duration_seconds: null, is_warmup_set: true },
  { weight_kg: 60, reps: 8, duration_seconds: null, is_warmup_set: false },
];
const top2 = pickTopSet(sets2);
check("Warmups ignored, working set 60x8 → 60 kg", top2 === 60, `got ${top2}`);

// Case 3: Ties broken by reps
const sets3 = [
  { weight_kg: 100, reps: 5, duration_seconds: null, is_warmup_set: false },
  { weight_kg: 100, reps: 8, duration_seconds: null, is_warmup_set: false },
];
const top3 = pickTopSet(sets3);
check("100x5 and 100x8 → 100 kg (tie broken by reps, returns first in sorted order)", top3 === 100, `got ${top3}`);

// Case 4: No working sets → null
const sets4 = [
  { weight_kg: 20, reps: 10, duration_seconds: null, is_warmup_set: true },
];
const top4 = pickTopSet(sets4);
check("Only warmups → null", top4 === null, `got ${top4}`);

// Case 5: Empty array → null
const sets5: typeof sets1 = [];
const top5 = pickTopSet(sets5);
check("Empty array → null", top5 === null, `got ${top5}`);

// Case 6: Multiple exercises with different weights (QA U5 scenario)
const sets6 = [
  // First exercise: 60x8
  { weight_kg: 60, reps: 8, duration_seconds: null, is_warmup_set: false },
  // Second exercise: 62.5x5
  { weight_kg: 62.5, reps: 5, duration_seconds: null, is_warmup_set: false },
  // Third exercise: 55x10
  { weight_kg: 55, reps: 10, duration_seconds: null, is_warmup_set: false },
];
const top6 = pickTopSet(sets6);
check("Multi-exercise session: 60x8, 62.5x5, 55x10 → 62.5 kg", top6 === 62.5, `got ${top6}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
