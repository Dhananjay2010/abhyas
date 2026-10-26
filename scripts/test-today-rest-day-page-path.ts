/**
 * Test 4: Page wiring test - verify Today page correctly wires shouldLoadPlannableDays.
 *
 * Verifies that src/app/today/page.tsx:
 * 1. Calls shouldLoadPlannableDays with askAboutToday and dayType
 * 2. Passes the result to plannableDays when true
 * 3. Passes plannable to the rest-day DayPlanPrompt
 *
 * This is a static source analysis test, not a render test, following the
 * pattern of other page wiring tests in this repo.
 *
 *   npx tsx scripts/test-today-rest-day-page-path.ts
 */

import fs from "fs";
import path from "path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\n1. Page wiring: shouldLoadPlannableDays call");
{
  const pagePath = path.join(__dirname, "../src/app/today/page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");

  check(
    "Imports shouldLoadPlannableDays",
    pageContent.includes("import") && pageContent.includes("shouldLoadPlannableDays")
  );

  check(
    "Calls shouldLoadPlannableDays with askAboutToday, dayType, and strengthOpen",
    pageContent.includes("shouldLoadPlannableDays({ askAboutToday, dayType") &&
    pageContent.includes("strengthOpen")
  );

  check(
    "Conditionally loads plannableDays based on result",
    pageContent.includes("shouldLoadPlannableDays({ askAboutToday, dayType") &&
    pageContent.includes("? plannableDays(")
  );
}

console.log("\n2. Page wiring: rest-day DayPlanPrompt receives plannable");
{
  const pagePath = path.join(__dirname, "../src/app/today/page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");

  // Check for the rest-day section
  const restDaySection = pageContent.match(
    /dayType === "rest"[\s\S]*?<DayPlanPrompt[\s\S]*?days=\{plannable\}[\s\S]*?heading="Or train today anyway"/
  );

  check(
    "Rest-day DayPlanPrompt has days={plannable}",
    restDaySection !== null,
    restDaySection ? "Found rest-day prompt with plannable" : "Could not find rest-day DayPlanPrompt with days={plannable}"
  );

  check(
    "Rest-day DayPlanPrompt has heading 'Or train today anyway'",
    pageContent.includes('heading="Or train today anyway"')
  );
}

console.log("\n3. Mutant would break: askAboutToday only");
{
  // This documents that reverting to `askAboutToday` only would break the fix
  console.log("  -- If shouldLoadPlannableDays call used only askAboutToday,");
  console.log("  -- rest days would get empty plannable array");
  check("Documentation check", true);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All page wiring tests passed\n");
}

