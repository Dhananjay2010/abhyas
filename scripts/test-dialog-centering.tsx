#!/usr/bin/env tsx
/**
 * Test that modal dialogs have proper centering classes.
 *
 * Verifies that all <dialog> elements rendered with showModal() include:
 * - m-auto (centers the dialog in the viewport)
 * - max-w-[calc(100vw-2rem)] (prevents dialog from touching edges at narrow widths)
 *
 * Without m-auto, Tailwind 4 preflight removes the UA default margin:auto,
 * causing the dialog to render at (0,0) instead of centered.
 *
 *   npx tsx scripts/test-dialog-centering.tsx
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SessionRunner, type SessionActions } from "../src/app/session/[id]/session-runner";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeClock(startMs: number): {
  nowMs: () => number;
} {
  return {
    nowMs: () => startMs,
  };
}

console.log("\nTesting dialog centering classes\n");

(async () => {

// Test 1: End early confirmation dialog has centering classes
console.log("1. End early confirmation dialog has m-auto and max-w-[calc(100vw-2rem)]");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const clock = createFakeClock(Date.parse("2026-10-28T09:00:00Z"));

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async getSessionSummary() { return { ok: true, data: [] }; },
    async finishSession() { return { ok: true, data: { status: "completed", durationSeconds: null } }; },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [], weightPrefill: null, workingWeightKg: null, currentTargetReps: null, isBodyweight: false } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 120 * 1000).toISOString();

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-centering-test",
        sessionStatus: "in_progress" as const,
        userId: "test-user",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Bench Press",
          cue: null,
          metric: "reps",
          primaryMuscles: ["chest"],
          plannedSets: 3,
          plannedRepsMin: 8,
          plannedRepsMax: 12,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 120,
          workingWeightKg: 80,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [{ setNumber: 1, reps: 10, weightKg: 80, durationSeconds: null }],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
          units: "metric" as const,
        },
        actions: fakeActions,
        nowFn: clock.nowMs,
      })
    );
  });

  await act(async () => {});

  // Click "End session early" to open the dialog
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const endButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.includes("End session early");
    });
    check("End session early button found", endButton !== undefined);
    if (endButton) {
      endButton.click();
    }
  });

  await act(async () => {});

  // Find the dialog element
  const dialog = container.querySelector("dialog");
  check("Dialog element exists", dialog !== null);

  if (dialog) {
    const className = dialog.className;
    const hasMauto = className.includes("m-auto");
    const hasMaxWidth = className.includes("max-w-[calc(100vw-2rem)]");
    
    check("Dialog has m-auto class", hasMauto, `className: ${className}`);
    check("Dialog has max-w-[calc(100vw-2rem)] class", hasMaxWidth, `className: ${className}`);
    
    // Also check it has the other expected classes to ensure we're looking at the right dialog
    const hasRounded = className.includes("rounded-xl");
    const hasBg = className.includes("bg-surface-2");
    check("Dialog has expected styling (rounded-xl and bg-surface-2)", hasRounded && hasBg);
  }

  root.unmount();
  document.body.removeChild(container);
}

console.log("");
if (failures > 0) {
  console.log(`❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("✨ All dialog centering tests passed!");

})().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
