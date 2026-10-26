/**
 * Today's "What you did" list shows the sets actually logged.
 *
 * Goes through the REAL buildTodayRowsForProgram (the helper page.tsx calls),
 * which builds rows with the real s<order_index> keys and wires the logged
 * sets in. Mutants killed here:
 *   - dropping the wireLoggedSets call in build-today-rows-for-program.ts
 *   - `row.loggedSets = undefined` in wire-logged-sets.ts
 *   - page.tsx no longer passing `logged` (case 4 reads page.tsx's call)
 */

import fs from "fs";
import path from "path";
import { buildTodayRowsForProgram } from "@/lib/today/build-today-rows-for-program";
import type { LoggedSetsData } from "@/lib/today/wire-logged-sets";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!pass) failures++;
}

const actual = [
  {
    order_index: 0,
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 180,
    status: "completed" as const,
    metric: "reps" as const,
    swapped_from_exercise_id: null,
    exercises: { name: "Bench Press", cue: null },
  },
  {
    order_index: 1,
    planned_sets: 3,
    planned_reps_min: 30,
    planned_reps_max: 60,
    rest_seconds: 60,
    status: "completed" as const,
    metric: "seconds" as const,
    swapped_from_exercise_id: null,
    exercises: { name: "Plank", cue: null },
  },
  {
    order_index: 2,
    planned_sets: 3,
    planned_reps_min: 10,
    planned_reps_max: 12,
    rest_seconds: 60,
    status: "skipped" as const,
    metric: "reps" as const,
    swapped_from_exercise_id: null,
    exercises: { name: "Curl", cue: null },
  },
];

const logged: LoggedSetsData[] = [
  {
    order_index: 0,
    metric: "reps",
    session_sets: [
      { reps: 10, weight_kg: 40, duration_seconds: null, is_warmup_set: true },
      { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
      { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
      { reps: 9, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
    ],
  },
  {
    order_index: 1,
    metric: "seconds",
    session_sets: [
      { reps: null, weight_kg: null, duration_seconds: 45, is_warmup_set: false },
      { reps: null, weight_kg: null, duration_seconds: 42, is_warmup_set: false },
      { reps: null, weight_kg: null, duration_seconds: 40, is_warmup_set: false },
    ],
  },
  { order_index: 2, metric: "reps", session_sets: [] },
];

const program = { started_on: "2026-10-05", week_offset: 0, deload_week: 4 };

console.log("Test Today logged sets through buildTodayRowsForProgram\n");

console.log("1. Completed session: rows carry the logged sets");
const rows = buildTodayRowsForProgram({
  actual,
  template: [],
  program,
  localToday: "2026-10-26",
  logged: { exercises: logged, units: "metric" },
});
check("3 rows with real s<N> keys", rows.map((r) => r.key).join(",") === "s0,s1,s2", rows.map((r) => r.key).join(","));
check("Bench shows its working sets (warm-up excluded)", rows[0]?.loggedSets === "10, 10, 9 × 80 kg", String(rows[0]?.loggedSets));
check("Plank shows its holds", rows[1]?.loggedSets === "45s, 42s, 40s", String(rows[1]?.loggedSets));
check("Skipped exercise with no sets shows no logged line", !rows[2]?.loggedSets, String(rows[2]?.loggedSets));

console.log("\n2. Imperial user: weights in lb");
const rowsLb = buildTodayRowsForProgram({
  actual,
  template: [],
  program,
  localToday: "2026-10-26",
  logged: { exercises: logged, units: "imperial" },
});
check("Bench in lb", /lb/.test(rowsLb[0]?.loggedSets ?? "") && !/kg/.test(rowsLb[0]?.loggedSets ?? ""), String(rowsLb[0]?.loggedSets));

console.log("\n3. No logged data (session not finished): prescription only");
const rowsNone = buildTodayRowsForProgram({ actual, template: [], program, localToday: "2026-10-26", logged: null });
check("No row has loggedSets", rowsNone.every((r) => !r.loggedSets));

console.log("\n4. page.tsx passes the logged sets to the helper and renders them");
const page = fs.readFileSync(path.join(__dirname, "../src/app/today/page.tsx"), "utf-8");
const call = page.slice(page.indexOf("buildTodayRowsForProgram({"), page.indexOf("buildTodayRowsForProgram({") + 600);
check("page.tsx calls buildTodayRowsForProgram with logged: loggedSetsRes", /logged:\s*loggedSetsRes\?\.data/.test(call));
check("page.tsx renders row.loggedSets", page.includes("{row.loggedSets ??"));

if (failures > 0) {
  console.log(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n✓ All logged-sets checks passed");
