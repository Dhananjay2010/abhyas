#!/usr/bin/env tsx
/**
 * Test M6c: run() must use runnerErrorMessage with kind='action'
 */

import "./helpers/setup-jsdom";
import { render, act, screen } from "@testing-library/react";
import React from "react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions } from "../src/app/session/[id]/session-runner";

const FIXED_TIME = 1700000000000;

function createFakeTimer() {
  const callbacks: Array<() => void> = [];
  const realHandles: Array<ReturnType<typeof globalThis.setTimeout>> = [];
  const timer = {
    setTimeout: (callback: () => void, ms: number) => {
      callbacks.push(callback);
      const handle = globalThis.setTimeout(() => {}, 999999);
      realHandles.push(handle);
      return handle;
    },
    clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => {
      const idx = realHandles.indexOf(id);
      if (idx >= 0) {
        realHandles.splice(idx, 1);
        callbacks.splice(idx, 1);
        globalThis.clearTimeout(id);
      }
    },
  };
  return {
    timer,
    advance: () => {
      const cbs = [...callbacks];
      callbacks.length = 0;
      cbs.forEach(cb => cb());
    },
  };
}

function baseExercise(id: string, name: string) {
  return {
    id,
    exerciseId: `exercise-${id}`,
    name,
    cue: null,
    metric: "reps" as const,
    primaryMuscles: [],
    plannedSets: 1,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
    workingWeightKg: 60,
    suggestedWeightKg: 60,
    status: "in-progress" as const,
    feel: null,
    sets: [{
      id: "set-1",
      setNumber: 1,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
      targetRepsMin: 8,
      targetRepsMax: 12,
    }],
    isBodyweight: false,
  };
}

const defaultActions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => ({ ok: true }),
  deleteSet: async () => ({ ok: true }),
  finishExercise: async () => ({ ok: true, data: null }),
  finishSession: async () => ({ ok: true }),
  abandonSession: async () => ({ ok: true }),
  findAlternatives: async () => ({ ok: true, data: [] }),
  swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [], weightPrefill: null, workingWeightKg: null, currentTargetReps: null, isBodyweight: false } }),
  refreshAfterSession: async () => ({ ok: true }),
  planDay: async () => ({ ok: true }),
  getSessionSummary: async () => ({ ok: true, data: [] }),
};

async function main() {
console.log("\n📋 M6c: run() errors use runnerErrorMessage with kind='action'\n");

const container = document.createElement("div");
document.body.appendChild(container);

const fakeTimer = createFakeTimer();

// Test: Undo (deleteSet) throws 5xx error, should show action-specific friendly message
const actions: SessionActions = {
  ...defaultActions,
  deleteSet: async () => {
    throw new Error("status 500");
  },
};

const root = require("react-dom/client").createRoot(container);
await act(async () => {
  root.render(
    React.createElement(SessionRunner, {
      sessionId: "sess-m6c",
      userId: "user-m6c",
      sessionStatus: "in_progress" as const,
      isDeload: false,
      week: 1,
      warmupAlreadyDone: true,
      startedAt: new Date(FIXED_TIME).toISOString(),
      warmup: [],
      cooldown: [],
      exercises: [baseExercise("ex1", "Bench Press")],
      settings: {
        perSetLogging: false,
        restAutostart: false,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: false,
        units: "metric" as const,
      },
      actions,
      now: () => FIXED_TIME,
      timer: fakeTimer.timer,
    })
  );
});

// Find and click Undo button
await act(async () => {
  const buttons = Array.from(document.querySelectorAll("button"));
  const undoButton = buttons.find(b => b.textContent?.includes("Undo"));
  if (undoButton) {
    undoButton.click();
  }
});

// Wait for error
await act(async () => {
  await Promise.resolve();
});

const text = container.textContent || "";
console.log("Container text:", text.substring(0, 300));

// Should show action-specific message (not set-specific)
const hasActionMessage = text.includes("Something went wrong on our side. Please try again.");
const hasSetMessage = text.includes("That set wasn't saved");
const hasRawError = text.includes("status 500");

console.log("\nAssertion checks:");
console.log("  Has action message:", hasActionMessage);
console.log("  Has set message:", hasSetMessage);  
console.log("  Has raw error:", hasRawError);

if (!hasActionMessage) {
  console.error("\n❌ FAIL: Should show action-specific message");
  console.error("   Expected: 'Something went wrong on our side. Please try again.'");
  console.error("   (Mutant M6c: reverting to raw error.message would fail this)");
  process.exit(1);
}

if (hasSetMessage) {
  console.error("\n❌ FAIL: Should NOT show set-specific message");
  process.exit(1);
}

if (hasRawError) {
  console.error("\n❌ FAIL: Should NOT show raw 'status 500'");
  process.exit(1);
}

console.log("\n✅ PASS: run() errors use action-specific friendly copy\n");

root.unmount();
document.body.removeChild(container);
process.exit(0);
}

main();
