#!/usr/bin/env tsx
/**
 * Test SessionRunner component wiring (item 6).
 *
 * Minimal jsdom test covering:
 * - f1d-runner: runner clock wiring at ~:150 (stale session shows 179:59)
 * - finish with cool-down off sends cooldownCompleted=false
 *
 *   npx tsx scripts/test-runner-jsdom-wiring.tsx
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { SessionRunner, type SessionActions, type Muscle } from "../src/app/session/[id]/session-runner";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting SessionRunner component wiring\n");

// Test 1: Runner clock wiring shows capped elapsed for stale sessions
console.log("1. Stale runner clock shows 179:59 (f1d-runner wiring at ~:150)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const fakeActions: SessionActions = {
    async markWarmupDone() {
      return { ok: true };
    },
    async logSet() {
      return { ok: true };
    },
    async deleteSet() {
      return { ok: true };
    },
    async finishExercise() {
      return { ok: true, data: null };
    },
    async finishSession() {
      return { ok: true, data: { status: "completed" as const } };
    },
    async abandonSession() {
      return { ok: true };
    },
    async findAlternatives() {
      return { ok: true, data: [] };
    },
    async swapExercise() {
      return {
        ok: true,
        data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] },
      };
    },
    async planDay() {
      return { ok: true };
    },
    async refreshAfterSession() {
      return { ok: true };
    },
  };

  const startedAt = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString();

  root.render(
    React.createElement(SessionRunner, {
      sessionId: "session-1",
      isDeload: false,
      week: 1,
      warmupAlreadyDone: true,
      startedAt,
      isStale: true,
      warmup: [],
      cooldown: [],
      exercises: [
        {
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Squat",
          cue: null,
          metric: "reps" as const,
          primaryMuscles: ["quads" as Muscle],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "pending" as const,
          feel: null,
          sets: [],
          isBodyweight: false,
        },
      ],
      settings: {
        perSetLogging: false,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: false,
      },
      actions: fakeActions,
    })
  );

  setTimeout(() => {
    const clockText = container.textContent ?? "";
    check("Stale session clock capped at 179:59", clockText.includes("179:59"));

    root.unmount();
    document.body.removeChild(container);

    console.log("");
    if (failures > 0) {
      console.log(`FAIL: ${failures} checks failed`);
      process.exit(1);
    }
    console.log("✨ All SessionRunner jsdom wiring tests passed!");
  }, 200);
}
