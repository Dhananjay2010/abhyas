#!/usr/bin/env tsx
/**
 * Test: SessionRunner yoga tomorrow wiring
 * 
 * Regression test for tomorrowIsRest yoga bug: when tomorrow is yoga (dayType='yoga',
 * programDayId=null), the Rest button should still be shown (yoga is not rest).
 * 
 * Mutant killed: changing `tomorrow.dayType === "rest"` to `tomorrow.programDayId === null`
 * in session-runner.tsx would hide Rest for yoga days too.
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { strict as assert } from "node:assert";
import { SessionRunner, type SessionActions } from "../src/app/session/[id]/session-runner";

async function main() {
  console.log("\nSessionRunner yoga tomorrow wiring\n");

  const FIXED_TIME = new Date("2026-10-25T12:00:00Z").getTime();

  const baseExercises = [
    {
      id: "ex-1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps" as const,
      primaryMuscles: ["quads" as const],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 120,
      workingWeightKg: 100,
      suggestedWeightKg: null,
      status: "completed" as const,
      feel: null,
      sets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 100,
          durationSeconds: null,
        },
      ],
      isBodyweight: false,
      lastLoggedAt: null,
    },
  ];

  const baseSettings = {
    perSetLogging: false,
    restAutostart: true,
    restSound: true,
    restVibrate: true,
    restOverrideSeconds: null,
    cooldownEnabled: true,
    units: "metric" as const,
  };

  const fakeActions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: null } }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({
      ok: true,
      data: {
        metric: "reps" as const,
        repsMin: 8,
        repsMax: 12,
        equipmentIds: [],
        weightPrefill: null,
        workingWeightKg: null,
        currentTargetReps: null,
        isBodyweight: false,
      },
    }),
    planDay: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
  };

  {
    console.log("1. Tomorrow is yoga (programDayId null, dayType yoga) → Rest button shown");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SessionRunner
          sessionId="test-session"
          sessionStatus="in_progress"
          userId="test-user"
          isDeload={false}
          week={1}
          warmupAlreadyDone={true}
          startedAt={new Date(FIXED_TIME - 1800000).toISOString()}
          isStale={false}
          warmup={[]}
          cooldown={[]}
          exercises={baseExercises}
          settings={baseSettings}
          units="metric"
          actions={fakeActions}
          nowFn={() => FIXED_TIME}
          tomorrow={{
            localDate: "2026-10-26",
            plannedLabel: "Yoga",
            programDayId: null,
            dayType: "yoga",
            days: [],
            collisionResolved: false,
          }}
        />
      );
    });

    await act(async () => {});

    const doneButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Done"
    );
    assert.ok(doneButton, "Should have Done button");

    await act(async () => {
      doneButton.click();
    });

    await act(async () => {});

    const text = container.textContent || "";
    assert.ok(text.includes("Session complete"), "Should show summary");

    const buttons = Array.from(container.querySelectorAll("button"));
    const restButton = buttons.find((btn) => btn.textContent === "Rest");

    assert.ok(
      restButton,
      "Should have Rest button (yoga is not rest); changing `tomorrow.dayType === 'rest'` to `tomorrow.programDayId === null` would hide it"
    );

    root.unmount();
    document.body.removeChild(container);

    console.log("  ✓ Yoga tomorrow shows Rest button\n");
  }

  {
    console.log("2. Tomorrow is rest (programDayId null, dayType rest) → Rest button hidden");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SessionRunner
          sessionId="test-session"
          sessionStatus="in_progress"
          userId="test-user"
          isDeload={false}
          week={1}
          warmupAlreadyDone={true}
          startedAt={new Date(FIXED_TIME - 1800000).toISOString()}
          isStale={false}
          warmup={[]}
          cooldown={[]}
          exercises={baseExercises}
          settings={baseSettings}
          units="metric"
          actions={fakeActions}
          nowFn={() => FIXED_TIME}
          tomorrow={{
            localDate: "2026-10-26",
            plannedLabel: "Rest",
            programDayId: null,
            dayType: "rest",
            days: [],
            collisionResolved: false,
          }}
        />
      );
    });

    await act(async () => {});

    const doneButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Done"
    );
    assert.ok(doneButton, "Should have Done button");

    await act(async () => {
      doneButton.click();
    });

    await act(async () => {});

    const text = container.textContent || "";
    assert.ok(text.includes("Session complete"), "Should show summary");

    const buttons = Array.from(container.querySelectorAll("button"));
    const restButton = buttons.find((btn) => btn.textContent === "Rest");

    assert.ok(!restButton, "Should NOT have Rest button (duplicate of Keep it)");

    root.unmount();
    document.body.removeChild(container);

    console.log("  ✓ Rest tomorrow hides duplicate Rest button\n");
  }

  console.log("✓ All SessionRunner yoga tomorrow tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
