/**
 * Test 2: Rest day with open strength session from earlier day shows Resume.
 *
 * Unit tests shouldLoadPlannableDays which controls swap prompt visibility.
 * The rest-day Resume button reuses the training-day component/markup.
 *
 *   npx tsx scripts/test-rest-day-resume-button.ts
 */

import { shouldLoadPlannableDays } from "../src/lib/today/should-load-plannable";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\n1. Rest day with NO open session loads plannable days");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "rest",
    strengthOpen: false,
  });

  check("Returns true (offers swap)", shouldLoad === true);
}

console.log("\n2. Rest day WITH open session does NOT load plannable days");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "rest",
    strengthOpen: true,
  });

  check(
    "Returns false (shows Resume, not swap)",
    shouldLoad === false,
    "Should exclude rest when strengthOpen to show Resume button"
  );
}

console.log("\n3. Training day never loads plannable regardless of strengthOpen");
{
  const withOpen = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "weights",
    strengthOpen: true,
  });

  const withoutOpen = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "weights",
    strengthOpen: false,
  });

  check("Training day with open: false", withoutOpen === false);
  check("Training day with open: false", withOpen === false);
}

console.log("\n4. askAboutToday forces plannable days even with strengthOpen");
{
  const restWithMissed = shouldLoadPlannableDays({
    askAboutToday: true,
    dayType: "rest",
    strengthOpen: true,
  });

  check(
    "Missed yesterday overrides strengthOpen check",
    restWithMissed === true,
    "askAboutToday takes precedence"
  );
}

console.log("\n5. Rest day with session started earlier TODAY");
{
  // Session started earlier today behaves same as session from previous day
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "rest",
    strengthOpen: true,
  });

  check(
    "Shows Resume, not swap (same as previous-day session)",
    shouldLoad === false,
    "strengthOpen=true covers both cases"
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
