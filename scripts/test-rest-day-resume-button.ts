/**
 * Test rest-day Resume affordance (Fix 2).
 *
 * Behavioral test of decideRestDayResume, which powers the
 * Resume button and swap prompt on rest days with open sessions.
 *
 *   npm run test:rest-day-resume-button
 */

import { strict as assert } from "node:assert";
import { decideRestDayResume } from "../src/lib/today/rest-day-resume";
import type { SessionForDetection } from "../src/lib/today/session-detection";

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

const localToday = "2026-10-27"; // Tuesday

function main() {
  console.log("Testing decideRestDayResume\n");

  test("Rest day with NO open session: showSwap=true, showResume=false", () => {
    const result = decideRestDayResume({
      dayType: "rest",
      strengthOpen: undefined,
      localToday,
    });

    assert.equal(result.showResume, false, "showResume should be false");
    assert.equal(result.showSwap, true, "showSwap should be true");
    assert.equal(result.resumeButton, null, "resumeButton should be null");
  });

  test("Rest day with open session (started) from earlier today: form button 'Resume session'", () => {
    const session: SessionForDetection = {
      id: "session-today",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-27", // Today
      started_at: "2026-10-27T08:00:00Z",
    };

    const result = decideRestDayResume({
      dayType: "rest",
      strengthOpen: session,
      localToday,
    });

    assert.equal(result.showResume, true, "showResume should be true");
    assert.equal(result.showSwap, false, "showSwap should be false");
    assert.deepEqual(
      result.resumeButton,
      { type: "form", label: "Resume session" },
      "resumeButton should be form with 'Resume session'"
    );
  });

  test("Rest day with open session (planned, not started) from today: form button 'Start session'", () => {
    const session: SessionForDetection = {
      id: "session-today-planned",
      status: "planned",
      actual_type: "weights",
      local_date: "2026-10-27", // Today
      started_at: null,
    };

    const result = decideRestDayResume({
      dayType: "rest",
      strengthOpen: session,
      localToday,
    });

    assert.equal(result.showResume, true, "showResume should be true");
    assert.equal(result.showSwap, false, "showSwap should be false");
    assert.deepEqual(
      result.resumeButton,
      { type: "form", label: "Start session" },
      "resumeButton should be form with 'Start session'"
    );
  });

  test("Rest day with open session from previous day: link button /session/<id>", () => {
    const session: SessionForDetection = {
      id: "session-prev",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-26", // Yesterday
      started_at: "2026-10-26T18:00:00Z",
    };

    const result = decideRestDayResume({
      dayType: "rest",
      strengthOpen: session,
      localToday,
    });

    assert.equal(result.showResume, true, "showResume should be true");
    assert.equal(result.showSwap, false, "showSwap should be false");
    assert.deepEqual(
      result.resumeButton,
      { type: "link", href: "/session/session-prev" },
      "resumeButton should be link with href"
    );
  });

  test("Training day with open session: showSwap=true (not a rest day)", () => {
    const session: SessionForDetection = {
      id: "session-prev",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-26",
      started_at: "2026-10-26T18:00:00Z",
    };

    const result = decideRestDayResume({
      dayType: "weights",
      strengthOpen: session,
      localToday,
    });

    assert.equal(result.showResume, false, "showResume should be false (not rest)");
    assert.equal(result.showSwap, true, "showSwap should be true");
    assert.equal(result.resumeButton, null, "resumeButton should be null");
  });

  test("Yoga day with open session: showSwap=true", () => {
    const session: SessionForDetection = {
      id: "session-prev",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-26",
      started_at: "2026-10-26T18:00:00Z",
    };

    const result = decideRestDayResume({
      dayType: "yoga",
      strengthOpen: session,
      localToday,
    });

    assert.equal(result.showResume, false, "showResume should be false (not rest)");
    assert.equal(result.showSwap, true, "showSwap should be true");
  });

  test("MUTANT: showSwap always true breaks rest-day hiding", () => {
    const session: SessionForDetection = {
      id: "session-prev",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-26",
      started_at: "2026-10-26T18:00:00Z",
    };

    const result = decideRestDayResume({
      dayType: "rest",
      strengthOpen: session,
      localToday,
    });

    // This will FAIL when the mutant is introduced
    assert.equal(result.showSwap, false, "MUTANT breaks: showSwap should be FALSE on rest with open session");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
