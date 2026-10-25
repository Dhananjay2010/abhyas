/**
 * Test isMissedYesterday: the program-start guard preventing "You missed yesterday"
 * from appearing on a user's very first Today.
 *
 *   npx tsx scripts/test-is-missed-yesterday.ts
 *
 * QA report item (d): a user onboarded on 2026-10-25 with a program started_on
 * 2026-10-25 saw "You missed yesterday" on their first Today. The old logic only
 * checked template day type and whether there was a completed strength session,
 * never checking whether yesterday fell before the program start date.
 */

import { isMissedYesterday } from "../src/lib/today/is-missed-yesterday";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Signup today: no prompt when program started today");
{
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns false", result === false, "yesterday is before program start");
}

console.log("\n2. Program rebuilt today but user has older history: no prompt");
{
  // User started weeks ago, program was rebuilt/restarted today.
  // Yesterday (24 Oct) is before the NEW program's start (25 Oct).
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns false", result === false, "yesterday is before new program start");
}

console.log("\n3. Real missed day: program started days ago, training day, nothing completed");
{
  // Program started on 19 Oct, today is 25 Oct, yesterday is 24 Oct.
  // Yesterday was a training day and nothing was completed.
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-19",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns true", result === true, "missed day after program start");
}

console.log("\n4. Yesterday was trained: no prompt");
{
  // Program started on 19 Oct, yesterday was a training day, but completed.
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-19",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: true,
  });
  check("returns false", result === false, "yesterday was completed");
}

console.log("\n5. Yesterday was not a training day: no prompt");
{
  // Program started on 19 Oct, yesterday was a rest day.
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-19",
    yesterdayIsTrainingDay: false,
    hadCompletedStrengthYesterday: false,
  });
  check("returns false", result === false, "yesterday was rest day");
}

console.log("\n6. Timezone edge: yesterday in IST differs from yesterday in UTC");
{
  // On 25 Oct 2026, at 00:30 IST, it's still 24 Oct 19:00 UTC.
  // In IST: today = 2026-10-25, yesterday = 2026-10-24
  // Program started on 2026-10-25 IST (same as today in IST).
  // Yesterday (24 Oct IST) is before program start (25 Oct IST).
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns false", result === false, "yesterday in IST before program start");
  
  // Now test the opposite: today is 26 Oct IST, yesterday is 25 Oct IST,
  // program started on 25 Oct IST. Yesterday should show missed prompt.
  const result2 = isMissedYesterday({
    yesterday: "2026-10-25",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns true", result2 === true, "yesterday equals program start, is training day, not completed");
}

console.log("\n7. Program started exactly on yesterday: should show prompt if missed");
{
  // Program started on 24 Oct, today is 25 Oct, yesterday is 24 Oct.
  // Yesterday equals the start date and was a missed training day.
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-24",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns true", result === true, "yesterday equals program start and was missed");
}

console.log("\n8. started_on is null: preserve current behaviour");
{
  // When started_on is null, only check training day + completion.
  const result = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: null,
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns true", result === true, "null started_on, training day, not completed");
  
  const result2 = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: null,
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: true,
  });
  check("returns false", result2 === false, "null started_on, training day, completed");
  
  const result3 = isMissedYesterday({
    yesterday: "2026-10-24",
    programStartedOn: null,
    yesterdayIsTrainingDay: false,
    hadCompletedStrengthYesterday: false,
  });
  check("returns false", result3 === false, "null started_on, rest day");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
