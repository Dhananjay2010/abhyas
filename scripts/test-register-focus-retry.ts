#!/usr/bin/env tsx
/**
 * Behavioral test for 8d2: registerFocusRetry must register event listeners
 * and trigger retry callback on focus/visibilitychange events.
 */

import "../scripts/helpers/setup-jsdom";
import { registerFocusRetry } from "../src/lib/session/focus-retry";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n🧪 Test 8d2: registerFocusRetry event listeners\n");

try {
  let retryCount = 0;
  const retry = () => { retryCount++; };
  
  // Create a fake EventTarget to track listeners
  const listeners = new Map<string, Set<() => void>>();
  
  const addEventListener = (type: string, handler: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
  };
  
  const removeEventListener = (type: string, handler: () => void) => {
    listeners.get(type)?.delete(handler);
  };
  
  // Mock document.visibilityState
  Object.defineProperty(document, 'visibilityState', {
    writable: true,
    configurable: true,
    value: 'hidden'
  });
  
  // Register with fake event target
  const unregister = registerFocusRetry(addEventListener, removeEventListener, retry);
  
  assert(retryCount === 1, "8d2: retry called once on mount");
  assert(listeners.has("focus"), "8d2: focus listener registered");
  assert(listeners.has("visibilitychange"), "8d2: visibilitychange listener registered");
  
  // Trigger focus event
  listeners.get("focus")?.forEach(fn => fn());
  assert(retryCount === 2, "8d2: retry called on focus event");
  
  // Trigger visibilitychange when still hidden (should not call retry)
  listeners.get("visibilitychange")?.forEach(fn => fn());
  assert(retryCount === 2, "8d2: retry NOT called when document still hidden");
  
  // Change to visible and trigger
  Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
  listeners.get("visibilitychange")?.forEach(fn => fn());
  assert(retryCount === 3, "8d2: retry called on visibilitychange to visible");
  
  // Cleanup
  const focusCount = listeners.get("focus")?.size || 0;
  const visCount = listeners.get("visibilitychange")?.size || 0;
  assert(focusCount > 0, "8d2: focus listeners exist before cleanup");
  assert(visCount > 0, "8d2: visibilitychange listeners exist before cleanup");
  
  unregister();
  
  assert(listeners.get("focus")?.size === 0, "8d2: focus listener removed on cleanup");
  assert(listeners.get("visibilitychange")?.size === 0, "8d2: visibilitychange listener removed on cleanup");
  
  
  console.log(`\n✅ All assertions passed (${passed})`);
  console.log("\nMutation 8d2 killed: registerFocusRetry registers and triggers retry");
  process.exit(0);
} catch (e) {
  console.error(`\n❌ Test failed: ${e}`);
  process.exit(1);
}
