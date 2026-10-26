/**
 * E1RM consistency test: History and session-summary must compute e1RM the same way.
 *
 * This ensures that a PB in the session summary (nextBest) is also a PB in History
 * and the values match.
 *
 *   npx tsx scripts/test-e1rm-consistency.ts
 */
import { nextBest, estimateOneRepMax, roundToStoragePrecision, type LoggedSet, type ExerciseMeta } from "../src/lib/program/progression";
import { computeE1rm } from "../src/lib/program/progression";
import { detectPersonalRecords, type SetData } from "../src/lib/exercise-history/calculations";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Helper to create sets for History
const historySet = (reps: number, weight: number): SetData => ({
  reps,
  weight_kg: weight,
  duration_seconds: null,
});

// Helper to create sets for nextBest
const sessionSet = (reps: number, weight: number): LoggedSet => ({
  reps,
  weightKg: weight,
});

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n1. Basic e1RM calculation match");
{
  // 4 sets of 10 @ 40kg
  const historySets = [historySet(10, 40), historySet(10, 40), historySet(10, 40), historySet(10, 40)];
  const sessionSets = [sessionSet(10, 40), sessionSet(10, 40), sessionSet(10, 40), sessionSet(10, 40)];
  
  const historyPRs = detectPersonalRecords(historySets, "reps");
  const historyE1rm = historyPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult = nextBest(sessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rm = nextBestResult.bestE1rm;
  
  const expected = roundToStoragePrecision(estimateOneRepMax(40, 10));
  check("History e1RM matches expected", historyE1rm === expected, `history=${historyE1rm}, expected=${expected}`);
  check("Session e1RM matches expected", sessionE1rm === expected, `session=${sessionE1rm}, expected=${expected}`);
  check("History e1RM === Session e1RM", historyE1rm === sessionE1rm, `history=${historyE1rm}, session=${sessionE1rm}`);
}

console.log("\n2. Single rep (reps=1) case");
{
  // 1×1@100kg - should return 100 (not w×1.0333)
  const historySets = [historySet(1, 100)];
  const sessionSets = [sessionSet(1, 100)];
  
  const historyPRs = detectPersonalRecords(historySets, "reps");
  const historyE1rm = historyPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult = nextBest(sessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rmValue = nextBestResult.bestE1rm;
  
  const expected = 100.00; // Hardcoded: reps=1 returns the weight itself
  check("Reps=1: History e1RM matches expected (100.00)", historyE1rm === expected, `history=${historyE1rm}, expected=${expected}`);
  check("Reps=1: Session e1RM matches expected (100.00)", sessionE1rmValue === expected, `session=${sessionE1rmValue}, expected=${expected}`);
  check("Reps=1: History e1RM === Session e1RM", historyE1rm === sessionE1rmValue, `history=${historyE1rm}, session=${sessionE1rmValue}`);
}

console.log("\n3. Multiple sets with different e1RMs");
{
  // 3 sets of 5 @ 62.5kg
  const historySets = [historySet(5, 62.5), historySet(5, 62.5), historySet(5, 62.5)];
  const sessionSets = [sessionSet(5, 62.5), sessionSet(5, 62.5), sessionSet(5, 62.5)];
  
  const historyPRs = detectPersonalRecords(historySets, "reps");
  const historyE1rm = historyPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult = nextBest(sessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rmValue = nextBestResult.bestE1rm;
  
  const expected = roundToStoragePrecision(estimateOneRepMax(62.5, 5));
  check("Multiple sets: History e1RM matches expected", historyE1rm === expected, `history=${historyE1rm}, expected=${expected}`);
  check("Multiple sets: Session e1RM matches expected", sessionE1rmValue === expected, `session=${sessionE1rmValue}, expected=${expected}`);
  check("Multiple sets: History e1RM === Session e1RM", historyE1rm === sessionE1rmValue, `history=${historyE1rm}, session=${sessionE1rmValue}`);
}

console.log("\n4. lb-converted weight (45.36 kg)");
{
  // Sets at 45.36kg (100 lb)
  const historySets = [historySet(8, 45.36), historySet(8, 45.36), historySet(7, 45.36)];
  const sessionSets = [sessionSet(8, 45.36), sessionSet(8, 45.36), sessionSet(7, 45.36)];
  
  const historyPRs = detectPersonalRecords(historySets, "reps");
  const historyE1rm = historyPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult = nextBest(sessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rmValue = nextBestResult.bestE1rm;
  
  const expected = roundToStoragePrecision(estimateOneRepMax(45.36, 8));
  check("lb weight: History e1RM matches expected", historyE1rm === expected, `history=${historyE1rm}, expected=${expected}`);
  check("lb weight: Session e1RM matches expected", sessionE1rmValue === expected, `session=${sessionE1rmValue}, expected=${expected}`);
  check("lb weight: History e1RM === Session e1RM", historyE1rm === sessionE1rmValue, `history=${historyE1rm}, session=${sessionE1rmValue}`);
}

console.log("\n5. Identical repeat (m137-08): no PR in either");
{
  // First session: 3×5@62.5
  const firstHistorySets = [historySet(5, 62.5), historySet(5, 62.5), historySet(5, 62.5)];
  const firstSessionSets = [sessionSet(5, 62.5), sessionSet(5, 62.5), sessionSet(5, 62.5)];
  
  const firstHistoryPRs = detectPersonalRecords(firstHistorySets, "reps");
  
  const firstNextBest = nextBest(firstSessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  
  // Second session: identical 3×5@62.5
  const secondHistorySets = [...firstHistorySets, historySet(5, 62.5), historySet(5, 62.5), historySet(5, 62.5)];
  const secondSessionSets = [sessionSet(5, 62.5), sessionSet(5, 62.5), sessionSet(5, 62.5)];
  
  const secondHistoryPRs = detectPersonalRecords(secondHistorySets, "reps");
  const secondNextBest = nextBest(secondSessionSets, firstNextBest, meta);
  
  check("Identical repeat: no weight PB in session", secondNextBest.personalBest === null || secondNextBest.personalBest.kind !== "weight");
  check("Identical repeat: no e1RM PB in session", secondNextBest.personalBest === null || secondNextBest.personalBest.kind !== "e1rm");
  
  // History PRs should not change between first and second (strict > means equal values don't beat)
  const firstHeaviest = firstHistoryPRs.find(pr => pr.type === "heaviest_weight")?.value ?? null;
  const secondHeaviest = secondHistoryPRs.find(pr => pr.type === "heaviest_weight")?.value ?? null;
  const firstBestE1rm = firstHistoryPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  const secondBestE1rm = secondHistoryPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  check("Identical repeat: History heaviest unchanged", firstHeaviest === secondHeaviest, `first=${firstHeaviest}, second=${secondHeaviest}`);
  check("Identical repeat: History best e1RM unchanged", firstBestE1rm === secondBestE1rm, `first=${firstBestE1rm}, second=${secondBestE1rm}`);
  
  // Explicit >= test: check that equal values don't beat (would fail if > becomes >=)
  const isWeightImprovement = (secondHeaviest ?? 0) > (firstHeaviest ?? 0);
  const isE1rmImprovement = (secondBestE1rm ?? 0) > (firstBestE1rm ?? 0);
  check("Identical repeat: weight is NOT an improvement (> not >=)", !isWeightImprovement, `second=${secondHeaviest}, first=${firstHeaviest}`);
  check("Identical repeat: e1RM is NOT an improvement (> not >=)", !isE1rmImprovement, `second=${secondBestE1rm}, first=${firstBestE1rm}`);
}

console.log("\n6. +0.01 kg e1RM improvement: PR in both");
{
  // First session: 3×5@62.5kg → e1RM = 72.92
  const firstHistorySets = [historySet(5, 62.5), historySet(5, 62.5), historySet(5, 62.5)];
  const firstSessionSets = [sessionSet(5, 62.5), sessionSet(5, 62.5), sessionSet(5, 62.5)];
  
  const firstNextBest = nextBest(firstSessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const firstSessionE1rm = firstNextBest.bestE1rm;
  
  // Second session: 1×6@62.5kg → e1RM = 75.00 (improvement)
  const secondHistorySets = [...firstHistorySets, historySet(6, 62.5)];
  const secondSessionSets = [sessionSet(6, 62.5)];
  
  const secondHistoryPRs = detectPersonalRecords(secondHistorySets, "reps");
  const secondHistoryE1rm = secondHistoryPRs.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const secondNextBest = nextBest(secondSessionSets, firstNextBest, meta);
  const secondSessionE1rm = secondNextBest.bestE1rm;
  
  check("+0.01 improvement: Session shows e1RM PB", secondNextBest.personalBest?.kind === "e1rm", `got ${secondNextBest.personalBest?.kind}`);
  check("+0.01 improvement: History e1RM increased", (secondHistoryE1rm ?? 0) > (firstSessionE1rm ?? 0), `history=${secondHistoryE1rm}, prev=${firstSessionE1rm}`);
  check("+0.01 improvement: e1RMs match", secondHistoryE1rm === secondSessionE1rm, `history=${secondHistoryE1rm}, session=${secondSessionE1rm}`);
}

console.log("\n7. Exact rational arithmetic: JS integer-hundredths matches SQL ROUND(x,2)");
{
  // HIGH-1: These cases expose float truncation bugs in the old formula
  // Expected values computed from exact rational: weight * (30 + min(reps,12)) / 30
  // Then rounded with SQL ROUND(x,2) = half away from zero
  
  // 44.25×7: 44.25 * 37 / 30 = 54.575 → 54.58
  const case1 = estimateOneRepMax(44.25, 7);
  check("44.25×7 = 54.58 (exact rational)", case1 === 54.58, `got ${case1}`);
  
  // 21.75×7: 21.75 * 37 / 30 = 26.825 → 26.83
  const case2 = estimateOneRepMax(21.75, 7);
  check("21.75×7 = 26.83 (exact rational)", case2 === 26.83, `got ${case2}`);
  
  // 494.65×9: 494.65 * 39 / 30 = 643.045 → 643.05
  const case3 = estimateOneRepMax(494.65, 9);
  check("494.65×9 = 643.05 (exact rational)", case3 === 643.05, `got ${case3}`);
  
  // Test rounding up (.5 → next higher)
  // 1.15×3: 1.15 * 33 / 30 = 1.265 → 1.27
  const case4 = estimateOneRepMax(1.15, 3);
  check("1.15×3 = 1.27 (rounds .265 up)", case4 === 1.27, `got ${case4}`);
  
  // 17.15×3: 17.15 * 33 / 30 = 18.865 → 18.87
  const case5 = estimateOneRepMax(17.15, 3);
  check("17.15×3 = 18.87 (rounds .865 up)", case5 === 18.87, `got ${case5}`);
  
  // 33.05×3: 33.05 * 33 / 30 = 36.365 → 36.36
  const case6 = estimateOneRepMax(33.05, 3);
  check("33.05×3 = 36.36 (rounds .365 up)", case6 === 36.36, `got ${case6}`);
  
  // 11.25×7: 11.25 * 37 / 30 = 13.875 → 13.88
  const case7 = estimateOneRepMax(11.25, 7);
  check("11.25×7 = 13.88 (rounds .875 up)", case7 === 13.88, `got ${case7}`);
  
  // Session flow must also use exact values
  const session1 = nextBest([sessionSet(7, 44.25)], { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  check("Session: 44.25×7 = 54.58", session1.bestE1rm === 54.58, `got ${session1.bestE1rm}`);
  
  const session2 = nextBest([sessionSet(7, 21.75)], { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  check("Session: 21.75×7 = 26.83", session2.bestE1rm === 26.83, `got ${session2.bestE1rm}`);
  
  const session3 = nextBest([sessionSet(9, 494.65)], { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  check("Session: 494.65×9 = 643.05", session3.bestE1rm === 643.05, `got ${session3.bestE1rm}`);
  
  // History must also use exact values
  const history1 = detectPersonalRecords([historySet(7, 44.25)], "reps");
  const history1E1rm = history1.find(pr => pr.type === "best_e1rm")?.value ?? null;
  check("History: 44.25×7 = 54.58", history1E1rm === 54.58, `got ${history1E1rm}`);
  
  const history2 = detectPersonalRecords([historySet(7, 21.75)], "reps");
  const history2E1rm = history2.find(pr => pr.type === "best_e1rm")?.value ?? null;
  check("History: 21.75×7 = 26.83", history2E1rm === 26.83, `got ${history2E1rm}`);
  
  const history3 = detectPersonalRecords([historySet(9, 494.65)], "reps");
  const history3E1rm = history3.find(pr => pr.type === "best_e1rm")?.value ?? null;
  check("History: 494.65×9 = 643.05", history3E1rm === 643.05, `got ${history3E1rm}`);
}

console.log("\n8. Weight rounding edge case: 40.006×10 → 40.01 is PB vs 40.00");
{
  // First session: 3×10@40.00kg
  const firstHistorySets = [historySet(10, 40.00), historySet(10, 40.00), historySet(10, 40.00)];
  const firstSessionSets = [sessionSet(10, 40.00), sessionSet(10, 40.00), sessionSet(10, 40.00)];
  
  const firstNextBest = nextBest(firstSessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const firstBestWeight = firstNextBest.bestWeightKg;
  
  // Second session: 3×10@40.006kg (rounds to 40.01kg)
  const secondHistorySets = [...firstHistorySets, historySet(10, 40.006)];
  const secondSessionSets = [sessionSet(10, 40.006)];
  
  const secondHistoryPRs = detectPersonalRecords(secondHistorySets, "reps");
  const secondHistoryHeaviest = secondHistoryPRs.find(pr => pr.type === "heaviest_weight")?.value ?? null;
  
  const secondNextBest = nextBest(secondSessionSets, firstNextBest, meta);
  const secondBestWeight = secondNextBest.bestWeightKg;
  
  const roundedWeight = roundToStoragePrecision(40.006);
  check("Weight rounding: 40.006 rounds to 40.01", roundedWeight === 40.01, `got ${roundedWeight}`);
  check("Weight rounding: Session shows weight PB", secondNextBest.personalBest?.kind === "weight", `got ${secondNextBest.personalBest?.kind}`);
  check("Weight rounding: History heaviest increased", (secondHistoryHeaviest ?? 0) > (firstBestWeight ?? 0), `history=${secondHistoryHeaviest}, prev=${firstBestWeight}`);
  check("Weight rounding: weights match", secondHistoryHeaviest === secondBestWeight, `history=${secondHistoryHeaviest}, session=${secondBestWeight}`);
  
  // e1RM for 40.006×10: rounds weight first to 40.01, then computes: 40.01 * 40 / 30 = 53.346... → 53.35
  const expectedE1rm = estimateOneRepMax(40.01, 10);
  check("40.006×10: e1RM computed from rounded weight (40.01×10)", secondNextBest.bestE1rm === expectedE1rm, `got ${secondNextBest.bestE1rm}, expected ${expectedE1rm}`);
}

console.log("\n9. 12-rep cap: high-rep sets (15, 20, 30 reps) capped at 12");
{
  // Test that reps > 12 are capped at 12 in the formula
  // 40kg × 15 reps = 40 × (30 + min(15,12)) / 30 = 40 × 42 / 30 = 56.00 (capped)
  const historySets15 = [historySet(15, 40)];
  const sessionSets15 = [sessionSet(15, 40)];
  
  const historyPRs15 = detectPersonalRecords(historySets15, "reps");
  const historyE1rm15 = historyPRs15.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult15 = nextBest(sessionSets15, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rm15 = nextBestResult15.bestE1rm;
  
  check("15 reps: History e1RM = 56.00 (capped at 12)", historyE1rm15 === 56.00, `history=${historyE1rm15}`);
  check("15 reps: Session e1RM = 56.00 (capped at 12)", sessionE1rm15 === 56.00, `session=${sessionE1rm15}`);
  check("15 reps: History === Session", historyE1rm15 === sessionE1rm15);
  
  // 30kg × 20 reps = 30 × (30 + min(20,12)) / 30 = 30 × 42 / 30 = 42.00 (capped)
  const historySets20 = [historySet(20, 30)];
  const sessionSets20 = [sessionSet(20, 30)];
  
  const historyPRs20 = detectPersonalRecords(historySets20, "reps");
  const historyE1rm20 = historyPRs20.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult20 = nextBest(sessionSets20, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rm20 = nextBestResult20.bestE1rm;
  
  check("20 reps: History e1RM = 42.00 (capped at 12)", historyE1rm20 === 42.00, `history=${historyE1rm20}`);
  check("20 reps: Session e1RM = 42.00 (capped at 12)", sessionE1rm20 === 42.00, `session=${sessionE1rm20}`);
  check("20 reps: History === Session", historyE1rm20 === sessionE1rm20);
  
  // 20kg × 30 reps = 20 × (30 + min(30,12)) / 30 = 20 × 42 / 30 = 28.00 (capped)
  const historySets30 = [historySet(30, 20)];
  const sessionSets30 = [sessionSet(30, 20)];
  
  const historyPRs30 = detectPersonalRecords(historySets30, "reps");
  const historyE1rm30 = historyPRs30.find(pr => pr.type === "best_e1rm")?.value ?? null;
  
  const nextBestResult30 = nextBest(sessionSets30, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
  const sessionE1rm30 = nextBestResult30.bestE1rm;
  
  check("30 reps: History e1RM = 28.00 (capped at 12)", historyE1rm30 === 28.00, `history=${historyE1rm30}`);
  check("30 reps: Session e1RM = 28.00 (capped at 12)", sessionE1rm30 === 28.00, `session=${sessionE1rm30}`);
  check("30 reps: History === Session", historyE1rm30 === sessionE1rm30);
}

console.log("\n10. computeE1rm helper matches nextBest calculation");
{
  // Verify computeE1rm() helper produces same result as nextBest
  const testCases: Array<[number, number]> = [
    [40, 10],
    [100, 1],
    [62.5, 5],
    [45.36, 8],
    [80, 12],
    [40, 15], // Above cap
    [30, 20], // Above cap
    [20, 30], // Above cap
  ];
  
  for (const [weight, reps] of testCases) {
    const helperResult = computeE1rm(weight, reps);
    const nextBestResult = nextBest([sessionSet(reps, weight)], { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);
    
    check(`computeE1rm(${weight}, ${reps}) === nextBest e1RM`, 
      helperResult === nextBestResult.bestE1rm, 
      `helper=${helperResult}, nextBest=${nextBestResult.bestE1rm}`);
  }
}

console.log("\n11. detectPersonalRecords picks the best e1RM at 0.01 kg resolution (QA MED-1)");
{
  // 60×10 = 80.00 and 60.02×10 = 80.0266… → 80.03. These differ by 0.03 kg, so they
  // are EQUAL at 0.1 kg (80.0 vs 80.0) but distinct at 2 dp. The heavier-e1RM set is
  // logged SECOND so a 0.1 kg comparison (strict >) would keep the first set (80.00).
  const historySets = [historySet(10, 60), historySet(10, 60.02)];
  const sessionSets = [sessionSet(10, 60), sessionSet(10, 60.02)];

  const bestRecord = detectPersonalRecords(historySets, "reps").find(pr => pr.type === "best_e1rm");
  const nextBestResult = nextBest(sessionSets, { bestWeightKg: null, bestReps: null, bestE1rm: null }, meta);

  check("0.01 resolution: History best e1RM = 80.03 (hardcoded)", bestRecord?.value === 80.03, `history=${bestRecord?.value}`);
  check("0.01 resolution: History best e1RM set is 60.02×10", bestRecord?.set.weight_kg === 60.02, `set=${bestRecord?.set.weight_kg}×${bestRecord?.set.reps}`);
  check("0.01 resolution: Session e1RM = 80.03 (hardcoded)", nextBestResult.bestE1rm === 80.03, `session=${nextBestResult.bestE1rm}`);
  check("0.01 resolution: History === Session", bestRecord?.value === nextBestResult.bestE1rm, `history=${bestRecord?.value}, session=${nextBestResult.bestE1rm}`);

  // Reverse order must give the same answer (selection is by value, not position)
  const reversed = detectPersonalRecords([historySet(10, 60.02), historySet(10, 60)], "reps").find(pr => pr.type === "best_e1rm");
  check("0.01 resolution: reversed order also 80.03", reversed?.value === 80.03, `history=${reversed?.value}`);
}

if (failures === 0) {
  console.log("\n✓ All e1RM consistency tests passed");
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed`);
  process.exit(1);
}
