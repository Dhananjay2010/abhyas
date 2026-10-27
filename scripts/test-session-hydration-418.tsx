#!/usr/bin/env tsx
/**
 * Test: Session page hydration fix (React error #418)
 *
 * Hydration mismatch when /session/* page is reloaded: CapabilityNote and device
 * hooks check navigator.wakeLock and navigator.vibrate during render.
 * Without the fix, server renders unsupported while client renders supported.
 *
 * This test imports the REAL hooks and CapabilityNote from src, renders on
 * server (no navigator), hydrates on client (with navigator.wakeLock and vibrate),
 * and asserts no hydration error.
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { act } from "react";
import { CapabilityNote } from "../src/app/session/[id]/session-runner.js";
import { useWakeLock, useBeeper } from "../src/lib/session/device.js";

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

// Wrapper component that uses real hooks
function CapabilityNoteWithRealHooks() {
  const wakeLock = useWakeLock(true);
  const beeper = useBeeper(false);
  return (
    <CapabilityNote
      wakeLock={wakeLock}
      soundEnabled={false}
      soundUnlocked={beeper.unlocked}
      vibrateEnabled={true}
    />
  );
}

console.log("Testing session hydration (React error #418) with REAL hooks\n");

// Step 1: Server-side render WITHOUT navigator
console.log("--- Step 1: Server render (no navigator) ---\n");

// Clean up any existing globals from the environment
const savedNavigator = Reflect.get(globalThis, "navigator");
const savedDocument = Reflect.get(globalThis, "document");
const savedWindow = Reflect.get(globalThis, "window");
Reflect.deleteProperty(globalThis, "navigator");
Reflect.deleteProperty(globalThis, "document");
Reflect.deleteProperty(globalThis, "window");

const serverHTML = renderToString(<CapabilityNoteWithRealHooks />);

console.log("Server HTML:", serverHTML);
check(
  "Server renders 'screen may sleep (wake lock unsupported)'",
  serverHTML.includes("screen may sleep (wake lock unsupported)")
);
check(
  "Server renders 'vibration unsupported here'",
  serverHTML.includes("vibration unsupported here")
);

// Step 2: Client-side hydration WITH navigator.wakeLock and vibrate
console.log("\n--- Step 2: Client hydration (with navigator support) ---\n");

const dom = new JSDOM("<!DOCTYPE html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// Set up jsdom globals
Object.defineProperty(globalThis, "window", {
  value: dom.window,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});

// Add wakeLock support to navigator
const mockSentinel = {
  released: false,
  release: () => Promise.resolve(),
  addEventListener: () => {},
  removeEventListener: () => {},
} as const;

Object.defineProperty(dom.window.navigator, "wakeLock", {
  value: {
    request: () => Promise.resolve(mockSentinel),
  },
  writable: true,
  configurable: true,
  enumerable: true,
});

// Add vibrate function to navigator
const vibrateFunc = function (_pattern: number | number[]): boolean {
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

// Capture hydration errors and console.error
const recoverableErrors: unknown[] = [];
const consoleErrors: unknown[] = [];
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  consoleErrors.push(args);
  originalConsoleError(...args);
};

// Enable React act environment
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
  configurable: true,
});

// Wrap in async IIFE to use await
(async () => {
  // Hydrate with error capture, wrapped in act()
  await act(async () => {
    hydrateRoot(
      container,
      <CapabilityNoteWithRealHooks />,
      {
        onRecoverableError: (error: unknown) => {
          recoverableErrors.push(error);
        },
      }
    );
  });

  // Restore console.error
  console.error = originalConsoleError;

  // Step 3: Assertions
  console.log("--- Step 3: Verify no hydration errors ---\n");

  // Check for hydration-related errors in recoverable errors
  const hydrationRecoverableErrors = recoverableErrors.filter((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("Hydration") ||
      message.includes("hydration") ||
      message.includes("#418") ||
      message.includes("did not match")
    );
  });

  // Check for hydration-related errors in console.error
  const hydrationConsoleErrors = consoleErrors.filter((args) => {
    const message = args instanceof Array ? args.join(" ") : String(args);
    return (
      message.includes("Hydration") ||
      message.includes("hydration") ||
      message.includes("#418") ||
      message.includes("did not match")
    );
  });

  check(
    "No hydration errors in onRecoverableError",
    hydrationRecoverableErrors.length === 0
  );
  check("No hydration errors in console.error", hydrationConsoleErrors.length === 0);

  console.log("Post-hydration HTML:", container.innerHTML);

  // After hydration, both capabilities should be detected but may not yet be activated
  // The important thing is no "unsupported" text appears
  check(
    "Post-hydration: wake lock shown as supported or acquiring",
    !container.innerHTML.includes("wake lock unsupported") &&
    (container.innerHTML.includes("screen kept awake") || 
     container.innerHTML.includes("screen may sleep"))
  );
  check(
    "Post-hydration: vibration shown as supported",
    !container.innerHTML.includes("vibration unsupported here")
  );

  // Restore original globals to prevent errors in cleanup
  if (savedNavigator !== undefined) {
    Object.defineProperty(globalThis, "navigator", {
      value: savedNavigator,
      writable: true,
      configurable: true,
    });
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
  if (savedDocument !== undefined) {
    Object.defineProperty(globalThis, "document", {
      value: savedDocument,
      writable: true,
      configurable: true,
    });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
  if (savedWindow !== undefined) {
    Object.defineProperty(globalThis, "window", {
      value: savedWindow,
      writable: true,
      configurable: true,
    });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (hydrationRecoverableErrors.length > 0 || hydrationConsoleErrors.length > 0) {
    console.error("\nHydration errors detected:");
    if (hydrationRecoverableErrors.length > 0) {
      console.error("Recoverable errors:");
      hydrationRecoverableErrors.forEach((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
      });
    }
    if (hydrationConsoleErrors.length > 0) {
      console.error("Console errors:");
      hydrationConsoleErrors.forEach((args) => {
        console.error(...(args instanceof Array ? args : [args]));
      });
    }
  }

  if (failed > 0) process.exit(1);
})();
