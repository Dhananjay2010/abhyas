#!/usr/bin/env tsx
/**
 * Test PR #169 item 7: Runner Done button shows retry on failure (RUNNER LEVEL).
 * 
 * Renders the real SessionRunner component and tests that:
 * - Cool-down Done button failing shows "Try again"
 * - Clicking "Try again" retries finishSession
 * - On success, error and "Try again" disappear
 * 
 * This kills mutant: "Done handler never sets needsFinishRetry to true"
 * (cp/restore at session-runner.tsx line ~768)
 * 
 *   npx tsx scripts/test-pr169-runner-done-retry-wiring.tsx
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

(async function main() {
  console.log("\nPR #169 item 7: Runner Done button retry wiring (RUNNER LEVEL)\n");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let finishAttempts = 0;
  const fakeActions: SessionActions = {
    async markWarmupDone() {},
    async logSet() { return { ok: true, data: { id: "set-1" } }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async getSessionSummary() { return { ok: true, data: [] }; },
    async finishSession() {
      finishAttempts++;
      if (finishAttempts === 1) {
        return { ok: false, error: "Internal Server Error" };
      }
      return { ok: true, data: { status: "completed" as const, durationSeconds: 300 } };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [], weightPrefill: null, workingWeightKg: null, currentTargetReps: null, isBodyweight: false } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-1",
        sessionStatus: "in_progress" as const,
        userId: "user-1",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: "2026-10-27T10:00:00Z",
        isStale: false,
        warmup: [],
        cooldown: [
          {
            id: "cool-1",
            phase: "stretch",
            name: "Hamstring stretch",
            instructions: [],
            duration_seconds: 30,
            slug: "hamstring-stretch",
            type: "stretch",
            target_regions: [],
            target_muscles: [],
            equipment_ids: [],
            contraindicated_regions: [],
          },
        ],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Squat",
          cue: null,
          metric: "reps" as const,
          primaryMuscles: ["quads" as const],
          plannedSets: 3,
          plannedRepsMin: 8,
          plannedRepsMax: 12,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "completed" as const,
          feel: "right" as const,
          sets: [
            { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null },
            { setNumber: 2, reps: 10, weightKg: 100, durationSeconds: null },
            { setNumber: 3, reps: 10, weightKg: 100, durationSeconds: null },
          ],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: true,
          units: "metric" as const,
        },
        actions: fakeActions,
        nowFn: Date.now,
      })
    );
  });

  await act(async () => {});

  // Should be in cool-down phase
  let text = container.textContent || "";
  check("Cool-down phase reached", text.toLowerCase().includes("cool") || text.toLowerCase().includes("done"));

  // Click Done button (which will fail)
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const doneButton = buttons.find(b => {
      const t = b.textContent;
      return t !== null && (t.includes("Done") || t.includes("Finish"));
    });
    check("Done button found", doneButton !== undefined);
    if (doneButton) (doneButton as HTMLButtonElement).click();
  });

  await act(async () => {});

  text = container.textContent || "";
  const hasTryAgain = text.includes("Try again");
  check("Try again button appears after Done fails", hasTryAgain);

  const hasError = text.includes("went wrong") || text.includes("didn't save");
  check("Error message shown", hasError);

  check("finishSession called once", finishAttempts === 1);

  // Click "Try again"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const retryButton = buttons.find(b => b.textContent?.trim() === "Try again");
    check("Try again button found", retryButton !== undefined);
    if (retryButton) (retryButton as HTMLButtonElement).click();
  });

  await act(async () => {});

  text = container.textContent || "";
  const noTryAgainAfterSuccess = !text.includes("Try again");
  check("Try again disappears after retry success", noTryAgainAfterSuccess);

  check("finishSession called twice (retry succeeded)", finishAttempts === 2);

  const hasCompleted = text.includes("complete");
  check("Summary shown after retry success", hasCompleted);

  root.unmount();
  document.body.removeChild(container);

  console.log("");
  if (failures > 0) {
    console.log(`❌ FAIL: ${failures} checks failed`);
    process.exit(1);
  }
  console.log("✨ All Done button retry wiring tests passed!");
})().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
