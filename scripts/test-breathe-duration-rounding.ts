export {};
/**
 * Test duration rounding: a chosen duration is never shorter than its label.
 *
 * When the user picks a duration like "1 min", the actual duration in seconds
 * must be at least 60. The cycle count is rounded UP to ensure this.
 *
 *   npx tsx scripts/test-breathe-duration-rounding.ts
 */

import { buildCycle, cyclesForMinutes, lengthPlan } from "@/lib/breathing/engine";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Duration rounding for minute choices\n");

// Test various cycle lengths to ensure rounding up works correctly
const testCases: Array<{ cycleSeconds: number; minutes: number; minExpectedSeconds: number }> = [
  // Box breathing (4-4-4-4 = 16s per cycle)
  { cycleSeconds: 16, minutes: 1, minExpectedSeconds: 60 },  // ceil(60/16) = 4 cycles = 64s
  { cycleSeconds: 16, minutes: 3, minExpectedSeconds: 180 }, // ceil(180/16) = 12 cycles = 192s
  { cycleSeconds: 16, minutes: 5, minExpectedSeconds: 300 }, // ceil(300/16) = 19 cycles = 304s
  { cycleSeconds: 16, minutes: 10, minExpectedSeconds: 600 }, // ceil(600/16) = 38 cycles = 608s

  // 4-7-8 breathing (4+7+8 = 19s per cycle)
  { cycleSeconds: 19, minutes: 1, minExpectedSeconds: 60 },  // ceil(60/19) = 4 cycles = 76s
  { cycleSeconds: 19, minutes: 3, minExpectedSeconds: 180 }, // ceil(180/19) = 10 cycles = 190s
  { cycleSeconds: 19, minutes: 5, minExpectedSeconds: 300 }, // ceil(300/19) = 16 cycles = 304s
  { cycleSeconds: 19, minutes: 10, minExpectedSeconds: 600 }, // ceil(600/19) = 32 cycles = 608s

  // Slower breathing (5-5-5-5 = 20s per cycle)
  { cycleSeconds: 20, minutes: 1, minExpectedSeconds: 60 },  // ceil(60/20) = 3 cycles = 60s
  { cycleSeconds: 20, minutes: 3, minExpectedSeconds: 180 }, // ceil(180/20) = 9 cycles = 180s
  { cycleSeconds: 20, minutes: 5, minExpectedSeconds: 300 }, // ceil(300/20) = 15 cycles = 300s
  { cycleSeconds: 20, minutes: 10, minExpectedSeconds: 600 }, // ceil(600/20) = 30 cycles = 600s

  // Fast breathing (2-2-2-2 = 8s per cycle)
  { cycleSeconds: 8, minutes: 1, minExpectedSeconds: 60 },  // ceil(60/8) = 8 cycles = 64s
  { cycleSeconds: 8, minutes: 3, minExpectedSeconds: 180 }, // ceil(180/8) = 23 cycles = 184s
  { cycleSeconds: 8, minutes: 5, minExpectedSeconds: 300 }, // ceil(300/8) = 38 cycles = 304s
  { cycleSeconds: 8, minutes: 10, minExpectedSeconds: 600 }, // ceil(600/8) = 75 cycles = 600s

  // Odd cycle length (17s)
  { cycleSeconds: 17, minutes: 1, minExpectedSeconds: 60 },  // ceil(60/17) = 4 cycles = 68s
  { cycleSeconds: 17, minutes: 3, minExpectedSeconds: 180 }, // ceil(180/17) = 11 cycles = 187s
  { cycleSeconds: 17, minutes: 5, minExpectedSeconds: 300 }, // ceil(300/17) = 18 cycles = 306s
  { cycleSeconds: 17, minutes: 10, minExpectedSeconds: 600 }, // ceil(600/17) = 36 cycles = 612s
];

for (const { cycleSeconds, minutes, minExpectedSeconds } of testCases) {
  const cycles = cyclesForMinutes(
    { seconds: cycleSeconds, breaths: 1, phases: [] },
    minutes,
    null
  );
  const actualSeconds = cycles * cycleSeconds;
  const targetSeconds = minutes * 60;
  
  check(
    `${minutes} min with ${cycleSeconds}s cycle`,
    actualSeconds >= minExpectedSeconds && actualSeconds >= targetSeconds,
    `${cycles} cycles = ${actualSeconds}s (min ${minExpectedSeconds}s)`
  );
}

console.log("\n2. lengthPlan duration options\n");

// Test that lengthPlan produces options where the actual duration >= label
const patterns = [
  { name: "box-breathing (16s)", seconds: 16, breaths: 4 },
  { name: "4-7-8 (19s)", seconds: 19, breaths: 3 },
  { name: "slow (20s)", seconds: 20, breaths: 4 },
  { name: "odd (17s)", seconds: 17, breaths: 4 },
];

for (const pattern of patterns) {
  const cycle = buildCycle([
    { kind: "inhale", seconds: pattern.seconds / pattern.breaths, cue: "Breathe in" },
    { kind: "exhale", seconds: pattern.seconds / pattern.breaths, cue: "Breathe out" },
    { kind: "inhale", seconds: pattern.seconds / pattern.breaths, cue: "Breathe in" },
    { kind: "exhale", seconds: pattern.seconds / pattern.breaths, cue: "Breathe out" },
  ]);

  const plan = lengthPlan(cycle, null);
  
  if (plan.unit === "minutes") {
    for (const option of plan.options) {
      const actualSeconds = option.cycles * cycle.seconds;
      // The label should represent the requested duration
      // Extract the minutes from the label (e.g., "1 min", "3 min", "5 min")
      const labelMatch = option.label.match(/^(\d+)\s*min/);
      if (labelMatch) {
        const labelMinutes = parseInt(labelMatch[1], 10);
        const labelSeconds = labelMinutes * 60;
        check(
          `${pattern.name} "${option.label}"`,
          actualSeconds >= labelSeconds,
          `${option.cycles} cycles = ${actualSeconds}s >= ${labelSeconds}s`
        );
      }
    }
  }
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
} else {
  console.log(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
