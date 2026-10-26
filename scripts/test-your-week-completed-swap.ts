/**
 * Test 3: 'Your week' shows swapped day after session completes.
 *
 * After swapping in a day and finishing the session, 'Your week' must continue
 * to show the chosen day (e.g., "Upper (your choice)"), not revert to the
 * template day label.
 *
 * This is a source analysis test verifying the Today page queries for
 * completed strength sessions in addition to planned and in_progress.
 *
 *   npx tsx scripts/test-your-week-completed-swap.ts
 */

import fs from "fs";
import path from "path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

const pagePath = path.join(__dirname, "../src/app/today/page.tsx");
const pageContent = fs.readFileSync(pagePath, "utf-8");

console.log("\n1. 'Your week' logic searches for session overrides");
{
  check(
    "Has chosenByDayIndex map",
    pageContent.includes("chosenByDayIndex")
  );

  check(
    "Searches allSessions for overrides",
    pageContent.includes("allSessions.find")
  );
}

console.log("\n2. 'Your week' includes completed sessions in search");
{
  // The fix: must include 'completed' status for strength sessions
  // Current code (line ~407) only checks planned and in_progress
  
  // Extract the chosenByDayIndex section
  const chosenSection = pageContent.match(
    /const chosenByDayIndex[\s\S]*?chosenByDayIndex\.set/
  );

  if (!chosenSection) {
    check("Found chosenByDayIndex section", false, "Section not found");
  } else {
    const hasCompletedInChosen = chosenSection[0].includes('"completed"') || 
                                  chosenSection[0].includes("'completed'");

    check(
      "Checks for completed status in chosenByDayIndex logic",
      hasCompletedInChosen,
      "Should include 'completed' in status check to keep showing swap after finish"
    );
  }
}

console.log("\n3. Completed sessions only counted for strength (ownsToday logic)");
{
  // Should have logic similar to ownsToday that only counts strength as 'completed'
  const hasStrengthCheck = pageContent.includes("isStrength") || 
                           pageContent.includes("ownsPlannedWorkout");

  check(
    "Filters by strength type for completed",
    hasStrengthCheck,
    "Should use strength filter like ownsToday does"
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
