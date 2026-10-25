/**
 * Mutant test: verify that removing the program-start guard causes test failures.
 *
 *   npx tsx scripts/test-is-missed-yesterday-mutant.ts
 *
 * This runs the same tests against a mutant version of isMissedYesterday
 * where the `yesterday < programStartedOn` guard has been removed. The
 * test SHOULD fail, proving the guard is necessary.
 */

/**
 * MUTANT VERSION: start-date guard removed.
 * This version will incorrectly show "You missed yesterday" for users
 * on their very first day.
 */
function isMissedYesterdayMutant({
  yesterday,
  programStartedOn,
  yesterdayIsTrainingDay,
  hadCompletedStrengthYesterday,
}: {
  yesterday: string;
  programStartedOn: string | null;
  yesterdayIsTrainingDay: boolean;
  hadCompletedStrengthYesterday: boolean;
}): boolean {
  // If started_on is null, keep the current behaviour.
  if (programStartedOn === null) {
    return yesterdayIsTrainingDay && !hadCompletedStrengthYesterday;
  }

  // MUTANT: The `yesterday < programStartedOn` guard is removed.
  // This causes the bug: "You missed yesterday" appears before the program started.

  return yesterdayIsTrainingDay && !hadCompletedStrengthYesterday;
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Signup today: MUTANT SHOULD FAIL");
{
  const result = isMissedYesterdayMutant({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("should return false, mutant returns true", result === false, `got ${result}, expected false`);
}

console.log("\n2. Program rebuilt today: MUTANT SHOULD FAIL");
{
  const result = isMissedYesterdayMutant({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("should return false, mutant returns true", result === false, `got ${result}, expected false`);
}

console.log("\n3. Real missed day: should still work");
{
  const result = isMissedYesterdayMutant({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-19",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("returns true", result === true, "missed day after program start");
}

console.log("\n4. Yesterday was trained: should still work");
{
  const result = isMissedYesterdayMutant({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-19",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: true,
  });
  check("returns false", result === false, "yesterday was completed");
}

console.log("\n5. Timezone edge: MUTANT SHOULD FAIL");
{
  const result = isMissedYesterdayMutant({
    yesterday: "2026-10-24",
    programStartedOn: "2026-10-25",
    yesterdayIsTrainingDay: true,
    hadCompletedStrengthYesterday: false,
  });
  check("should return false, mutant returns true", result === false, `got ${result}, expected false`);
}

console.log(`\n${failures === 0 ? "MUTANT SURVIVED (BAD)" : `MUTANT KILLED: ${failures} test(s) failed as expected`}\n`);
process.exit(failures === 0 ? 1 : 0);

})();

export {};
