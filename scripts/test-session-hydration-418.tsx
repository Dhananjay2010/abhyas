#!/usr/bin/env tsx
/**
 * Test: Session page hydration fix (React error #418)
 *
 * Hydration mismatch when /session/* page is reloaded: CapabilityNote component
 * calls vibrationSupported() during render, which checks typeof navigator.
 * On server: navigator is undefined → returns false
 * On client: navigator may be defined → returns true
 * Result: Server renders "vibration unsupported here", client doesn't (or vice versa)
 *
 * Fix: useVibrationSupported hook returns false during SSR/initial render,
 * then updates to actual value in an effect.
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

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

console.log("Testing session hydration (React error #418)\n");

// Mock the vibrationSupported function as it exists in device.ts
const vibrationSupportedOriginal = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

// Simplified CapabilityNote component that exhibits the bug
function CapabilityNoteBuggy({ vibrateEnabled }: { vibrateEnabled: boolean }) {
  const bits: string[] = [];
  bits.push("screen kept awake");
  // This is the problematic line - calls vibrationSupported() during render
  if (vibrateEnabled && !vibrationSupportedOriginal()) {
    bits.push("vibration unsupported here");
  }
  return React.createElement("p", { className: "note" }, bits.join(" · "));
}

// Fixed version using a hook
function useVibrationSupported(): boolean {
  const [supported, setSupported] = React.useState(false);
  
  React.useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
    );
  }, []);
  
  return supported;
}

function CapabilityNoteFixed({ vibrateEnabled }: { vibrateEnabled: boolean }) {
  const bits: string[] = [];
  bits.push("screen kept awake");
  const vibrationSupported = useVibrationSupported();
  if (vibrateEnabled && !vibrationSupported) {
    bits.push("vibration unsupported here");
  }
  return React.createElement("p", { className: "note" }, bits.join(" · "));
}

// Test 1: Buggy version causes hydration mismatch
console.log("--- Testing BUGGY version (should show mismatch) ---\n");

// Server render (no navigator)
const serverHtmlBuggy = renderToString(
  React.createElement(CapabilityNoteBuggy, { vibrateEnabled: true })
);
console.log("Server HTML:", serverHtmlBuggy);
check(
  "Server renders with 'vibration unsupported here' (no navigator)",
  serverHtmlBuggy.includes("vibration unsupported here")
);

// Client render in JSDOM (has navigator, but no vibrate function)
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");

// Set up global environment for client simulation
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, "document", {
  value: dom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, "window", {
  value: dom.window,
  writable: true,
  configurable: true,
});

// Now vibrationSupportedOriginal() will return false on client too (JSDOM doesn't have vibrate)
// But in a real browser with vibration support, it would return true
// Let's simulate a browser with vibration support
Object.defineProperty(dom.window.navigator, "vibrate", {
  value: () => true,
  writable: true,
  configurable: true,
});

const clientHtmlBuggy = renderToString(
  React.createElement(CapabilityNoteBuggy, { vibrateEnabled: true })
);
console.log("Client HTML (with vibrate):", clientHtmlBuggy);

// In a browser with vibration support, vibrationSupported() returns true,
// so the condition vibrateEnabled && !vibrationSupported() is false,
// meaning "vibration unsupported here" is NOT added
check(
  "Client with vibration does NOT render 'vibration unsupported here'",
  !clientHtmlBuggy.includes("vibration unsupported here")
);

check(
  "HYDRATION MISMATCH: server and client HTML differ",
  serverHtmlBuggy !== clientHtmlBuggy
);

// Test 2: Fixed version has no hydration mismatch
console.log("\n--- Testing FIXED version (should match) ---\n");

// Reset navigator to undefined for server simulation
delete (global as any).navigator;
delete (global as any).document;
delete (global as any).window;

const serverHtmlFixed = renderToString(
  React.createElement(CapabilityNoteFixed, { vibrateEnabled: true })
);
console.log("Server HTML:", serverHtmlFixed);
check(
  "Server renders with 'vibration unsupported here' (initial state is false)",
  serverHtmlFixed.includes("vibration unsupported here")
);

// Client initial render (before effects run) should also have supported=false
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, "document", {
  value: dom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, "window", {
  value: dom.window,
  writable: true,
  configurable: true,
});
Object.defineProperty(dom.window.navigator, "vibrate", {
  value: () => true,
  writable: true,
  configurable: true,
});

const clientHtmlFixed = renderToString(
  React.createElement(CapabilityNoteFixed, { vibrateEnabled: true })
);
console.log("Client HTML (initial render):", clientHtmlFixed);
check(
  "Client initial render also has 'vibration unsupported here' (useState default is false)",
  clientHtmlFixed.includes("vibration unsupported here")
);

check(
  "NO HYDRATION MISMATCH: server and client initial HTML match",
  serverHtmlFixed === clientHtmlFixed
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
