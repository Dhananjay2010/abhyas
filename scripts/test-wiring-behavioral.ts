/**
 * Behavioral test: wiring of today/decide-today-prompts (page removed tautologies).
 *
 * Verify that the Today page doesn't revert to showing both prompts or ignoring
 * deriveTodayView's single-prompt decision.
 *
 * Mutants (undos):
 * 1-3. Removed (shouldShowSwap helper deleted)
 * 4. Week map still works
 *
 *   npx tsx scripts/test-wiring-behavioral.ts
 */

import { strict as assert } from "node:assert";
import { decideRestDayResume } from "../src/lib/today/rest-day-resume";
import { buildChosenByDayIndex } from "../src/lib/today/chosen-by-day";
import type { SessionForDetection } from "../src/lib/today/session-detection";

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
  console.log("Testing wiring-behavioral\n");

  // Undo 2 (formerly): decideRestDayResume still works
  await test("decideRestDayResume: rest + strengthOpen → showResume", () => {
    const strengthOpen: SessionForDetection = {
      id: "sess-1",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-11-01",
      started_at: "2026-11-01T10:00:00Z",
    };
    const decision = decideRestDayResume({
      dayType: "rest",
      strengthOpen,
      localToday: "2026-11-01",
    });
    assert.equal(decision.showResume, true, "Should show resume on rest day with open session");
    assert.equal(decision.resumeButton?.type, "form", "Should be form type for today's session");
  });

  // Undo 3 (formerly): decideRestDayResume checks dayType
  await test("decideRestDayResume: weights day → hide", () => {
    const strengthOpen: SessionForDetection = {
      id: "sess-1",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-11-01",
      started_at: "2026-11-01T10:00:00Z",
    };
    const decision = decideRestDayResume({
      dayType: "weights",
      strengthOpen,
      localToday: "2026-11-01",
    });
    assert.equal(decision.showResume, false, "Should hide resume on training day");
    assert.equal(decision.resumeButton, null, "No resume button on training day");
  });

  await test("decideRestDayResume: rest + no session → no resume", () => {
    const decision = decideRestDayResume({
      dayType: "rest",
      strengthOpen: undefined,
      localToday: "2026-11-01",
    });
    assert.equal(decision.showResume, false, "No resume without open session");
    assert.equal(decision.resumeButton, null, "No resume button without open session");
  });

  // Undo 4: Week map still works
  const sessions = [
    {
      local_date: "2026-11-04",
      status: "completed",
      actual_type: "rest" as const,
      program_day_id: null,
      created_at: "2026-11-04T10:00:00Z",
    },
  ];
  const days = [
    { id: "day-3", day_index: 3, day_type: "weights" as const, label: "Pull" },
  ];
  const map = buildChosenByDayIndex(sessions, days, "2026-11-03", 2);
  assert.equal(map.size, 0, "Rest doesn't own the day, so no map entry");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
