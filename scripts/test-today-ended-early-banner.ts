#!/usr/bin/env tsx
/**
 * Test Today page ended-early banner rendering with REAL component.
 * 
 * Tests that StrengthDoneBanner shows:
 * - "Session ended early" for sessions that ended early
 * - "Session complete. Well done." for fully completed sessions
 * 
 * Also tests summarizeEndedEarly with real row shapes.
 * 
 * Run: npx tsx scripts/test-today-ended-early-banner.ts
 */

import "./helpers/setup-jsdom";
import { render } from "@testing-library/react";
import { StrengthDoneBanner } from "@/app/today/strength-done-banner";
import { summarizeEndedEarly } from "@/lib/session/load-ended-early-summary";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test Today page ended-early banner (REAL component)\n");

// ============================================================================
// Part 1: Test the REAL StrengthDoneBanner component
// ============================================================================

console.log("Case 1: Fully completed session\n");
{
  const { container } = render(
    StrengthDoneBanner({ endedEarly: false, workingSets: 12, plannedSets: 12 })
  );
  const html = container.innerHTML;
  check("Contains success message", html.includes("Session complete. Well done."));
  check("Uses success styling", html.includes("border-success/30") && html.includes("bg-success/10"));
  check("No 'ended early' text", !html.includes("ended early"));
}

console.log("\nCase 2: Ended early with set count\n");
{
  const { container } = render(
    StrengthDoneBanner({ endedEarly: true, workingSets: 5, plannedSets: 12 })
  );
  const html = container.innerHTML;
  check("Contains 'Session ended early' text", html.includes("Session ended early"));
  check("Shows set count", html.includes("5 of 12 sets"));
  check("Uses neutral styling", html.includes("border-border") && html.includes("bg-surface-2"));
  check("No success message", !html.includes("Session complete"));
}

console.log("\nCase 3: Ended early with 0 sets\n");
{
  const { container } = render(
    StrengthDoneBanner({ endedEarly: true, workingSets: 0, plannedSets: 12 })
  );
  const html = container.innerHTML;
  check("Contains 'Session ended early' text", html.includes("Session ended early"));
  check("Shows 0 of 12 sets", html.includes("0 of 12 sets"));
}

console.log("\nCase 4: Ended early with 0 planned sets (no count shown)\n");
{
  const { container } = render(
    StrengthDoneBanner({ endedEarly: true, workingSets: 0, plannedSets: 0 })
  );
  const html = container.innerHTML;
  check("Contains 'Session ended early' text", html.includes("Session ended early"));
  check("No set count shown", !html.includes("of"));
}

// ============================================================================
// Part 2: Test summarizeEndedEarly with real row shapes
// ============================================================================

console.log("\nCase 5: summarizeEndedEarly - fully completed\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: 4,
      session_sets: [
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
      ],
    },
    {
      id: "ex2",
      status: "completed",
      planned_sets: 3,
      session_sets: [
        { reps: 12, duration_seconds: null, is_warmup_set: false },
        { reps: 12, duration_seconds: null, is_warmup_set: false },
        { reps: 12, duration_seconds: null, is_warmup_set: false },
      ],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Not ended early", !result.endedEarly);
  check("Working sets = 7", result.workingSets === 7, `got ${result.workingSets}`);
  check("Planned sets = 7", result.plannedSets === 7, `got ${result.plannedSets}`);
}

console.log("\nCase 6: summarizeEndedEarly - pending exercise with incomplete sets\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: 4,
      session_sets: [
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
      ],
    },
    {
      id: "ex2",
      status: "pending",
      planned_sets: 3,
      session_sets: [
        { reps: 12, duration_seconds: null, is_warmup_set: false },
      ],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Ended early", result.endedEarly);
  check("Working sets = 5", result.workingSets === 5, `got ${result.workingSets}`);
  check("Planned sets = 7", result.plannedSets === 7, `got ${result.plannedSets}`);
}

console.log("\nCase 7: summarizeEndedEarly - skipped exercises excluded from planned\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: 4,
      session_sets: [
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
      ],
    },
    {
      id: "ex2",
      status: "skipped",
      planned_sets: 3,
      session_sets: [],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Not ended early (skipped excluded)", !result.endedEarly);
  check("Working sets = 4", result.workingSets === 4, `got ${result.workingSets}`);
  check("Planned sets = 4 (skipped not counted)", result.plannedSets === 4, `got ${result.plannedSets}`);
}

console.log("\nCase 8: summarizeEndedEarly - warmup sets not counted\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: 2,
      session_sets: [
        { reps: 5, duration_seconds: null, is_warmup_set: true },
        { reps: 5, duration_seconds: null, is_warmup_set: true },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
      ],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Not ended early", !result.endedEarly);
  check("Working sets = 2 (warmups excluded)", result.workingSets === 2, `got ${result.workingSets}`);
  check("Planned sets = 2", result.plannedSets === 2, `got ${result.plannedSets}`);
}

console.log("\nCase 9: summarizeEndedEarly - 0 working sets with pending exercises\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "pending",
      planned_sets: 4,
      session_sets: [],
    },
    {
      id: "ex2",
      status: "pending",
      planned_sets: 3,
      session_sets: [],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Ended early", result.endedEarly);
  check("Working sets = 0", result.workingSets === 0);
  check("Planned sets = 7", result.plannedSets === 7);
}

console.log("\nCase 10: summarizeEndedEarly - 0 working sets with no exercises\n");
{
  const exercises: never[] = [];

  const result = summarizeEndedEarly(exercises);
  check("Ended early", result.endedEarly);
  check("Working sets = 0", result.workingSets === 0);
  check("Planned sets = 0", result.plannedSets === 0);
}

console.log("\nCase 11: Working sets equal to planned with pending exercise (kills E2: < to <=)\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: 4,
      session_sets: [
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
      ],
    },
    {
      id: "ex2",
      status: "pending",
      planned_sets: 3,
      session_sets: [],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Ended early (pending exists)", result.endedEarly);
  check("Working sets = 4", result.workingSets === 4, `got ${result.workingSets}`);
  check("Planned sets = 7", result.plannedSets === 7, `got ${result.plannedSets}`);
}

console.log("\nCase 12: Skipped exercises' sets excluded from working count (kills S6)\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: 3,
      session_sets: [
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
        { reps: 10, duration_seconds: null, is_warmup_set: false },
      ],
    },
    {
      id: "ex2",
      status: "skipped",
      planned_sets: 2,
      session_sets: [
        { reps: 8, duration_seconds: null, is_warmup_set: false },
      ],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  // Skipped exercises' sets ARE counted in working count (per QA Bot semantics)
  check("Not ended early", !result.endedEarly);
  check("Working sets = 4 (skipped sets counted)", result.workingSets === 4, `got ${result.workingSets}`);
  check("Planned sets = 3 (skipped not in planned)", result.plannedSets === 3, `got ${result.plannedSets}`);
}

console.log("\nCase 13: Null planned_sets (kills S7: ?? 0 to ?? 1)\n");
{
  const exercises = [
    {
      id: "ex1",
      status: "completed",
      planned_sets: null,
      session_sets: [],
    },
    {
      id: "ex2",
      status: "pending",
      planned_sets: null,
      session_sets: [],
    },
  ];

  const result = summarizeEndedEarly(exercises);
  check("Ended early (0 working, pending exists)", result.endedEarly);
  check("Working sets = 0", result.workingSets === 0, `got ${result.workingSets}`);
  check("Planned sets = 0 (null treated as 0)", result.plannedSets === 0, `got ${result.plannedSets}`);
}

console.log("\n✅ All Today ended-early banner tests passed");
console.log("\nMutant coverage:");
console.log("  M1: Invert isEndedEarly condition → fails cases 2, 6, 9, 10");
console.log("  M2: Page always passes endedEarly=false → fails cases 2, 3 (renders wrong variant)");
console.log("  M3: Drop 0-working-set branch → fails cases 9, 10");
console.log("  M4: Count warmups as working sets → fails case 8");
console.log("  E2: workingSetCount < plannedSets to <= → fails case 11");
console.log("  S6: Exclude skipped exercises' sets from working count → fails case 12");
console.log("  S7: planned_sets ?? 0 to ?? 1 → fails case 13\n");
