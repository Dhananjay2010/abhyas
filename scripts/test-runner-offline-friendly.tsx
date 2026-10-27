/**
 * F-1: Runner's logSet errors routed through offline-error.ts show friendly messages.
 * 
 * When logSet fails offline or with 5xx, the runner must show friendly copy
 * instead of raw "Failed to fetch" or "Internal Server Error".
 * 
 * Mutant: restore raw err.message (no offline-error routing) must fail this test.
 */

import "./helpers/setup-jsdom";

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions } from "../src/app/session/[id]/session-runner";

let exitCode = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

const FIXED_TIME = 1700000000000;

function baseExercise(id: string, name: string) {
  return {
    id,
    displayedExerciseId: id,
    name,
    plannedSets: 3,
    targetReps: { min: 8, max: 12 },
    workingWeightKg: 60,
    sets: [],
    slug: "bench_press",
    bodyweight: false,
    durationSeconds: null,
    sortOrder: 1,
  };
}

const defaultActions = {
  finishExercise: async () => ({ ok: true }),
  finishSession: async () => ({ ok: true }),
  logSet: async () => ({ ok: true }),
  deleteSet: async () => true,
  swapExercise: async () => ({ ok: true }),
} as const;

async function main() {
  // Test 1: Failed to fetch shows friendly message
  console.log("\n1. Failed to fetch shows friendly offline message");
  await (async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const offlineActions: SessionActions = {
    ...defaultActions,
    logSet: async () => {
      throw new TypeError("Failed to fetch");
    },
  };

  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-offline",
        userId: "user-offline",
        sessionStatus: "in_progress" as const,
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date(FIXED_TIME).toISOString(),
        warmup: [],
        cooldown: [],
        exercises: [baseExercise("ex1", "Bench Press")],
        settings: {
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
          units: "metric" as const,
        },
        actions: offlineActions,
        now: () => FIXED_TIME,
      })
    );
  });

  // Trigger log set by finding and clicking the log button
  await act(async () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Log set")
    );
    if (button) {
      button.click();
    }
  });

  // Wait for error to appear
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const text = container.textContent || "";
  const hasFriendlyMessage = text.includes("Saved on this device") && text.includes("will sync when you're back online");
  const hasRawError = text.includes("Failed to fetch");

  assert(hasFriendlyMessage, "Shows friendly offline message");
  assert(!hasRawError, "Raw 'Failed to fetch' NOT shown (mutant: restore raw err.message must fail this)");

  root.unmount();
  document.body.removeChild(container);
})();

// Test 2: 500 error shows friendly message
console.log("\n2. 500 error shows friendly server error message");
await (async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const serverErrorActions: SessionActions = {
    ...defaultActions,
    logSet: async () => {
      throw new Error("500 Internal Server Error");
    },
  };

  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-500",
        userId: "user-500",
        sessionStatus: "in_progress" as const,
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date(FIXED_TIME).toISOString(),
        warmup: [],
        cooldown: [],
        exercises: [baseExercise("ex1", "Bench Press")],
        settings: {
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
          units: "metric" as const,
        },
        actions: serverErrorActions,
        now: () => FIXED_TIME,
      })
    );
  });

  // Trigger log set
  await act(async () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Log set")
    );
    if (button) {
      button.click();
    }
  });

  // Wait for error to appear
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const text = container.textContent || "";
  const hasFriendlyMessage = text.includes("Server error") && text.includes("retry automatically");
  const hasRawError = text.includes("500") || text.includes("Internal Server Error");

  assert(hasFriendlyMessage, "Shows friendly 5xx message");
  assert(!hasRawError, "Raw '500 Internal Server Error' NOT shown (mutant: restore raw err.message must fail this)");

  root.unmount();
  document.body.removeChild(container);
})();

// Test 3: Error clears on successful save
console.log("\n3. Error clears on next successful save");
await (async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let shouldFail = true;
  const recoveringActions: SessionActions = {
    ...defaultActions,
    logSet: async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new TypeError("Failed to fetch");
      }
      return { ok: true };
    },
  };

  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-recover",
        userId: "user-recover",
        sessionStatus: "in_progress" as const,
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date(FIXED_TIME).toISOString(),
        warmup: [],
        cooldown: [],
        exercises: [baseExercise("ex1", "Bench Press")],
        settings: {
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
          units: "metric" as const,
        },
        actions: recoveringActions,
        now: () => FIXED_TIME,
      })
    );
  });

  // First attempt: fails
  await act(async () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Log set")
    );
    if (button) {
      button.click();
    }
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  let text = container.textContent || "";
  assert(text.includes("Saved on this device"), "Error shows after first failure");

  // Second attempt: succeeds
  await act(async () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Log set")
    );
    if (button) {
      button.click();
    }
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  text = container.textContent || "";
  assert(!text.includes("Saved on this device"), "Error cleared after successful save");

  root.unmount();
  document.body.removeChild(container);
})();

  console.log(`\n${exitCode === 0 ? "✅ All" : "❌ Some"} tests ${exitCode === 0 ? "passed" : "failed"}\n`);
  process.exit(exitCode);
}

main();
