/**
 * Test buildStrengthChartsFromDescendingRows:
 * - Imperial converts e1RM and sets unit label
 * - Metric preserves values and sets unit label
 * - Deload rows stay as points with isDeload flag
 * - Points are chronologically ordered (oldest to newest)
 * - Handles best_e1rm as numeric string (PostgREST format)
 */

import { buildStrengthChartsFromDescendingRows, type StrengthHistoryRow } from "../src/lib/progress/strength-charts";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nbuildStrengthChartsFromDescendingRows tests");

// Test 1: Imperial conversion
{
  const rows: StrengthHistoryRow[] = [
    { exercise_id: "ex1", exercise_name: "Bench Press", local_date: "2024-01-03", best_e1rm: 100, top_weight_kg: 90 },
    { exercise_id: "ex1", exercise_name: "Bench Press", local_date: "2024-01-02", best_e1rm: 95, top_weight_kg: 85 },
    { exercise_id: "ex1", exercise_name: "Bench Press", local_date: "2024-01-01", best_e1rm: 90, top_weight_kg: 80 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rows, (d) => d, "imperial", new Set());
  
  check("Imperial: returns one chart", charts.length === 1);
  check("Imperial: unitLabel is 'lb'", charts[0].unitLabel === "lb");
  check("Imperial: has 3 points", charts[0].points.length === 3);
  
  // 100 kg → 220.46 lb
  const val = charts[0].points[2].value;
  check("Imperial: 100 kg converts to ~220.5 lb",
    val >= 220.4 && val <= 220.5,
    `got ${val.toFixed(2)}`);
}

// Test 2: Metric unchanged
{
  const rows: StrengthHistoryRow[] = [
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2024-01-02", best_e1rm: 150, top_weight_kg: 140 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2024-01-01", best_e1rm: 145, top_weight_kg: 135 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rows, (d) => d, "metric", new Set());
  
  check("Metric: unitLabel is 'kg'", charts[0].unitLabel === "kg");
  check("Metric: 150 kg stays as 150", charts[0].points[1].value === 150);
  check("Metric: 145 kg stays as 145", charts[0].points[0].value === 145);
}

// Test 3: Deload markers
{
  const rows: StrengthHistoryRow[] = [
    { exercise_id: "ex1", exercise_name: "Deadlift", local_date: "2024-01-04", best_e1rm: 200, top_weight_kg: 180 },
    { exercise_id: "ex1", exercise_name: "Deadlift", local_date: "2024-01-03", best_e1rm: 150, top_weight_kg: 140 }, // deload
    { exercise_id: "ex1", exercise_name: "Deadlift", local_date: "2024-01-02", best_e1rm: 195, top_weight_kg: 175 },
    { exercise_id: "ex1", exercise_name: "Deadlift", local_date: "2024-01-01", best_e1rm: 190, top_weight_kg: 170 },
  ];
  
  const deloadDates = new Set(["2024-01-03"]);
  const charts = buildStrengthChartsFromDescendingRows(rows, (d) => d, "metric", deloadDates);
  
  check("Deload: all 4 points present", charts[0].points.length === 4);
  check("Deload: point 0 not marked", !charts[0].points[0].isDeload);
  check("Deload: point 1 marked isDeload", charts[0].points[1].isDeload === true);
  check("Deload: point 2 not marked", !charts[0].points[2].isDeload);
  check("Deload: point 3 not marked", !charts[0].points[3].isDeload);
}

// Test 4: Chronological ordering (oldest to newest)
{
  const rows: StrengthHistoryRow[] = [
    { exercise_id: "ex1", exercise_name: "Press", local_date: "2024-01-05", best_e1rm: 80, top_weight_kg: 70 },
    { exercise_id: "ex1", exercise_name: "Press", local_date: "2024-01-03", best_e1rm: 75, top_weight_kg: 65 },
    { exercise_id: "ex1", exercise_name: "Press", local_date: "2024-01-01", best_e1rm: 70, top_weight_kg: 60 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rows, (d) => d, "metric", new Set());
  
  check("Order: first point is oldest (70)", charts[0].points[0].value === 70);
  check("Order: second point is middle (75)", charts[0].points[1].value === 75);
  check("Order: third point is newest (80)", charts[0].points[2].value === 80);
  check("Order: first label is 2024-01-01", charts[0].points[0].label === "2024-01-01");
  check("Order: last label is 2024-01-05", charts[0].points[2].label === "2024-01-05");
}

// Test 5: Numeric string best_e1rm (PostgREST can return numbers as strings)
{
  // Type assertion to simulate PostgREST returning numeric strings
  type RowWithStringNumber = Omit<StrengthHistoryRow, "best_e1rm"> & { best_e1rm: string | number | null };
  const rows: RowWithStringNumber[] = [
    { exercise_id: "ex1", exercise_name: "Row", local_date: "2024-01-02", best_e1rm: "120.5", top_weight_kg: 110 },
    { exercise_id: "ex1", exercise_name: "Row", local_date: "2024-01-01", best_e1rm: "115", top_weight_kg: 105 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rows as StrengthHistoryRow[], (d) => d, "metric", new Set());
  
  check("String: '120.5' parses to 120.5", charts[0].points[1].value === 120.5);
  check("String: '115' parses to 115", charts[0].points[0].value === 115);
}

// Test 6: Multiple exercises
{
  const rows: StrengthHistoryRow[] = [
    { exercise_id: "ex2", exercise_name: "Squat", local_date: "2024-01-02", best_e1rm: 200, top_weight_kg: 180 },
    { exercise_id: "ex1", exercise_name: "Bench", local_date: "2024-01-02", best_e1rm: 100, top_weight_kg: 90 },
    { exercise_id: "ex2", exercise_name: "Squat", local_date: "2024-01-01", best_e1rm: 195, top_weight_kg: 175 },
    { exercise_id: "ex1", exercise_name: "Bench", local_date: "2024-01-01", best_e1rm: 95, top_weight_kg: 85 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rows, (d) => d, "metric", new Set());
  
  check("Multiple: returns 2 charts", charts.length === 2);
  // Charts sorted by point count descending (both have 2, so stable)
  check("Multiple: first chart name", charts[0].name === "Squat" || charts[0].name === "Bench");
  check("Multiple: each chart has 2 points", 
    charts[0].points.length === 2 && charts[1].points.length === 2);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
