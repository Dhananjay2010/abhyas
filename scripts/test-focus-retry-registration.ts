#!/usr/bin/env tsx
/**
 * Test: Focus/visibility retry registration (Breaks 8a-8d)
 * 
 * Tests the pure registerFocusRetry function that session-runner.tsx uses
 * to set up focus and visibility listeners for pending set retry.
 */

import { registerFocusRetry } from "../src/lib/session/focus-retry";

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting registerFocusRetry (Breaks 8a-8d)\n");

// Test 1: Registers focus listener
console.log("--- Break 8a: Focus listener registered ---");
{
  const listeners = new Map<string, (() => void)[]>();
  let retryCount = 0;

  const addEventListener = (type: string, handler: () => void) => {
    const l = listeners.get(type) ?? [];
    l.push(handler);
    listeners.set(type, l);
  };

  const removeEventListener = (type: string, handler: () => void) => {
    const handlers = listeners.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  };

  const cleanup = registerFocusRetry(addEventListener, removeEventListener, () => {
    retryCount++;
  });

  const focusListeners = listeners.get("focus");
  if (!focusListeners) throw new Error("No focus listeners registered");
  check("Focus listener registered", focusListeners.length === 1);
  check("Retry called on mount", retryCount === 1);

  // Simulate focus event
  const focusHandler = focusListeners[0];
  if (!focusHandler) throw new Error("Focus handler is undefined");
  focusHandler();
  check("Retry called on focus event", retryCount === 2);

  // Cleanup
  cleanup();
  const focusListenersAfter = listeners.get("focus");
  if (!focusListenersAfter) throw new Error("No focus listeners map after cleanup");
  check("Focus listener removed after cleanup", focusListenersAfter.length === 0);
}

// Test 2: Registers visibilitychange listener
console.log("\n--- Break 8b: Visibilitychange listener registered ---");
{
  const listeners = new Map<string, (() => void)[]>();
  let retryCount = 0;

  const addEventListener = (type: string, handler: () => void) => {
    if (!listeners.has(type)) listeners.set(type, []);
    const handlers = listeners.get(type);
    if (!handlers) throw new Error(`addEventListener (test2): No handlers array for type '${type}'`);
    handlers.push(handler);
  };

  const removeEventListener = (type: string, handler: () => void) => {
    const handlers = listeners.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  };

  // Mock document.visibilityState
  Object.defineProperty(global, "document", {
    value: { visibilityState: "visible", addEventListener, removeEventListener },
    writable: true,
    configurable: true,
  });

  retryCount = 0;
  const cleanup = registerFocusRetry(addEventListener, removeEventListener, () => {
    retryCount++;
  });

  const visListeners = listeners.get("visibilitychange");
  if (!visListeners) throw new Error("No visibilitychange listeners registered (test2)");
  check("Visibilitychange listener registered", visListeners.length === 1);

  // Simulate visibility change to visible
  const visHandler = visListeners[0];
  if (!visHandler) throw new Error("Visibilitychange handler is undefined (test2)");
  visHandler();
  check("Retry called on visibilitychange to visible", retryCount === 2); // 1 mount + 1 visibility

  // Cleanup
  cleanup();
  const visListenersAfter = listeners.get("visibilitychange");
  if (!visListenersAfter) throw new Error("No visibilitychange listeners map after cleanup (test2)");
  check("Visibilitychange listener removed after cleanup", visListenersAfter.length === 0);
}

// Test 3: Retry called once on mount (Break 8c)
console.log("\n--- Break 8c: Retry called on mount ---");
{
  let mountRetryCount = 0;

  registerFocusRetry(
    () => {},
    () => {},
    () => {
      mountRetryCount++;
    }
  );

  check("Retry called exactly once on mount", mountRetryCount === 1);
}

// Test 4: Both listeners registered once (Break 8d)
console.log("\n--- Break 8d: Focus and visibility registered once each ---");
{
  const listeners = new Map<string, (() => void)[]>();

  const addEventListener = (type: string, handler: () => void) => {
    if (!listeners.has(type)) listeners.set(type, []);
    const handlers = listeners.get(type);
    if (!handlers) throw new Error(`addEventListener (test4): No handlers array for type '${type}'`);
    handlers.push(handler);
  };

  registerFocusRetry(addEventListener, () => {}, () => {});

  check("Focus listener registered exactly once", listeners.get("focus")?.length === 1);
  check("Visibilitychange listener registered exactly once", listeners.get("visibilitychange")?.length === 1);
  check("Only 2 listener types registered", listeners.size === 2);
}

console.log(exitCode === 0 ? "\n✅ All focus/visibility registration tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
