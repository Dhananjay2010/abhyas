/**
 * Test that detects the duplicate-prompt mutant.
 *
 * Run with the mutant to verify the test goes red:
 *   npx tsx scripts/test-decide-today-prompts-mutant.ts
 */

import { strict as assert } from "node:assert";
// Import the MUTANT version
import { decideTodayPrompts } from "./mutant-decide-today-prompts-duplicate";

export {}; // Module

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function main() {
  console.log("Testing mutant: duplicate prompts bug\n");

  test("MUTANT TEST: QA scenario returns at most ONE prompt", () => {
    // Scenario: missed yesterday, user chose Rest for today
    // The mutant ignores user choice and would allow both prompts
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [
        { status: "planned", actual_type: "rest" }, // User chose Rest
      ],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    // With the mutant, this will show the missed-yesterday prompt
    // But the page would ALSO show the rest-day swap prompt (that's the bug)
    // Our test verifies that after user chose, NO prompt should show
    assert.equal(result.prompt, null, "No prompt after user decided (mutant shows one)");
  });

  test("MUTANT TEST: Rest not offered when day is already Rest", () => {
    // The mutant always sets offerRest to true
    const result = decideTodayPrompts({
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [],
      yesterdayDay: undefined,
    });

    assert.equal(result.offerRest, false, "Should not offer Rest on rest day (mutant offers it)");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\n❌ MUTANT SURVIVED: The test correctly detected the bug");
    process.exit(1);
  } else {
    console.log("\n✅ MUTANT KILLED: All tests passed (should not happen with buggy mutant)");
  }
}

main();
