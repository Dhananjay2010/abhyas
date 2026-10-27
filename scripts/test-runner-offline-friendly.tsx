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
import type { SessionActions, RunnerTimer } from "../src/app/session/[id]/session-runner";

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

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor || !descriptor.set) {
    throw new Error("HTMLInputElement.value setter not available");
  }
  descriptor.set.call(input, value);
}

function fillRepsInput(container: HTMLElement, value: string) {
  const inputs = Array.from(container.querySelectorAll('input[type="number"]'));
  const repsInput = inputs[0];
  if (!(repsInput instanceof HTMLInputElement)) {
    throw new Error("Expected first input to be HTMLInputElement");
  }
  setInputValue(repsInput, value);
  repsInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function createFakeTimer() {
  const callbacks: Array<() => void> = [];
  const realHandles: Array<ReturnType<typeof globalThis.setTimeout>> = [];
  const timer: RunnerTimer = {
    setTimeout: (callback: () => void, ms: number) => {
      void ms;
      const handle = globalThis.setTimeout(() => {}, 999999999);
      realHandles.push(handle);
      callbacks.push(callback);
      return handle;
    },
    clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => {
      const index = realHandles.indexOf(id);
      if (index >= 0) {
        globalThis.clearTimeout(id);
        callbacks[index] = () => {};
      }
    },
  };
  return {
    timer,
    advance: () => {
      realHandles.forEach(h => globalThis.clearTimeout(h));
      callbacks.forEach(cb => cb());
      callbacks.length = 0;
      realHandles.length = 0;
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
    plannedSets: 3,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
    workingWeightKg: 60,
    suggestedWeightKg: 60,
    status: "pending" as const,
    feel: null,
    sets: [],
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
  // Test 1: Failed to fetch shows friendly message
  console.log("\n1. Failed to fetch shows friendly offline message");
  await (async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  
  const fakeTimer = createFakeTimer();

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
        timer: fakeTimer.timer,
      })
    );
  });
  
  // Advance timer to mark component as synced
  await act(async () => {
    fakeTimer.advance();
  });
  
  // Fill in reps
  await act(async () => {
    fillRepsInput(container, "10");
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

  // Advance timer for any pending state updates
  await act(async () => {
    fakeTimer.advance();
  });

  const text = container.textContent || "";
  const hasFriendlyMessage = text.includes("You're offline") && text.includes("wasn't saved yet");
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
  
  const fakeTimer = createFakeTimer();

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
        timer: fakeTimer.timer,
      })
    );
  });
  
  // Advance timer to mark component as synced
  await act(async () => {
    fakeTimer.advance();
  });
  
  // Fill in reps
  await act(async () => {
    fillRepsInput(container, "10");
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

  // Advance timer for any pending state updates
  await act(async () => {
    fakeTimer.advance();
  });

  const text = container.textContent || "";
  const hasFriendlyMessage = text.includes("Something went wrong on our side") && text.includes("wasn't saved");
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
  
  const fakeTimer = createFakeTimer();

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
        timer: fakeTimer.timer,
      })
    );
  });
  
  // Advance timer to mark component as synced
  await act(async () => {
    fakeTimer.advance();
  });
  
  // Fill in reps
  await act(async () => {
    fillRepsInput(container, "10");
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
    fakeTimer.advance();
  });

  let text = container.textContent || "";
  assert(text.includes("You're offline") && text.includes("wasn't saved yet"), "Error shows after first failure");

  // Fill in reps again
  await act(async () => {
    fillRepsInput(container, "10");
  });

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
    fakeTimer.advance();
  });

  text = container.textContent || "";
  assert(!text.includes("You're offline") && !text.includes("wasn't saved yet"), "Error cleared after successful save");

  root.unmount();
  document.body.removeChild(container);
})();

// Test 4: run() error (finish/undo) shows honest friendly message (M6c mutant)
console.log("\n4. run() error (finish) shows honest friendly message");
await (async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  
  const fakeTimer = createFakeTimer();

  const finishErrorActions: SessionActions = {
    ...defaultActions,
    finishExercise: async () => {
      throw new Error("500 Internal Server Error");
    },
  };

  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-finish-error",
        userId: "user-finish",
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
        actions: finishErrorActions,
        now: () => FIXED_TIME,
        timer: fakeTimer.timer,
      })
    );
  });
  
  // Advance timer
  await act(async () => {
    fakeTimer.advance();
  });
  
  // Wait for component to render inputs
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  
  // Log 3 sets so Finish button appears
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      fillRepsInput(container, "10");
    });

    await act(async () => {
      const button = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Log set")
      );
      if (button) {
        button.click();
      }
    });
    
    await act(async () => {
      fakeTimer.advance();
    });
  }
  
  // Now click a feel button (Easy/Just right/Hard) to finish and trigger the error
  await act(async () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Just right")
    );
    if (button) {
      button.click();
    }
  });

  await act(async () => {
    fakeTimer.advance();
  });
  
  // Wait for error state to render
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });

  const text = container.textContent || "";
  const hasFriendlyMessage = text.includes("Something went wrong on our side") && text.includes("wasn't saved");
  const hasRawError = text.includes("500") || text.includes("Internal Server Error");

  assert(hasFriendlyMessage, "Shows friendly message for run() errors");
  assert(!hasRawError, "Raw '500 Internal Server Error' NOT shown (mutant M6c: restore raw err.message must fail this)");

  root.unmount();
  document.body.removeChild(container);
})();

  console.log(`\n${exitCode === 0 ? "✅ All" : "❌ Some"} tests ${exitCode === 0 ? "passed" : "failed"}\n`);
  process.exit(exitCode);
}

main();
