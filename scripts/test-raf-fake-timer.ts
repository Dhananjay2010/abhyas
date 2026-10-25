#!/usr/bin/env tsx
/**
 * Test: requestAnimationFrame must be driven by injected fake timers
 *
 * Proves that setup-jsdom's rAF polyfill uses the same timer infrastructure
 * as setTimeout, so tests with fake timers control both.
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    console.log(`  ok   ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

console.log("\nTesting that rAF is driven by fake timers (not real async)\n");

// Test 1: rAF does not fire without advancing fake timer
console.log("1. rAF callback does NOT fire immediately with fake timer");
{
  let rafFired = false;
  const callbacks = new Map<number, () => void>();
  let nextId = 1;

  const fakeTimer = {
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => {
      callbacks.delete(id);
    },
  };

  // Inject fake timer globally
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  
  (global as any).setTimeout = fakeTimer.setTimeout;
  (global as any).clearTimeout = fakeTimer.clearTimeout;

  // Call rAF - it should use setTimeout(0) internally
  requestAnimationFrame(() => {
    rafFired = true;
  });

  // Callback should NOT have fired yet (no real async hop)
  check("rAF callback has not fired without advancing", !rafFired);

  // Advance fake timer
  const pending = Array.from(callbacks.values());
  callbacks.clear();
  pending.forEach(cb => cb());

  // Now it should have fired
  check("rAF callback fires after advancing fake timer", rafFired);

  // Restore
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
}

// Test 2: Multiple rAF callbacks work with fake timer
console.log("\n2. Multiple rAF callbacks controlled by fake timer");
{
  const fired: number[] = [];
  const callbacks = new Map<number, () => void>();
  let nextId = 1;

  const fakeTimer = {
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => {
      callbacks.delete(id);
    },
  };

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  
  (global as any).setTimeout = fakeTimer.setTimeout;
  (global as any).clearTimeout = fakeTimer.clearTimeout;

  requestAnimationFrame(() => fired.push(1));
  requestAnimationFrame(() => fired.push(2));
  requestAnimationFrame(() => fired.push(3));

  check("No callbacks fired before advancing", fired.length === 0);

  // Advance once
  const pending = Array.from(callbacks.values());
  callbacks.clear();
  pending.forEach(cb => cb());

  check("All 3 callbacks fired after one advance", fired.length === 3);
  check("Callbacks fired in order", fired[0] === 1 && fired[1] === 2 && fired[2] === 3);

  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
}

// Test 3: cancelAnimationFrame works with fake timer
console.log("\n3. cancelAnimationFrame prevents callback");
{
  let rafFired = false;
  const callbacks = new Map<number, () => void>();
  let nextId = 1;

  const fakeTimer = {
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => {
      callbacks.delete(id);
    },
  };

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  
  (global as any).setTimeout = fakeTimer.setTimeout;
  (global as any).clearTimeout = fakeTimer.clearTimeout;

  const rafId = requestAnimationFrame(() => {
    rafFired = true;
  });

  cancelAnimationFrame(rafId);

  // Advance timer
  const pending = Array.from(callbacks.values());
  callbacks.clear();
  pending.forEach(cb => cb());

  check("Cancelled rAF callback did not fire", !rafFired);

  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ rAF is properly driven by fake timers!");
