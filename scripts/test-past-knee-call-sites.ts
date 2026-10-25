/**
 * Test: MEDIUM-1 call-site verification for past-knee integration.
 * 
 * Verifies that pastKneeInjury is correctly passed through the real call sites:
 * - swapAlternatives action builds an input with pastKneeInjury
 * - generateNewPlan (persist.ts) builds an input with pastKneeInjury  
 * - rolloverPlan (rollover.ts) builds an input with pastKneeInjury
 * - score() function in generate.ts uses kneeFriendlyBonus for main picks
 * 
 * npm run test:past-knee-call-sites
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\nMEDIUM-1: Call-site verification");

// Check 1: actions.ts swap path includes pastKneeInjury in input
const actionsSource = readFileSync(__dirname + "/../src/app/session/actions.ts", "utf8");
const actionsHasPastKneeInInput = actionsSource.includes("pastKneeInjury,") && 
  actionsSource.includes("const pastKneeInjury = (injuriesRes.data ?? [])");
const actionsPassesToRankAlternatives = actionsSource.includes("pastKneeInjury: input.pastKneeInjury,");
const actionsPassesToScore = actionsSource.includes("score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0)");

check(
  "actions.ts: pastKneeInjury derived from injuries",
  actionsHasPastKneeInInput,
  actionsHasPastKneeInInput ? "" : "missing pastKneeInjury derivation"
);
check(
  "actions.ts: pastKneeInjury passed to rankAlternatives",
  actionsPassesToRankAlternatives,
  actionsPassesToRankAlternatives ? "" : "not passed to rankAlternatives context"
);
check(
  "actions.ts: pastKneeInjury passed to score function",
  actionsPassesToScore,
  actionsPassesToScore ? "" : "not passed to score in scoreFn"
);

// Check 2: persist.ts includes pastKneeInjury in GeneratorInput
const persistSource = readFileSync(__dirname + "/../src/lib/program/persist.ts", "utf8");
const persistHasPastKnee = persistSource.includes("pastKneeInjury: (injuriesRes.data ?? [])") &&
  persistSource.includes('.some((i) => i.severity === "past" && i.body_region === "knee")');

check(
  "persist.ts: pastKneeInjury in GeneratorInput",
  persistHasPastKnee,
  persistHasPastKnee ? "" : "missing pastKneeInjury in input"
);

// Check 3: rollover.ts includes pastKneeInjury in GeneratorInput
const rolloverSource = readFileSync(__dirname + "/../src/lib/program/rollover.ts", "utf8");
const rolloverHasPastKnee = rolloverSource.includes("pastKneeInjury: (injuriesRes.data ?? [])") &&
  rolloverSource.includes('.some((i) => i.severity === "past" && i.body_region === "knee")');

check(
  "rollover.ts: pastKneeInjury in GeneratorInput",
  rolloverHasPastKnee,
  rolloverHasPastKnee ? "" : "missing pastKneeInjury in input"
);

// Check 4: generate.ts score function uses kneeFriendlyBonus
const generateSource = readFileSync(__dirname + "/../src/lib/program/generate.ts", "utf8");
const generateImportsKneeFriendly = generateSource.includes('import { isExcludedForPastKnee, kneeFriendlyBonus }');
const generateCallsKneeFriendly = generateSource.includes('s += kneeFriendlyBonus(ex, slotIndex);');

check(
  "generate.ts: imports kneeFriendlyBonus",
  generateImportsKneeFriendly,
  generateImportsKneeFriendly ? "" : "missing kneeFriendlyBonus import"
);
check(
  "generate.ts: calls kneeFriendlyBonus in score",
  generateCallsKneeFriendly,
  generateCallsKneeFriendly ? "" : "kneeFriendlyBonus not called"
);

// Check 5: Verify kneeFriendlyBonus function exists and has expected logic
const pastKneeSource = readFileSync(__dirname + "/../src/lib/program/past-knee.ts", "utf8");
const kneeFriendlyBonusExists = pastKneeSource.includes("export function kneeFriendlyBonus(");
const kneeFriendlyBonusHasPrimaryBonus = pastKneeSource.includes("return 10;") || 
  pastKneeSource.includes("10  // Primary");
const kneeFriendlyBonusHasWallSitPenalty = pastKneeSource.includes("return -100;") ||
  pastKneeSource.includes("-100  // wall-sit");

check(
  "past-knee.ts: kneeFriendlyBonus function exists",
  kneeFriendlyBonusExists,
  kneeFriendlyBonusExists ? "" : "function not found"
);
check(
  "past-knee.ts: kneeFriendlyBonus awards +10 for primaries",
  kneeFriendlyBonusHasPrimaryBonus,
  kneeFriendlyBonusHasPrimaryBonus ? "" : "missing +10 primary bonus"
);
check(
  "past-knee.ts: kneeFriendlyBonus penalizes wall-sit",
  kneeFriendlyBonusHasWallSitPenalty,
  kneeFriendlyBonusHasWallSitPenalty ? "" : "missing -100 wall-sit penalty"
);

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
