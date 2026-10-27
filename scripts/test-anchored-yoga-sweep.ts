#!/usr/bin/env tsx
/**
 * Test: anchored block 1 preserves strength + yoga day counts across all start weekdays
 * 
 * HIGH-1: Before the fix, anchored plans dropped training days when yoga > 0
 * because activeDayIndicesAnchored was called with trainingDays instead of daysPerWeek.
 * 
 * This sweeps every valid (strength, yoga) combo × all 7 start weekdays (Mon-Sun)
 * and asserts:
 * 1. Exact strength day count matches config
 * 2. Exact yoga day count matches config
 * 3. Multiset of day types matches unanchored plan
 * 
 * Mutant killed: reverting to activeDayIndicesAnchored(startedOn, trainingDays)
 * causes test:anchored-yoga-sweep to fail with "Expected N strength days, got M" for any yoga>0.
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

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
    catalogue,
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

// Valid combos: strength days (2-6) + yoga days (0-2)
// Total daysPerWeek = strength + yoga, max 7
const validCombos: Array<{ strength: number; yoga: number }> = [
  { strength: 2, yoga: 0 },
  { strength: 3, yoga: 0 },
  { strength: 4, yoga: 0 },
  { strength: 5, yoga: 0 },
  { strength: 6, yoga: 0 },
  { strength: 2, yoga: 1 },
  { strength: 3, yoga: 1 },
  { strength: 4, yoga: 1 },
  { strength: 5, yoga: 1 },
  { strength: 6, yoga: 1 },
  { strength: 3, yoga: 2 },
  { strength: 4, yoga: 2 },
  { strength: 5, yoga: 2 },
  // 6+2=8 exceeds 7 days/week, skip
];

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
  console.log(`Testing ${validCombos.length} combos × ${startDates.length} start weekdays = ${validCombos.length * startDates.length} cases\n`);

  let failures = 0;

  for (const combo of validCombos) {
    const daysPerWeek = combo.strength + combo.yoga;
    
    console.log(`\n${combo.strength} strength + ${combo.yoga} yoga (${daysPerWeek} days/week):`);
    
    // Get unanchored plan as reference (block 2, no startedOn)
    const unanchored = generateProgram(
      base({
        blockNumber: 2,
        daysPerWeek,
        yogaDaysPerWeek: combo.yoga,
      })
    );
    const unanchoredCounts = countDayTypes(unanchored);
    
    for (const start of startDates) {
      // Generate anchored plan (block 1 with startedOn)
      const anchored = generateProgram(
        base({
          blockNumber: 1,
          startedOn: start.date,
          daysPerWeek,
          yogaDaysPerWeek: combo.yoga,
        })
      );
      const anchoredCounts = countDayTypes(anchored);
      
      // Check 1: exact strength day count
      const strengthDays = anchoredCounts.weights + anchoredCounts.bodyweight;
      if (strengthDays !== combo.strength) {
        console.log(`  FAIL ${start.weekday}: expected ${combo.strength} strength days, got ${strengthDays}`);
        failures++;
        continue;
      }
      
      // Check 2: exact yoga day count
      if (anchoredCounts.yoga !== combo.yoga) {
        console.log(`  FAIL ${start.weekday}: expected ${combo.yoga} yoga days, got ${anchoredCounts.yoga}`);
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
    
    console.log(`  ✓ All 7 start weekdays preserve ${combo.strength} strength + ${combo.yoga} yoga`);
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
