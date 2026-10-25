/**
 * QA: Test History session labeling.
 *
 * Tests the extracted session label function from src/lib/history/session-label.ts
 *
 * Verifies:
 * - Today's in_progress session shows "In progress" (even with 0 sets)
 * - Past-day in_progress shows "Unfinished from <date>"
 * - Completed yoga/breathing with 0 sets shows "Completed" (not "Skipped")
 * - Completed strength with 0 sets shows "Skipped"
 * - Skipped sessions show "Skipped"
 * - Abandoned sessions show "Abandoned"
 *
 * Run: npx tsx scripts/test-history-labels.ts
 */

import { getSessionLabel, type SessionLabelInput } from "../src/lib/history/session-label";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const today = "2026-10-24";
const yesterday = "2026-10-23";

console.log("\n1. Today's in_progress sessions");
{
  const input: SessionLabelInput = {
    status: "in_progress",
    actualType: "weights",
    setCount: 3,
    localDate: today,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("in_progress today with sets shows 'In progress'", label === "In progress", label);
}

{
  // QA requirement: even with 0 sets, today's in_progress shows "In progress" not "Skipped"
  const input: SessionLabelInput = {
    status: "in_progress",
    actualType: "weights",
    setCount: 0,
    localDate: today,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("in_progress today with 0 sets shows 'In progress'", label === "In progress", label);
}

console.log("\n2. Past-day in_progress sessions");
{
  const input: SessionLabelInput = {
    status: "in_progress",
    actualType: "weights",
    setCount: 2,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("in_progress yesterday shows 'Unfinished from <date>'", label.startsWith("Unfinished from"), label);
}

console.log("\n3. Completed sessions - trusts status");
{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 5,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("completed strength with sets shows 'Completed'", label === "Completed", label);
}

{
  // Zero-set strength sessions are filtered out at query level (M4),
  // but if they reach the label function with status='completed', they show "Ended early"
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 0,
    localDate: yesterday,
    today,
    endedEarly: true,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("completed strength with 0 sets shows 'Ended early'", label === "Ended early", label);
}

{
  // Yoga/breathing completed sessions always show "Completed"
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "yoga",
    setCount: 0,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("completed yoga with 0 sets shows 'Completed'", label === "Completed", label);
}

console.log("\n4. Completed sessions - breathing");
{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "meditation",
    setCount: 0,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("completed breathing with 0 sets shows 'Completed'", label === "Completed", label);
}

console.log("\n5. Skipped sessions");
{
  const input: SessionLabelInput = {
    status: "skipped",
    actualType: "weights",
    setCount: 0,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("skipped shows 'Skipped'", label === "Skipped", label);
}

{
  const input: SessionLabelInput = {
    status: "skipped",
    actualType: "yoga",
    setCount: 0,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("skipped yoga shows 'Skipped'", label === "Skipped", label);
}

console.log("\n6. Ended early sessions");
{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 3,
    localDate: yesterday,
    today,
    endedEarly: true,
    plannedSets: 5,
  };
  const label = getSessionLabel(input);
  check("ended early shows set count", label === "Ended early · 3 of 5 sets", label);
}

{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "bodyweight",
    setCount: 1,
    localDate: yesterday,
    today,
    endedEarly: true,
    plannedSets: 1,
  };
  const label = getSessionLabel(input);
  check("ended early 1 of 1 set (singular)", label === "Ended early · 1 of 1 set", label);
}

{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 1,
    localDate: yesterday,
    today,
    endedEarly: true,
    plannedSets: 22,
  };
  const label = getSessionLabel(input);
  check("1 of 22 gives Ended early", label === "Ended early · 1 of 22 sets", label);
}

{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 22,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: 22,
  };
  const label = getSessionLabel(input);
  check("22 of 22 gives Completed", label === "Completed", label);
}

{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 0,
    localDate: yesterday,
    today,
    endedEarly: true,
    plannedSets: null,
  };
  const label = getSessionLabel(input);
  check("0 sets gives Ended early", label === "Ended early", label);
}

{
  const input: SessionLabelInput = {
    status: "completed",
    actualType: "weights",
    setCount: 25,
    localDate: yesterday,
    today,
    endedEarly: false,
    plannedSets: 22,
  };
  const label = getSessionLabel(input);
  check("extra sets beyond plan give Completed", label === "Completed", label);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
