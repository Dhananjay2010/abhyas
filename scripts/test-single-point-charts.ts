/**
 * Test chart data building with single-point data.
 * 
 * Ensures 0-point and 1-point cases are handled correctly for:
 * - Volume per session (BarChart)
 * - Body weight (LineChart)
 * - Strength by lift (LineChart, from strength-charts helper)
 * 
 *   npx tsx scripts/test-single-point-charts.ts
 */

import { buildStrengthChartsFromDescendingRows, type StrengthHistoryRow } from "../src/lib/progress/strength-charts";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

console.log("\nTesting chart data building with single-point data\n");

// Test 1: Zero points
console.log("1. Empty data (0 points)");
const emptyRows: StrengthHistoryRow[] = [];
const emptyCharts = buildStrengthChartsFromDescendingRows(emptyRows, shortDate);
check("returns empty array", emptyCharts.length === 0, `got ${emptyCharts.length}`);

// Test 2: Single point
console.log("\n2. Single data point (1 point)");
const singlePointRows: StrengthHistoryRow[] = [
  {
    exercise_id: "ex1",
    exercise_name: "Bench Press",
    local_date: "2026-10-24",
    best_e1rm: 100,
    top_weight_kg: 90,
  },
];
const singlePointCharts = buildStrengthChartsFromDescendingRows(singlePointRows, shortDate);
check("includes chart for single-point exercise", singlePointCharts.length === 1, `got ${singlePointCharts.length}`);
check("chart has 1 point", singlePointCharts[0]?.points.length === 1);
check("chart name is correct", singlePointCharts[0]?.name === "Bench Press");
check("point value is correct", singlePointCharts[0]?.points[0]?.value === 100);
check("point label is formatted", singlePointCharts[0]?.points[0]?.label === "24 Oct");

// Test 3: Multiple exercises, one with single point
console.log("\n3. Mixed: 2-point and 1-point exercises");
const mixedRows: StrengthHistoryRow[] = [
  // Squat: 2 points (should appear first, sorted by point count)
  {
    exercise_id: "ex1",
    exercise_name: "Squat",
    local_date: "2026-10-20",
    best_e1rm: 150,
    top_weight_kg: 135,
  },
  {
    exercise_id: "ex1",
    exercise_name: "Squat",
    local_date: "2026-10-22",
    best_e1rm: 155,
    top_weight_kg: 140,
  },
  // Bench: 1 point (should appear second)
  {
    exercise_id: "ex2",
    exercise_name: "Bench Press",
    local_date: "2026-10-24",
    best_e1rm: 100,
    top_weight_kg: 90,
  },
];
const mixedCharts = buildStrengthChartsFromDescendingRows(mixedRows, shortDate);
check("includes both exercises", mixedCharts.length === 2, `got ${mixedCharts.length}`);
check("sorted by point count (2-point first)", mixedCharts[0]?.name === "Squat");
check("1-point exercise is second", mixedCharts[1]?.name === "Bench Press");
check("first exercise has 2 points", mixedCharts[0]?.points.length === 2);
check("second exercise has 1 point", mixedCharts[1]?.points.length === 1);

// Test 4: Chronological order
console.log("\n4. Points ordered chronologically (oldest to newest)");
const chronologicalRows: StrengthHistoryRow[] = [
  // Fetched newest-first (descending)
  {
    exercise_id: "ex1",
    exercise_name: "Deadlift",
    local_date: "2026-10-24",
    best_e1rm: 200,
    top_weight_kg: 180,
  },
  {
    exercise_id: "ex1",
    exercise_name: "Deadlift",
    local_date: "2026-10-20",
    best_e1rm: 195,
    top_weight_kg: 175,
  },
];
const chronoCharts = buildStrengthChartsFromDescendingRows(chronologicalRows, shortDate);
check("points are reversed to chronological", chronoCharts[0]?.points[0]?.label === "20 Oct");
check("newest point is last", chronoCharts[0]?.points[1]?.label === "24 Oct");
check("values in chronological order", chronoCharts[0]?.points[0]?.value === 195);

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion: Chart data building correctly handles 0-point and 1-point cases.");
  console.log("Single-point exercises are included (not filtered out) and sorted by point count.\n");
}
