/**
 * Test deriveTodayView pure decision logic.
 *
 *   npx tsx scripts/test-derive-today-view.ts
 */

import { strict as assert } from "node:assert";
import { deriveTodayView } from "../src/lib/today/derive-today-view";
import type { Database } from "../src/lib/database.types";

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

type SessionInput = {
  local_date: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  program_day_id: string | null;
  created_at?: string | null;
  started_at?: string | null;
};

function main() {
  console.log("Testing deriveTodayView\n");

  test("Rest day with yesterday's open session gives Resume and no swap", () => {
    const result = deriveTodayView({
      dayType: "rest",
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: {
        id: "sess-1",
        local_date: "2026-11-01",
        status: "in_progress" as const,
        actual_type: "weights",
        started_at: "2026-11-01T10:00:00Z",
      },
      todaySessions: [],
      yesterdayDay: undefined,
      localToday: "2026-11-02",
      todayIndex: 2,
      allSessions: [],
      days: [],
    });

    assert.equal(result.showResume, true, "Should show Resume");
    assert.equal(result.showSwap, false, "Should NOT show swap prompt");
    assert(result.resumeButton !== null, "Resume button should exist");
    assert.equal(result.resumeButton?.type, "link", "Resume should be a link");
    assert.equal(result.prompt, null, "No prompt when resuming");
  });

  test("Plain rest day gives train-anyway prompt with plannable days", () => {
    const result = deriveTodayView({
      dayType: "rest",
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      todaySessions: [],
      yesterdayDay: undefined,
      localToday: "2026-11-02",
      todayIndex: 2,
      allSessions: [],
      days: [],
    });

    assert(result.prompt !== null, "Should show a prompt");
    assert.equal(result.prompt?.type, "rest-day-swap", "Should be rest-day-swap prompt");
    assert.equal(result.shouldLoadPlannableDays, true, "Should load plannable days");
    assert.equal(result.showSwap, true, "Should show swap");
    assert.equal(result.showResume, false, "Should NOT show Resume");
  });

  test("Missed-yesterday then Rest then Keep gives at most 1 prompt and no Rest option", () => {
    const todaySessions: SessionInput[] = [
      { local_date: "2026-11-02", status: "planned", actual_type: "rest", program_day_id: null },
    ];

    const result = deriveTodayView({
      dayType: "rest",
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      todaySessions,
      yesterdayDay: { day_type: "weights", label: "Push" },
      localToday: "2026-11-02",
      todayIndex: 2,
      allSessions: todaySessions,
      days: [],
    });

    // User already chose Rest (planned row exists), so no prompt
    assert.equal(result.prompt, null, "No prompt when user has already chosen");
    assert.equal(result.offerRest, false, "Never offer Rest when day is already Rest");
  });

  test("Missed yesterday without a choice shows missed-yesterday prompt", () => {
    const result = deriveTodayView({
      dayType: "weights",
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      todaySessions: [],
      yesterdayDay: { day_type: "weights", label: "Push" },
      localToday: "2026-11-02",
      todayIndex: 2,
      allSessions: [],
      days: [],
    });

    assert(result.prompt !== null, "Should show prompt");
    assert.equal(result.prompt?.type, "missed-yesterday", "Should be missed-yesterday prompt");
    assert.equal(result.prompt?.heading, "You missed yesterday");
    assert(result.prompt?.intro.includes("Push"), "Intro should mention yesterday's label");
    assert.equal(result.offerRest, true, "Should offer Rest on training day");
    assert.equal(result.shouldLoadPlannableDays, true, "Should load plannable days");
  });

  test("Completed swapped-in day shows in week map as 'your choice'", () => {
    // Today is Tuesday Nov 3 (day_index 2).
    // allSessions has a completed STRENGTH session on Nov 4 (Wednesday, day_index 3).
    // Template says Wednesday is Rest, but user did Pull.
    const allSessions: SessionInput[] = [
      {
        local_date: "2026-11-04", // Wednesday (1 day after today)
        status: "completed",
        actual_type: "weights", // Must be strength to count in map
        program_day_id: "day-pull",
        created_at: "2026-11-04T10:00:00Z",
      },
    ];

    const days = [
      { id: "day-1", day_index: 1, day_type: "weights" as const, label: "Push" },
      { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Pull" },
      { id: "day-3", day_index: 3, day_type: "rest" as const, label: "Rest" },
      { id: "day-4", day_index: 4, day_type: "weights" as const, label: "Legs" },
      { id: "day-5", day_index: 5, day_type: "weights" as const, label: "Upper" },
      { id: "day-6", day_index: 6, day_type: "rest" as const, label: "Rest" },
      { id: "day-7", day_index: 7, day_type: "weights" as const, label: "Lower" },
      { id: "day-pull", day_index: 99, day_type: "weights" as const, label: "Pull" },
    ];

    const result = deriveTodayView({
      dayType: "rest",
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      todaySessions: [],
      yesterdayDay: undefined,
      localToday: "2026-11-03", // Tuesday (day_index 2)
      todayIndex: 2,
      allSessions,
      days,
    });

    // Wednesday (day_index 3) was Rest but user did Pull: should show in map
    const wednesday = result.chosenByDayIndex.get(3);
    assert.equal(wednesday, "Pull", "Wednesday should show 'Pull' (swapped choice)");
  });

  test("Training day (no missed yesterday, no rest) shows no prompt", () => {
    const result = deriveTodayView({
      dayType: "weights",
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      todaySessions: [],
      yesterdayDay: undefined,
      localToday: "2026-11-02",
      todayIndex: 2,
      allSessions: [],
      days: [],
    });

    assert.equal(result.prompt, null, "No prompt on normal training day");
    assert.equal(result.showResume, false, "No Resume on training day without open session");
    assert.equal(result.showSwap, true, "showSwap is true (only matters for rest day)");
    assert.equal(result.shouldLoadPlannableDays, false, "No plannable days needed");
  });

  test("Strength done today: no prompt, no resume", () => {
    const result = deriveTodayView({
      dayType: "weights",
      missedYesterday: false,
      strengthDone: true,
      strengthOpen: undefined,
      todaySessions: [
        { status: "completed", actual_type: "weights" },
      ],
      yesterdayDay: undefined,
      localToday: "2026-11-02",
      todayIndex: 2,
      allSessions: [],
      days: [],
    });

    assert.equal(result.prompt, null, "No prompt when strength done");
    assert.equal(result.showResume, false, "No Resume when strength done");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
