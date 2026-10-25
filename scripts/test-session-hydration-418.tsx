#!/usr/bin/env tsx
/**
 * Test: Session page hydration fix (React error #418)
 *
 * Hydration mismatch when /session/* page is reloaded: CapabilityNote component
 * calls vibrationSupported() during render via useVibrationSupported hook.
 * Without the fix, server would differ from client's initial render.
 *
 * This test imports the REAL useVibrationSupported and CapabilityNote from src,
 * renders on server (no navigator), hydrates on client (with navigator.vibrate),
 * and asserts no hydration error.
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { CapabilityNote } from "../src/app/session/[id]/session-runner.js";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ ${label}`);
    failed++;
  }
}

console.log("Testing session hydration (React error #418) with REAL src code\n");

// Step 1: Server-side render WITHOUT navigator
console.log("--- Step 1: Server render (no navigator) ---\n");

// Clean up any existing globals from the environment
const savedNavigator = (global as { navigator?: unknown }).navigator;
const savedDocument = (global as { document?: unknown }).document;
const savedWindow = (global as { window?: unknown }).window;
Reflect.deleteProperty(global, "navigator");
Reflect.deleteProperty(global, "document");
Reflect.deleteProperty(global, "window");

const serverHTML = renderToString(
  <CapabilityNote
    wakeLock={{ supported: true, active: true, error: null }}
    soundEnabled={false}
    soundUnlocked={false}
    vibrateEnabled={true}
  />
);

console.log("Server HTML:", serverHTML);
check(
  "Server renders with 'vibration unsupported here'",
  serverHTML.includes("vibration unsupported here")
);

// Step 2: Client-side hydration WITH navigator.vibrate
console.log("\n--- Step 2: Client hydration (with navigator.vibrate) ---\n");

const dom = new JSDOM("<!DOCTYPE html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// Set up jsdom globals with vibration support
Object.defineProperty(global, "window", {
  value: dom.window,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, "document", {
  value: dom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});

// Add vibrate function to navigator (simulating a browser that supports vibration)
const vibrateFunc = function (pattern: number | number[]): boolean {
  return true;
};
Object.defineProperty(dom.window.navigator, "vibrate", {
  value: vibrateFunc,
  writable: true,
  configurable: true,
  enumerable: true,
});

// Inject server HTML into container
const container = dom.window.document.getElementById("root");
if (!container) throw new Error("Container not found");
container.innerHTML = serverHTML;

// Capture hydration errors
const recoverableErrors: unknown[] = [];

// Hydrate with error capture
hydrateRoot(
  container,
  <CapabilityNote
    wakeLock={{ supported: true, active: true, error: null }}
    soundEnabled={false}
    soundUnlocked={false}
    vibrateEnabled={true}
  />,
  {
    onRecoverableError: (error: unknown) => {
      recoverableErrors.push(error);
    },
  }
);

// Step 3: Assertions
console.log("--- Step 3: Verify no hydration errors ---\n");

// Check for hydration-related errors
const hydrationErrors = recoverableErrors.filter((error) => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Hydration") ||
    message.includes("hydration") ||
    message.includes("#418") ||
    message.includes("did not match")
  );
});

check("No hydration errors detected", hydrationErrors.length === 0);

// The initial render should still have "vibration unsupported here" because
// useVibrationSupported returns false on initial render (getServerSnapshot)
check(
  "Container still has 'vibration unsupported here' after hydration",
  container.innerHTML.includes("vibration unsupported here")
);

// Restore original globals to prevent errors in cleanup
if (savedNavigator !== undefined) {
  Object.defineProperty(global, "navigator", {
    value: savedNavigator,
    writable: true,
    configurable: true,
  });
}
if (savedDocument !== undefined) {
  Object.defineProperty(global, "document", {
    value: savedDocument,
    writable: true,
    configurable: true,
  });
}
if (savedWindow !== undefined) {
  Object.defineProperty(global, "window", {
    value: savedWindow,
    writable: true,
    configurable: true,
  });
}

console.log(`\n${passed} passed, ${failed} failed`);

if (hydrationErrors.length > 0) {
  console.error("\nHydration errors detected:");
  hydrationErrors.forEach((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
  });
}

if (failed > 0) process.exit(1);
