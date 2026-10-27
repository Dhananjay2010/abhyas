#!/usr/bin/env tsx
/**
 * Test: anchored block 1 preserves strength + yoga day counts across all start weekdays
 * 
 * HIGH-1: Before the fix, anchored plans dropped training days when yoga > 0
 * because activeDayIndicesAnchored was called with trainingDays instead of daysPerWeek.
 * 
 * Real bounds (from settings/actions.ts and onboarding):
 * - Total days per week: 3, 4, 5, or 6
 * - Yoga days: 0 to days-1 (no upper cap of 2)
 * - Strength days = total days - yoga days
 * 
 * This sweeps all 18 valid (days, yoga) combinations × 7 start weekdays = 126 cases.
 * Asserts:
 * 1. Strength count = days - yoga exactly
 * 2. Yoga count = yoga exactly
 * 3. Multiset of day types matches unanchored plan
 * 
 * Mutant killed: reverting to activeDayIndicesAnchored(startedOn, trainingDays)
 * causes test:anchored-yoga-sweep to fail with "Expected N strength days, got M" for any yoga>0.
 */

import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import catalogueData from "./fixtures/catalogue.json";

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue: catalogueData,
    ...overrides,
  };
}

type DayTypeCounts = { weights: number; bodyweight: number; yoga: number; rest: number };

function countDayTypes(plan: ReturnType<typeof generateProgram>): DayTypeCounts {
  const counts: DayTypeCounts = { weights: 0, bodyweight: 0, yoga: 0, rest: 0 };
  for (const day of plan.days) {
    if (day.dayType === "weights") counts.weights++;
    else if (day.dayType === "bodyweight") counts.bodyweight++;
    else if (day.dayType === "yoga") counts.yoga++;
    else if (day.dayType === "rest") counts.rest++;
  }
  return counts;
}

// Valid combinations: total days in {3,4,5,6}, yoga in 0..days-1
// From settings/actions.ts line 57-63 and onboarding bounds:
// - days_per_week (total): 3-6
// - yoga_days_per_week: 0 to days_per_week - 1 (no cap of 2)
const validCombos: Array<{ days: number; yoga: number }> = [];
for (const days of [3, 4, 5, 6]) {
  for (let yoga = 0; yoga < days; yoga++) {
    validCombos.push({ days, yoga });
  }
}

// Verify we have exactly 18 combinations: 3+4+5+6 = 18
if (validCombos.length !== 18) {
  throw new Error(`Expected 18 combinations, got ${validCombos.length}`);
}

// All 7 weekdays (ISO: 1=Mon, 7=Sun)
// Test dates that fall on each weekday
const startDates: Array<{ weekday: string; date: string }> = [
  { weekday: "Mon", date: "2026-10-26" },
  { weekday: "Tue", date: "2026-10-27" },
  { weekday: "Wed", date: "2026-10-28" },
  { weekday: "Thu", date: "2026-10-29" },
  { weekday: "Fri", date: "2026-10-30" },
  { weekday: "Sat", date: "2026-10-31" },
  { weekday: "Sun", date: "2026-11-01" },
];

async function main() {
  console.log("\nAnchored block 1: strength + yoga preservation sweep\n");
  console.log(`Real bounds: days ∈ {3,4,5,6}, yoga ∈ 0..days-1`);
  console.log(`Combinations: ${validCombos.length} (expected 18)`);
  console.log(`Testing ${validCombos.length} combos × ${startDates.length} start weekdays = ${validCombos.length * startDates.length} cases\n`);

  let failures = 0;

  for (const combo of validCombos) {
    const { days, yoga } = combo;
    const expectedStrength = days - yoga;
    
    console.log(`\n${expectedStrength} strength + ${yoga} yoga (${days} days/week):`);
    
    // Get unanchored plan as reference (block 2, no startedOn)
    const unanchored = generateProgram(
      base({
        blockNumber: 2,
        daysPerWeek: days,
        yogaDaysPerWeek: yoga,
      })
    );
    const unanchoredCounts = countDayTypes(unanchored);
    
    for (const start of startDates) {
      // Generate anchored plan (block 1 with startedOn)
      const anchored = generateProgram(
        base({
          blockNumber: 1,
          startedOn: start.date,
          daysPerWeek: days,
          yogaDaysPerWeek: yoga,
        })
      );
      const anchoredCounts = countDayTypes(anchored);
      
      // Check 1: exact strength day count (days - yoga)
      const actualStrength = anchoredCounts.weights + anchoredCounts.bodyweight;
      if (actualStrength !== expectedStrength) {
        console.log(`  FAIL ${start.weekday}: expected ${expectedStrength} strength days (${days}-${yoga}), got ${actualStrength}`);
        failures++;
        continue;
      }
      
      // Check 2: exact yoga day count
      if (anchoredCounts.yoga !== yoga) {
        console.log(`  FAIL ${start.weekday}: expected ${yoga} yoga days, got ${anchoredCounts.yoga}`);
        failures++;
        continue;
      }
      
      // Check 3: multiset match with unanchored plan
      if (
        anchoredCounts.weights !== unanchoredCounts.weights ||
        anchoredCounts.bodyweight !== unanchoredCounts.bodyweight ||
        anchoredCounts.yoga !== unanchoredCounts.yoga ||
        anchoredCounts.rest !== unanchoredCounts.rest
      ) {
        console.log(`  FAIL ${start.weekday}: day type counts don't match unanchored`);
        console.log(`    Anchored:   W=${anchoredCounts.weights} BW=${anchoredCounts.bodyweight} Y=${anchoredCounts.yoga} R=${anchoredCounts.rest}`);
        console.log(`    Unanchored: W=${unanchoredCounts.weights} BW=${unanchoredCounts.bodyweight} Y=${unanchoredCounts.yoga} R=${unanchoredCounts.rest}`);
        failures++;
        continue;
      }
    }
    
    console.log(`  ✓ All 7 start weekdays preserve ${expectedStrength} strength + ${yoga} yoga`);
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} failures\n`);
    process.exit(1);
  }

  console.log(`\n✓ All ${validCombos.length * startDates.length} cases passed\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
