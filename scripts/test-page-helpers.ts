#!/usr/bin/env tsx
/**
 * Test: Today page wiring helpers kill surviving mutants.
 * 
 * m2: First training day must be plan day 1, not next calendar day
 * m4: Week calculation must use week_offset
 * m6b: Week rows must use chosen labels
 */

import { buildTodayView } from "../src/lib/today/page-helpers";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log("=== Test m2: First training day is plan day 1, not next calendar ===\n");

const m2Days = [
  { id: "d1", day_index: 1, day_type: "rest" as const, label: null },
  { id: "d2", day_index: 2, day_type: "weights" as const, label: "Push" },
  { id: "d3", day_index: 3, day_type: "weights" as const, label: "Pull" },
  { id: "d4", day_index: 4, day_type: "rest" as const, label: null },
  { id: "d5", day_index: 5, day_type: "weights" as const, label: "Legs" },
  { id: "d6", day_index: 6, day_type: "rest" as const, label: null },
  { id: "d7", day_index: 7, day_type: "rest" as const, label: null },
];

const m2Result = buildTodayView({
  program: { started_on: "2026-10-20", week_offset: 0, deload_week: 4 },
  localToday: "2026-10-20", // Monday, day_index 1 (rest)
  days: m2Days,
  hasStartedAny: false,
  chosenByDayIndex: new Map(),
});

assert(m2Result.firstTrainingDay !== null, "First training day exists");
assert(m2Result.firstTrainingDay!.dayIndex === 2, "First training day is day 2 (Tuesday), not day 1");
assert(m2Result.firstTrainingDay!.label === "Push", "First training day label is Push");

console.log("\n=== Test m4: Week calculation uses week_offset ===\n");

const m4Result = buildTodayView({
  program: { started_on: "2026-10-01", week_offset: 2, deload_week: 4 },
  localToday: "2026-10-08", // 8 days = week 2, +offset 2 = week 4
  days: m2Days,
  hasStartedAny: true,
  chosenByDayIndex: new Map(),
});

assert(m4Result.week === 4, "Week 2 + offset 2 = week 4");
assert(m4Result.isDeload === true, "Week 4 is deload week");

const m4NoOffset = buildTodayView({
  program: { started_on: "2026-10-01", week_offset: 0, deload_week: 4 },
  localToday: "2026-10-08",
  days: m2Days,
  hasStartedAny: true,
  chosenByDayIndex: new Map(),
});

assert(m4NoOffset.week === 2, "Week without offset is 2");
assert(m4NoOffset.isDeload === false, "Week 2 is NOT deload week");

console.log("\n=== Test m6b: Week rows use chosen labels ===\n");

const chosenMap = new Map([[3, "Upper"]]);
const m6bResult = buildTodayView({
  program: { started_on: "2026-10-20", week_offset: 0, deload_week: 4 },
  localToday: "2026-10-20",
  days: m2Days,
  hasStartedAny: true,
  chosenByDayIndex: chosenMap,
});

const day3Row = m6bResult.weekRowsWithChoices.find((r) => r.dayIndex === 3);
assert(day3Row !== undefined, "Day 3 row exists");
assert(day3Row!.label === "Upper", "Day 3 shows chosen label 'Upper'");
assert(day3Row!.isChoice === true, "Day 3 is marked as choice");

const day2Row = m6bResult.weekRowsWithChoices.find((r) => r.dayIndex === 2);
assert(day2Row!.label === "Push", "Day 2 (unchosen) shows template label 'Push'");
assert(day2Row!.isChoice === false, "Day 2 is not marked as choice");

console.log("\n✅ All page helper tests passed (m2, m4, m6b killed)\n");
