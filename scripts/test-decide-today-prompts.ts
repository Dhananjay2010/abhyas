/**
 * Test decideTodayPrompts: single prompt logic for Today page.
 *
 * Scenario from QA Bot 1: yesterday's training day was missed; user taps Rest
 * from missed-yesterday prompt, then taps Keep it. After that, the page must NOT
 * show duplicate prompts and must NOT offer Rest when the day is already Rest.
 *
 *   npx tsx scripts/test-decide-today-prompts.ts
 */

import { strict as assert } from "node:assert";
import { decideTodayPrompts } from "../src/lib/today/decide-today-prompts";

export {}; // Module

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

async function main() {
  console.log("Testing decideTodayPrompts\n");

  // QA Bot 1 scenario: missed yesterday, user chose Rest, then Keep it
  await test("QA scenario: After user chose Rest, show train-anyway (not missed-yesterday)", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [
        { status: "planned", actual_type: "rest" },
      ],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.notEqual(result.prompt, null, "Should show rest-day-swap (way back to training)");
    assert.equal(result.prompt?.type, "rest-day-swap", "Should be rest-day-swap, not missed-yesterday");
    assert.equal(result.offerRest, false, "Should NOT offer Rest when day is already Rest");
  });

  await test("QA scenario: When day is Rest, do not offer Rest option", () => {
    const result = decideTodayPrompts({
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [],
      yesterdayDay: undefined,
    });

    // Even if a prompt were shown (rest-day swap), Rest should not be offered
    assert.equal(result.offerRest, false, "Should not offer Rest when day is already Rest");
  });

  await test("QA scenario: At most one prompt shown (missed-yesterday has priority)", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest", // Both conditions could trigger prompts
      todaySessions: [], // No user choice yet
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.notEqual(result.prompt, null, "Should show a prompt");
    assert.equal(result.prompt?.type, "missed-yesterday", "Missed-yesterday has priority");
    // Only one prompt can be shown at a time (tested by checking single type)
  });

  await test("Missed yesterday prompt shows before user decides", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: [], // No decision yet
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.equal(result.prompt?.type, "missed-yesterday", "Should show missed-yesterday prompt");
    assert.equal(result.offerRest, true, "Should offer Rest when day is not Rest");
  });

  await test("Rest-day swap shows when no strength open and no missed yesterday", () => {
    const result = decideTodayPrompts({
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [], // No decision yet
      yesterdayDay: undefined,
    });

    assert.equal(result.prompt?.type, "rest-day-swap", "Should show rest-day swap");
    assert.equal(result.offerRest, false, "Should not offer Rest on a rest day");
  });

  await test("No prompt when strength is done", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: true, // Completed today
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: [{ status: "completed", actual_type: "weights" }],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.equal(result.prompt, null, "No prompt when strength is already done");
  });

  await test("No prompt when strength is open", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: { id: "sess-1", status: "in_progress", actual_type: "weights" },
      dayType: "weights",
      todaySessions: [{ status: "in_progress", actual_type: "weights" }],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.equal(result.prompt, null, "No prompt when strength session is open");
  });

  await test("User chose training (not Rest), missed-yesterday still suppressed", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: [
        { status: "planned", actual_type: "weights" },
      ],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.equal(result.prompt, null, "No prompt after user chose training (not a rest day)");
  });

  await test("Rest override with missed yesterday: train-anyway, not missed-yesterday", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [
        { status: "skipped", actual_type: "rest" },
        { status: "planned", actual_type: "rest" },
      ],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.notEqual(result.prompt, null, "Should show prompt even with multiple rows");
    assert.equal(result.prompt?.type, "rest-day-swap", "Should be rest-day-swap, not missed-yesterday");
  });

  await test("M2: Rest override on training day still shows train-anyway", () => {
    const result = decideTodayPrompts({
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [
        { status: "planned", actual_type: "rest" },
      ],
      yesterdayDay: undefined,
    });

    assert.notEqual(result.prompt, null, "Should still show prompt after Rest override");
    assert.equal(result.prompt?.type, "rest-day-swap", "Should show rest-day-swap prompt");
    assert.equal(result.prompt?.heading, "Or train today anyway", "Heading should be 'Or train today anyway'");
    assert.equal(result.offerRest, false, "Should NOT offer Rest when day is already Rest");
  });

  await test("M2: Never show missed-yesterday after user chose (show rest-day-swap instead)", () => {
    const result = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [
        { status: "planned", actual_type: "rest" },
      ],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });

    assert.equal(result.prompt?.type, "rest-day-swap", "Should show rest-day-swap, not missed-yesterday");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
