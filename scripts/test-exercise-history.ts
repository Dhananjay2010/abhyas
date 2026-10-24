/**
 * Tests for exercise history calculation functions.
 *
 *   npx tsx scripts/test-exercise-history.ts
 */
import {
  calculateEpley1RM,
  calculateSetVolume,
  findTopSet,
  detectPersonalRecords,
  type SetData,
  type PersonalRecord,
} from "../src/lib/exercise-history/calculations";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Helper to create sets
const set = (reps: number | null, weight: number | null, duration?: number | null): SetData => ({
  reps,
  weight_kg: weight,
  duration_seconds: duration ?? null,
});

console.log("\n1. Epley 1RM calculation");
{
  check("100kg × 1 rep = 100kg", calculateEpley1RM(1, 100) === 100);
  check("100kg × 8 reps ≈ 126.67kg", 
    Math.abs((calculateEpley1RM(8, 100) ?? 0) - 126.67) < 0.01,
    `got ${calculateEpley1RM(8, 100)}`
  );
  check("60kg × 12 reps = 84kg",
    calculateEpley1RM(12, 60) === 84,
    `got ${calculateEpley1RM(12, 60)}`
  );
  check("40kg × 20 reps = 56kg (reps capped at 12)",
    calculateEpley1RM(20, 40) === 56,
    `got ${calculateEpley1RM(20, 40)}`
  );
  check("bodyweight (0kg) returns null", calculateEpley1RM(10, 0) === null);
  check("null weight returns null", calculateEpley1RM(10, null) === null);
  check("null reps returns null", calculateEpley1RM(null, 100) === null);
  check("0 reps returns null", calculateEpley1RM(0, 100) === null);
}

console.log("\n2. Set volume calculation");
{
  check("10 reps × 50kg = 500kg", calculateSetVolume(set(10, 50)) === 500);
  check("0 weight = 0 volume", calculateSetVolume(set(10, 0)) === 0);
  check("null weight = 0 volume", calculateSetVolume(set(10, null)) === 0);
  check("null reps = 0 volume", calculateSetVolume(set(null, 50)) === 0);
  check("time-based ignores duration", calculateSetVolume(set(null, null, 60)) === 0);
}

console.log("\n3. Top set detection - weighted exercises");
{
  const sets: SetData[] = [
    set(8, 100),   // e1rm = 126.67
    set(10, 90),   // e1rm = 120
    set(12, 80),   // e1rm = 112
    set(6, 105),   // e1rm = 126
  ];
  
  const top = findTopSet(sets, "reps");
  check("picks highest e1rm", top?.reps === 8 && top?.weight_kg === 100,
    `got ${top?.reps}×${top?.weight_kg}kg`
  );
}

console.log("\n4. Top set detection - bodyweight exercises");
{
  const sets: SetData[] = [
    set(15, 0),
    set(20, 0),
    set(12, 0),
    set(18, 0),
  ];
  
  const top = findTopSet(sets, "reps");
  check("picks most reps for bodyweight", top?.reps === 20,
    `got ${top?.reps} reps`
  );
}

{
  const sets: SetData[] = [
    set(15, null),
    set(20, null),
    set(12, null),
  ];
  
  const top = findTopSet(sets, "reps");
  check("null weight treated as bodyweight", top?.reps === 20);
}

console.log("\n5. Top set detection - time-based exercises");
{
  const sets: SetData[] = [
    set(null, null, 45),
    set(null, null, 60),
    set(null, null, 30),
    set(null, null, 55),
  ];
  
  const top = findTopSet(sets, "seconds");
  check("picks longest duration", top?.duration_seconds === 60,
    `got ${top?.duration_seconds}s`
  );
}

console.log("\n6. Empty sets handling");
{
  check("empty array returns null", findTopSet([], "reps") === null);
  check("detectPersonalRecords on empty returns []", detectPersonalRecords([], "reps").length === 0);
}

console.log("\n7. PR detection - weighted exercise");
{
  const history: SetData[] = [
    // Week 1: starting out
    set(8, 60),   // e1rm = 76
    set(8, 60),
    set(7, 60),
    // Week 2: progression
    set(8, 62.5), // e1rm = 79.17
    set(8, 62.5),
    set(9, 62.5), // e1rm = 81.25 - best e1rm so far
    // Week 3: more reps at same weight
    set(10, 62.5), // e1rm = 83.33 - new best e1rm, most reps
    set(10, 62.5),
    // Week 4: heavier weight
    set(6, 70),    // e1rm = 84 - new best e1rm, heaviest weight
    set(6, 70),
  ];
  
  const prs = detectPersonalRecords(history, "reps");
  
  check("detects 3 PR types", prs.length === 3, `found ${prs.length}`);
  check("heaviest_weight PR", 
    prs.some(pr => pr.type === "heaviest_weight" && pr.value === 70),
    `${prs.find(pr => pr.type === "heaviest_weight")?.value}kg`
  );
  check("best_e1rm PR",
    prs.some(pr => pr.type === "best_e1rm" && pr.value === 84),
    `${prs.find(pr => pr.type === "best_e1rm")?.value}kg`
  );
  check("most_reps PR",
    prs.some(pr => pr.type === "most_reps" && pr.value === 10),
    `${prs.find(pr => pr.type === "most_reps")?.value} reps`
  );
}

console.log("\n8. PR detection - bodyweight exercise");
{
  const history: SetData[] = [
    set(8, 0),
    set(10, 0),
    set(12, 0),
    set(15, 0), // PR
    set(14, 0),
    set(15, 0), // Tied, not a new PR
  ];
  
  const prs = detectPersonalRecords(history, "reps");
  
  check("bodyweight has only most_reps PR", prs.length === 1);
  check("most_reps = 15", 
    prs[0]?.type === "most_reps" && prs[0]?.value === 15,
    `${prs[0]?.type} = ${prs[0]?.value}`
  );
  check("no e1rm for bodyweight", prs[0]?.e1rm === undefined);
}

console.log("\n9. PR detection - time-based exercise");
{
  const history: SetData[] = [
    set(null, null, 30),
    set(null, null, 45),
    set(null, null, 60), // PR
    set(null, null, 55),
    set(null, null, 60), // Tied
  ];
  
  const prs = detectPersonalRecords(history, "seconds");
  
  check("time-based has only longest_duration PR", prs.length === 1);
  check("longest_duration = 60s",
    prs[0]?.type === "longest_duration" && prs[0]?.value === 60,
    `${prs[0]?.value}s`
  );
}

console.log("\n10. Edge cases and invalid inputs");
{
  check("negative reps: null 1RM", calculateEpley1RM(-5, 100) === null);
  check("negative weight: null 1RM", calculateEpley1RM(10, -50) === null);
}

console.log("\n11. Mixed weight scenario (transitioning from bodyweight to weighted)");
{
  // User starts with bodyweight, then adds weight
  const history: SetData[] = [
    set(10, 0),   // Bodyweight
    set(12, 0),   // More reps
    set(15, 0),   // Even more
    set(8, 5),    // Added weight
    set(10, 5),   // More reps with weight
    set(8, 7.5),  // Heavier
  ];
  
  const prs = detectPersonalRecords(history, "reps");
  
  check("mixed scenario: has heaviest_weight", prs.some(pr => pr.type === "heaviest_weight"));
  check("mixed scenario: has best_e1rm", prs.some(pr => pr.type === "best_e1rm"));
  check("mixed scenario: has most_reps", prs.some(pr => pr.type === "most_reps"));
  check("most_reps is still 15 (from bodyweight)", 
    prs.find(pr => pr.type === "most_reps")?.value === 15
  );
}

console.log("\n12. Realistic bench press progression");
{
  // 4-week progression on bench press
  const week1 = [set(8, 60), set(8, 60), set(7, 60)];
  const week2 = [set(8, 62.5), set(8, 62.5), set(8, 62.5)];
  const week3 = [set(10, 62.5), set(9, 62.5), set(8, 62.5)];
  const week4 = [set(8, 65), set(8, 65), set(7, 65)];
  
  const fullHistory = [...week1, ...week2, ...week3, ...week4];
  const prs = detectPersonalRecords(fullHistory, "reps");
  
  check("bench progression: has all 3 PR types", prs.length === 3);
  check("heaviest: 65kg", prs.find(pr => pr.type === "heaviest_weight")?.value === 65);
  check("most reps: 10", prs.find(pr => pr.type === "most_reps")?.value === 10);
  
  const bestE1rmPR = prs.find(pr => pr.type === "best_e1rm");
  check("best e1rm from week 3 (10×62.5)",
    !!(bestE1rmPR && bestE1rmPR.value > 83 && bestE1rmPR.value < 84),
    `${bestE1rmPR?.value}`
  );
}

console.log("\n13. Realistic bodyweight pull-ups progression");
{
  const pullups: SetData[] = [
    // Week 1
    set(5, 0), set(5, 0), set(4, 0),
    // Week 2
    set(6, 0), set(6, 0), set(5, 0),
    // Week 3
    set(8, 0), set(7, 0), set(6, 0),
    // Week 4
    set(10, 0), set(9, 0), set(7, 0),
  ];
  
  const prs = detectPersonalRecords(pullups, "reps");
  
  check("pull-ups: only most_reps PR", prs.length === 1);
  check("most_reps: 10", prs[0]?.value === 10);
  check("no weight-based PRs for bodyweight", 
    !prs.some(pr => pr.type === "heaviest_weight" || pr.type === "best_e1rm")
  );
}

console.log("\n14. Realistic plank hold progression");
{
  const planks: SetData[] = [
    // Week 1
    set(null, null, 30), set(null, null, 30), set(null, null, 25),
    // Week 2
    set(null, null, 40), set(null, null, 35), set(null, null, 30),
    // Week 3
    set(null, null, 50), set(null, null, 45), set(null, null, 40),
    // Week 4
    set(null, null, 60), set(null, null, 55), set(null, null, 50),
  ];
  
  const prs = detectPersonalRecords(planks, "seconds");
  
  check("plank: only longest_duration PR", prs.length === 1);
  check("longest: 60s", prs[0]?.value === 60);
}

console.log("\n15. Epley formula validation with known values");
{
  // Known 1RM = 100kg
  // Expected reps at different weights (approximate)
  
  // 95% of 1RM should be around 2 reps
  const at95pct = calculateEpley1RM(2, 95);
  check("95kg × 2 reps ≈ 101.33kg",
    !!(at95pct && at95pct > 100 && at95pct < 102),
    `got ${at95pct}`
  );
  
  // 85% of 1RM should be around 5-6 reps
  const at85pct = calculateEpley1RM(5, 85);
  check("85kg × 5 reps ≈ 99.17kg",
    !!(at85pct && at85pct > 98 && at85pct < 100),
    `got ${at85pct}`
  );
  
  // 70% of 1RM should be around 10-12 reps
  const at70pct = calculateEpley1RM(12, 70);
  check("70kg × 12 reps ≈ 98kg",
    !!(at70pct && at70pct > 97 && at70pct < 99),
    `got ${at70pct}`
  );
}

console.log("\n16. Weighted rep PR rule edge cases");
{
  // Case 1: 100×5 / 80×8 / 80×9 -> 80×9 IS a PR
  const case1: SetData[] = [
    set(5, 100, null),
    set(8, 80, null),
    set(9, 80, null),
  ];
  const prs1 = detectPersonalRecords(case1, "reps");
  const mostReps1 = prs1.find(pr => pr.type === "most_reps");
  check("100×5 / 80×8 / 80×9: 80×9 IS a rep PR", 
    mostReps1?.value === 9 && mostReps1?.set.weight_kg === 80,
    `got ${mostReps1?.set.weight_kg}×${mostReps1?.value}`);

  // Case 2: 100×5 / 110×3 -> 110×3 is NOT a rep PR (no earlier set at 110)
  const case2: SetData[] = [
    set(5, 100, null),
    set(3, 110, null),
  ];
  const prs2 = detectPersonalRecords(case2, "reps");
  const mostReps2 = prs2.find(pr => pr.type === "most_reps");
  check("100×5 / 110×3: currentPRs.most_reps is baseline 100×5 (110×3 not a rep PR)", 
    mostReps2?.value === 5 && mostReps2?.set.weight_kg === 100,
    `got ${mostReps2 ? mostReps2.set.weight_kg + '×' + mostReps2.value : 'none'}`);

  // Case 3: 100×5 / 100×5 -> tie is NOT a PR, baseline remains
  const case3: SetData[] = [
    set(5, 100, null),
    set(5, 100, null),
  ];
  const prs3 = detectPersonalRecords(case3, "reps");
  const mostReps3 = prs3.find(pr => pr.type === "most_reps");
  check("100×5 / 100×5: currentPRs.most_reps is baseline 100×5 (tie not a PR)", 
    mostReps3?.value === 5 && mostReps3?.set.weight_kg === 100,
    `got ${mostReps3 ? mostReps3.set.weight_kg + '×' + mostReps3.value : 'none'}`);
}

console.log("\n17. Rep PR baseline from first session's top set (Task A)");
{
  // R9: 60×12 / 100×5 / 100×8 -> currentPRs.most_reps = 100×8
  const r9: SetData[] = [
    set(12, 60, null),
    set(5, 100, null),
    set(8, 100, null),
  ];
  const prsR9 = detectPersonalRecords(r9, "reps");
  const mostRepsR9 = prsR9.find(pr => pr.type === "most_reps");
  check("R9: 60×12 / 100×5 / 100×8 -> currentPRs.most_reps = 100×8",
    mostRepsR9?.value === 8 && mostRepsR9?.set.weight_kg === 100,
    `got ${mostRepsR9 ? mostRepsR9.set.weight_kg + '×' + mostRepsR9.value : 'none'}`);

  // Multi-set first session: [80×10, 100×5], then 100×8 -> currentPRs.most_reps = 100×8
  // Baseline is 100×5 (highest weight), not 80×10 (even though 80×10 has higher e1RM)
  const multiSet1: SetData[] = [
    set(10, 80, null),
    set(5, 100, null),
    set(8, 100, null),
  ];
  const prsMulti1 = detectPersonalRecords(multiSet1, "reps");
  const mostRepsMulti1 = prsMulti1.find(pr => pr.type === "most_reps");
  check("First session [80×10, 100×5], then 100×8 -> currentPRs.most_reps = 100×8",
    mostRepsMulti1?.value === 8 && mostRepsMulti1?.set.weight_kg === 100,
    `got ${mostRepsMulti1 ? mostRepsMulti1.set.weight_kg + '×' + mostRepsMulti1.value : 'none'}`);

  // Baseline ordering: highest weight wins, even if lower e1RM
  // [100×3, 90×10] baseline is 100×3 (weight 100 > 90), not 90×10 (e1RM 120 > 110)
  const weightVsE1RM: SetData[] = [
    set(3, 100, null),
    set(10, 90, null),
  ];
  const prsWeightVsE1RM = detectPersonalRecords(weightVsE1RM, "reps");
  const mostRepsWeightVsE1RM = prsWeightVsE1RM.find(pr => pr.type === "most_reps");
  check("First session [100×3, 90×10]: baseline is 100×3 (highest weight), not 90×10 (highest e1RM)",
    mostRepsWeightVsE1RM?.value === 3 && mostRepsWeightVsE1RM?.set.weight_kg === 100,
    `got ${mostRepsWeightVsE1RM ? mostRepsWeightVsE1RM.set.weight_kg + '×' + mostRepsWeightVsE1RM.value : 'none'}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
