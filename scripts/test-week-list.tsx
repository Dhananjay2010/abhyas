/**
 * Today's "Your week" list renders the done tick from buildWeekDays.
 *
 * Renders the REAL WeekList component (the one page.tsx uses) with rows from
 * the REAL buildWeekDays. Kills:
 *   - `const isDone = false` in src/lib/today/compute-done-days.ts
 *   - `{false && (` for the tick in src/app/today/week-list.tsx
 *   - page.tsx not passing buildWeekDays(...) to <WeekList> (case 3)
 */

import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { WeekList } from "../src/app/today/week-list";
import { buildWeekDays } from "../src/lib/today/compute-done-days";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!pass) failures++;
}

const days = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
  day_index: i,
  day_type: i === 7 ? "rest" : "weights",
  label: i === 7 ? "Rest" : `Strength ${i}`,
}));

function rowHtml(html: string, dayIndex: number): string {
  const start = html.indexOf(`data-day-index="${dayIndex}"`);
  if (start === -1) return "";
  const end = html.indexOf("</li>", start);
  return html.slice(start, end);
}

console.log("Test WeekList done tick\n");

console.log("1. Today's session completed: Monday ticked, the rest not");
const html = renderToStaticMarkup(
  <WeekList
    days={buildWeekDays({
      days,
      sessions: [{ local_date: "2026-10-26", status: "completed", actual_type: "weights" }],
      localToday: "2026-10-26",
      todayIndex: 1,
    })}
    chosenByDayIndex={new Map([[3, "Yoga"]])}
  />,
);
const mon = rowHtml(html, 1);
check("Monday row rendered", mon.length > 0);
check("Monday row has the Done tick", mon.includes('aria-label="Done"'));
check("Monday row is highlighted as today", mon.includes("bg-surface-2"));
check("Exactly one tick", (html.match(/aria-label="Done"/g) ?? []).length === 1);
check("Wednesday shows the user's choice", rowHtml(html, 3).includes("Yoga") && rowHtml(html, 3).includes("your choice"));
check("Sunday shows its label", rowHtml(html, 7).includes("Rest"));

console.log("\n2. Session only in progress: no tick");
const html2 = renderToStaticMarkup(
  <WeekList
    days={buildWeekDays({
      days,
      sessions: [{ local_date: "2026-10-26", status: "in_progress", actual_type: "weights" }],
      localToday: "2026-10-26",
      todayIndex: 1,
    })}
    chosenByDayIndex={new Map()}
  />,
);
check("No tick", !html2.includes('aria-label="Done"'));

console.log("\n3. page.tsx renders WeekList with buildWeekDays rows");
const page = fs.readFileSync(path.join(__dirname, "../src/app/today/page.tsx"), "utf-8");
check(
  "page.tsx passes buildWeekDays({ ... sessions: allSessions ... }) to <WeekList>",
  /<WeekList\s+days=\{buildWeekDays\(\{[^}]*sessions:\s*allSessions[^}]*\}\)\}/.test(page),
);

if (failures > 0) {
  console.log(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n✓ All WeekList checks passed");
