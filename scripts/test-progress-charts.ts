/**
 * Progress page regression fix (2026-10-24): Strength charts must plot points
 * oldest to newest (chronological), same as weight and volume. The bug was that
 * exercise_strength_history is fetched descending with limit 600 but was never
 * reversed before charting, unlike weights and volume.
 *
 *   npx tsx scripts/test-progress-charts.ts
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

console.log("\n1. Points are ordered chronologically (oldest to newest)");
{
  // Simulate DB data fetched descending (newest first) as Progress page receives it
  const rowsNewestFirst: StrengthHistoryRow[] = [
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-15", best_e1rm: 100, top_weight_kg: 90 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-10", best_e1rm: 95, top_weight_kg: 85 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-05", best_e1rm: 90, top_weight_kg: 80 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rowsNewestFirst, shortDate);
  
  check("one exercise found", charts.length === 1);
  check("three points", charts[0].points.length === 3);
  check("first point is oldest date", charts[0].points[0].value === 90, `${charts[0].points[0].value}`);
  check("middle point is middle date", charts[0].points[1].value === 95, `${charts[0].points[1].value}`);
  check("last point is newest date", charts[0].points[2].value === 100, `${charts[0].points[2].value}`);
  check("labels are formatted", charts[0].points[0].label === "5 Sept");
}

console.log("\n2. Multiple exercises sorted by point count descending");
{
  // DB data newest-first across multiple exercises
  const rowsNewestFirst: StrengthHistoryRow[] = [
    { exercise_id: "ex2", exercise_name: "Bench", local_date: "2026-09-10", best_e1rm: 75, top_weight_kg: 70 },
    { exercise_id: "ex3", exercise_name: "Deadlift", local_date: "2026-09-07", best_e1rm: 125, top_weight_kg: 115 },
    { exercise_id: "ex2", exercise_name: "Bench", local_date: "2026-09-06", best_e1rm: 72, top_weight_kg: 67 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-05", best_e1rm: 95, top_weight_kg: 85 },
    { exercise_id: "ex3", exercise_name: "Deadlift", local_date: "2026-09-03", best_e1rm: 120, top_weight_kg: 110 },
    { exercise_id: "ex2", exercise_name: "Bench", local_date: "2026-09-02", best_e1rm: 70, top_weight_kg: 65 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-01", best_e1rm: 90, top_weight_kg: 80 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rowsNewestFirst, shortDate);
  
  check("three exercises found", charts.length === 3);
  check("first exercise has most points (3)", charts[0].points.length === 3 && charts[0].name === "Bench");
  check("second and third have 2 points each", charts[1].points.length === 2 && charts[2].points.length === 2);
  check("Bench first point is oldest", charts[0].points[0].value === 70, `${charts[0].points[0].value}`);
  check("Bench last point is newest", charts[0].points[2].value === 75, `${charts[0].points[2].value}`);
}

console.log("\n3. Filters exercises with fewer than 2 points");
{
  const rowsNewestFirst: StrengthHistoryRow[] = [
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-05", best_e1rm: 95, top_weight_kg: 85 },
    { exercise_id: "ex2", exercise_name: "Single", local_date: "2026-09-02", best_e1rm: 70, top_weight_kg: 65 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-01", best_e1rm: 90, top_weight_kg: 80 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rowsNewestFirst, shortDate);
  
  check("only exercise with 2+ points included", charts.length === 1);
  check("exercise with 1 point is filtered out", charts[0].name === "Squat");
}

console.log("\n4. Handles null and missing data");
{
  const rowsNewestFirst: StrengthHistoryRow[] = [
    { exercise_id: "ex2", exercise_name: "Bench", local_date: "2026-09-05", best_e1rm: 75, top_weight_kg: 70 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: null, best_e1rm: 95, top_weight_kg: 85 },
    { exercise_id: null, exercise_name: "No ID", local_date: "2026-09-01", best_e1rm: 90, top_weight_kg: 80 },
    { exercise_id: "ex1", exercise_name: "Squat", local_date: "2026-09-01", best_e1rm: null, top_weight_kg: 80 },
    { exercise_id: "ex2", exercise_name: "Bench", local_date: "2026-09-01", best_e1rm: 70, top_weight_kg: 65 },
  ];
  
  const charts = buildStrengthChartsFromDescendingRows(rowsNewestFirst, shortDate);
  
  check("only valid exercise included", charts.length === 1);
  check("rows with null values are skipped", charts[0].name === "Bench");
  check("valid exercise has correct points", charts[0].points.length === 2);
}

console.log("\n5. Real-world regression scenario");
{
  // Simulating the bug: DB returns newest-first with limit 600.
  // A user did squats three times, e1RM increasing each time: 60, 65, 70 kg.
  // Bug was that the page didn't reverse descending data, so charts plotted backwards.
  const dbResultNewestFirst: StrengthHistoryRow[] = [
    { exercise_id: "squat", exercise_name: "Back Squat", local_date: "2026-09-15", best_e1rm: 70, top_weight_kg: 65 },
    { exercise_id: "squat", exercise_name: "Back Squat", local_date: "2026-09-10", best_e1rm: 65, top_weight_kg: 60 },
    { exercise_id: "squat", exercise_name: "Back Squat", local_date: "2026-09-05", best_e1rm: 60, top_weight_kg: 55 },
  ];
  
  // Fixed: use the fetch-shaping helper that Progress page now uses
  const charts = buildStrengthChartsFromDescendingRows(dbResultNewestFirst, shortDate);
  check("first point is oldest (60 kg)", 
    charts[0].points[0].value === 60, 
    `${charts[0].points[0].value}`);
  check("plot rises from 60 to 70", 
    charts[0].points[0].value === 60 && charts[0].points[2].value === 70);
  check("dates run oldest to newest", 
    charts[0].points[0].label === "5 Sept" && 
    charts[0].points[2].label === "15 Sept");
}

console.log("\n6. Empty input and edge cases");
{
  const empty = buildStrengthChartsFromDescendingRows([], shortDate);
  check("empty input returns empty array", empty.length === 0);
  
  const allInvalid: StrengthHistoryRow[] = [
    { exercise_id: null, exercise_name: "A", local_date: "2026-09-01", best_e1rm: 90, top_weight_kg: 80 },
    { exercise_id: "ex1", exercise_name: "B", local_date: null, best_e1rm: 90, top_weight_kg: 80 },
  ];
  const noValid = buildStrengthChartsFromDescendingRows(allInvalid, shortDate);
  check("all invalid rows returns empty", noValid.length === 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
