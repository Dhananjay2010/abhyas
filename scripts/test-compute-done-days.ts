/**
 * computeDoneDays and buildWeekDays: which "Your week" rows get a done tick.
 *
 * Real helpers, real dates. Kills `const isDone = false` in
 * src/lib/today/compute-done-days.ts (cases 2 and 3).
 */

import { buildWeekDays, computeDoneDays } from "@/lib/today/compute-done-days";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!pass) failures++;
}

console.log("Test computeDoneDays / buildWeekDays\n");

console.log("1. computeDoneDays");
const done = computeDoneDays([
  { local_date: "2026-10-25", status: "completed", actual_type: "weights" },
  { local_date: "2026-10-26", status: "in_progress", actual_type: "weights" },
  { local_date: "2026-10-27", status: "completed", actual_type: "yoga" },
  { local_date: "2026-10-28", status: "completed", actual_type: null },
  { local_date: "2026-10-29", status: "planned", actual_type: "weights" },
]);
check("completed strength is done", done.has("2026-10-25"));
check("in-progress is not done", !done.has("2026-10-26"));
check("completed yoga is done", done.has("2026-10-27"));
check("completed with no type is not done", !done.has("2026-10-28"));
check("planned is not done", !done.has("2026-10-29"));

// Monday 26 Oct 2026 is ISO weekday 1.
const days = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ day_index: i, day_type: i % 2 ? "weights" : "rest", label: `Day ${i}` }));

console.log("\n2. buildWeekDays: today done after finishing today's session");
const week = buildWeekDays({
  days,
  sessions: [
    { local_date: "2026-10-26", status: "completed", actual_type: "weights" },
    // A completed session LAST Tuesday must not tick tomorrow's row.
    { local_date: "2026-10-20", status: "completed", actual_type: "weights" },
  ],
  localToday: "2026-10-26",
  todayIndex: 1,
});
check("7 rows", week.length === 7);
check("Monday row is today, dated 2026-10-26", week[0].isToday && week[0].date === "2026-10-26", week[0].date);
check("Monday row is done", week[0].isDone === true);
check("Tuesday row is next Tuesday (2026-10-27)", week[1].date === "2026-10-27", week[1].date);
check("Tuesday row is not done", week[1].isDone === false);
check("Only one row done", week.filter((d) => d.isDone).length === 1);
check("Row fields kept", week[2].label === "Day 3" && week[2].day_type === "weights");

console.log("\n3. buildWeekDays mid-week: today is Thursday, Thursday yoga done");
const week2 = buildWeekDays({
  days,
  sessions: [{ local_date: "2026-10-29", status: "completed", actual_type: "yoga" }],
  localToday: "2026-10-29",
  todayIndex: 4,
});
check("Thursday row is today and done", week2[3].isToday && week2[3].isDone, `${week2[3].date} ${week2[3].isDone}`);
check("Monday row is next Monday (2026-11-02)", week2[0].date === "2026-11-02", week2[0].date);
check("Nothing else done", week2.filter((d) => d.isDone).length === 1);

console.log("\n4. Nothing completed: nothing ticked");
const week3 = buildWeekDays({
  days,
  sessions: [{ local_date: "2026-10-26", status: "in_progress", actual_type: "weights" }],
  localToday: "2026-10-26",
  todayIndex: 1,
});
check("no rows done", week3.every((d) => !d.isDone));

if (failures > 0) {
  console.log(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n✓ All done-day checks passed");
