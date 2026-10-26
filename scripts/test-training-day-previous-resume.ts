/**
 * Test training-day resume regression (Fix 2 regression guard).
 *
 * Ensures the training-day Resume link is preserved when a strength
 * session from a previous day is open.
 *
 *   npm run test:training-day-previous-resume
 */

import { strict as assert } from "node:assert";
import { previousDayResumeHref } from "../src/lib/today/session-detection";
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

const localToday = "2026-10-27"; // Monday

function main() {
  console.log("Testing training-day resume (regression guard)\n");

  test("Training day: open session from previous day → Resume link /session/<id>", () => {
    const session: SessionForDetection = {
      id: "session-prev",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-26", // Yesterday
      started_at: "2026-10-26T18:00:00Z",
    };

    const href = previousDayResumeHref(session, localToday);

    assert.equal(
      href,
      "/session/session-prev",
      "Previous-day session should return /session/<id>"
    );
  });

  test("Training day: open session from today → null (use form button)", () => {
    const session: SessionForDetection = {
      id: "session-today",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-27", // Today
      started_at: "2026-10-27T08:00:00Z",
    };

    const href = previousDayResumeHref(session, localToday);

    assert.equal(
      href,
      null,
      "Today's session should return null (uses StartSessionButton)"
    );
  });

  test("Training day: no open session → null", () => {
    const href = previousDayResumeHref(undefined, localToday);

    assert.equal(href, null, "No session should return null");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
