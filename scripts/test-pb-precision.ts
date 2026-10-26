/**
 * Test: PB detection precision bug fix.
 * 
 * Repro: user logs 4×10 @ 40 kg (e1RM = 53.333...), stored as 53.33.
 * Next session, identical 4×10 @ 40 kg produces live 53.333... which was
 * incorrectly beating stored 53.33 and showing a false PB.
 * 
 * Fix: round live e1RM to storage precision (2 dp) before comparing.
 */

import { nextBest, roundToStoragePrecision, estimateOneRepMax, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, pass: boolean, detail?: string): void {
  const mark = pass ? "✓" : "✗";
  const msg = detail ? ` (got ${detail})` : "";
  console.log(`  ${mark} ${label}${msg}`);
  if (!pass) {
    failures++;
    process.exitCode = 1;
  }
}

console.log("Test: PB precision comparison");

const meta: Pick<ExerciseMeta, "metric"> = { metric: "reps" };

console.log("\n1. Integer-hundredths rounding: 44.25×7 = 54.58 (exact 54.575)");
{
  // 44.25 * 37 / 30 = 54.575 → 54.58
  const e1rm = estimateOneRepMax(44.25, 7);
  check("44.25×7 produces 54.58", e1rm === 54.58, `got ${e1rm}`);
  
  const result = nextBest(
    [{ reps: 7, weightKg: 44.25 }],
    { bestWeightKg: 44.25, bestReps: 7, bestE1rm: 54.58 },
    meta
  );
  
  check("no PB when repeating 44.25×7 (54.58 = 54.58)", result.personalBest === null,
    result.personalBest ? `got ${result.personalBest.kind}` : undefined);
  check("bestE1rm unchanged", result.bestE1rm === 54.58, `${result.bestE1rm}`);
}

console.log("\n2. Integer-hundredths rounding: 1.15×3 = 1.27 (exact 1.265)");
{
  // 1.15 * 33 / 30 = 1.265 → 1.27
  const e1rm = estimateOneRepMax(1.15, 3);
  check("1.15×3 produces 1.27", e1rm === 1.27, `got ${e1rm}`);
  
  const result = nextBest(
    [{ reps: 3, weightKg: 1.15 }],
    { bestWeightKg: 1.15, bestReps: 3, bestE1rm: 1.27 },
    meta
  );
  
  check("no PB when repeating 1.15×3 (1.27 = 1.27)", result.personalBest === null,
    result.personalBest ? `got ${result.personalBest.kind}` : undefined);
  check("bestE1rm unchanged", result.bestE1rm === 1.27, `${result.bestE1rm}`);
}

console.log("\n3. Stored 53.33 vs live 40×10 → not a PB");
{
  const stored = 53.33;
  const live40x10 = estimateOneRepMax(40, 10); // Should be 53.33
  const rounded = roundToStoragePrecision(live40x10);
  
  check("live 40×10 produces 53.33", live40x10 === 53.33, `${live40x10}`);
  check("roundToStoragePrecision(53.33) = 53.33", rounded === 53.33, `${rounded}`);
  
  const result = nextBest(
    [{ reps: 10, weightKg: 40 }, { reps: 10, weightKg: 40 }, { reps: 10, weightKg: 40 }, { reps: 10, weightKg: 40 }],
    { bestWeightKg: 40, bestReps: 10, bestE1rm: stored },
    meta
  );
  
  check("no PB when repeating identical session", result.personalBest === null, 
    result.personalBest ? `got ${result.personalBest.kind}` : undefined);
  check("bestE1rm unchanged", result.bestE1rm === 53.33, `${result.bestE1rm}`);
}

console.log("\n4. Stored 53.33 vs live 40×11 → PB");
{
  const stored = 53.33;
  const live40x11 = estimateOneRepMax(40, 11);
  const rounded = roundToStoragePrecision(live40x11);
  
  check("live 40×11 produces expected", live40x11 > stored, `${live40x11}`);
  check("roundToStoragePrecision matches", rounded === live40x11, `${rounded}`);
  
  const result = nextBest(
    [{ reps: 11, weightKg: 40 }, { reps: 11, weightKg: 40 }, { reps: 11, weightKg: 40 }, { reps: 11, weightKg: 40 }],
    { bestWeightKg: 40, bestReps: 11, bestE1rm: stored },
    meta
  );
  
  check("PB when genuinely improved", result.personalBest?.kind === "e1rm", 
    result.personalBest ? `got ${result.personalBest.kind}` : "null");
  check("bestE1rm updated", result.bestE1rm > stored, `${result.bestE1rm}`);
}

console.log("\n5. No stored value → PB (first time)");
{
  const result = nextBest(
    [{ reps: 10, weightKg: 40 }],
    { bestWeightKg: null, bestReps: null, bestE1rm: null },
    meta
  );
  
  check("no PB on first session (nothing to beat)", result.personalBest === null,
    result.personalBest ? `got ${result.personalBest.kind}` : undefined);
  check("bestE1rm recorded", result.bestE1rm === 53.33, `${result.bestE1rm}`);
}

console.log("\n6. Boundary: live rounds to exactly stored → not a PB");
{
  // stored 56.00, live 40×12 = 56.00
  const stored = 56.00;
  const live40x12 = estimateOneRepMax(40, 12);
  const rounded = roundToStoragePrecision(live40x12);
  
  check("live 40×12 rounds to 56.00", rounded === 56.00, `${rounded}`);
  
  const result = nextBest(
    [{ reps: 12, weightKg: 40 }],
    { bestWeightKg: 40, bestReps: 12, bestE1rm: stored },
    meta
  );
  
  check("no PB when rounded live equals stored", result.personalBest === null,
    result.personalBest ? `got ${result.personalBest.kind}` : undefined);
  check("bestE1rm unchanged", result.bestE1rm === 56.00, `${result.bestE1rm}`);
}

console.log("\n7. Weight PBs: best_weight_kg is also numeric(6,2)");
{
  // 40.001 vs stored 40.00 → NOT a PB (rounds to 40.00)
  const result1 = nextBest(
    [{ reps: 10, weightKg: 40.001 }],
    { bestWeightKg: 40, bestReps: 10, bestE1rm: null },
    meta
  );
  
  check("40.001 vs 40.00: NOT a PB (rounds to 40.00)", 
    result1.personalBest === null,
    result1.personalBest ? `got ${result1.personalBest.kind}` : "null");
  check("bestWeightKg stays 40.00", result1.bestWeightKg === 40.00, `${result1.bestWeightKg}`);
  
  // 40.01 vs stored 40.00 → PB
  const result2 = nextBest(
    [{ reps: 10, weightKg: 40.01 }],
    { bestWeightKg: 40, bestReps: 10, bestE1rm: null },
    meta
  );
  
  check("40.01 vs 40.00: IS a PB", 
    result2.personalBest?.kind === "weight",
    result2.personalBest ? `got ${result2.personalBest.kind}` : "null");
  check("bestWeightKg updated to 40.01", result2.bestWeightKg === 40.01, `${result2.bestWeightKg}`);
}

console.log("\n8. Boundary +0.01 tests");
{
  // 100.01 vs stored 100.00 → PB
  const result1 = nextBest(
    [{ reps: 10, weightKg: 100.01 }],
    { bestWeightKg: 100.00, bestReps: 10, bestE1rm: null },
    meta
  );
  
  check("100.01 vs 100.00: IS a PB", 
    result1.personalBest?.kind === "weight",
    result1.personalBest ? `got ${result1.personalBest.kind}` : "null");
  
  // 100.004 vs stored 100.00 → NOT a PB (rounds to 100.00)
  const result2 = nextBest(
    [{ reps: 10, weightKg: 100.004 }],
    { bestWeightKg: 100.00, bestReps: 10, bestE1rm: null },
    meta
  );
  
  check("100.004 vs 100.00: NOT a PB (rounds to 100.00)", 
    result2.personalBest === null,
    result2.personalBest ? `got ${result2.personalBest.kind}` : "null");
}

console.log("\n9. roundToStoragePrecision function");
{
  check("53.333333... → 53.33", roundToStoragePrecision(53.333333) === 53.33);
  check("53.335 → 53.34 (rounds up)", roundToStoragePrecision(53.335) === 53.34);
  check("53.334 → 53.33 (rounds down)", roundToStoragePrecision(53.334) === 53.33);
  check("100 → 100.00", roundToStoragePrecision(100) === 100.00);
  check("0.001 → 0.00", roundToStoragePrecision(0.001) === 0.00);
  check("0.005 → 0.01 (rounds up)", roundToStoragePrecision(0.005) === 0.01);
}

if (failures === 0) {
  console.log("\n✓ All precision tests passed");
}
