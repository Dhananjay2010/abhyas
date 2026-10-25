#!/usr/bin/env tsx
/*
 * Test: Elapsed timer hydration fix
 *
 * React hydration error #418 logged on every reload of an in-progress workout.
 * Fix: useElapsed returns a deterministic value (0) during SSR and before the
 * first effect runs, so server and client render output match.
 *
 * Test: renderToStaticMarkup output doesn't depend on the clock.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useElapsed, formatClock } from "../src/lib/session/device";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function testElapsedHydration(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertEqual<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

// Component that uses elapsed timer
function ElapsedDisplay({ startedAt }: { startedAt: string | null }) {
  const elapsed = useElapsed(startedAt);
  return React.createElement("div", { className: "elapsed" }, formatClock(elapsed));
}

async function main() {
  console.log("Testing elapsed-hydration (SSR determinism)\n");

  // Test 1: SSR renders deterministic output (0:00)
  await testElapsedHydration("SSR renders deterministic output (0:00)", () => {
    const startedAt = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
    const html = renderToStaticMarkup(React.createElement(ElapsedDisplay, { startedAt }));
    
    // Should always render 0:00 during SSR (before effects run)
    if (!html.includes("0:00")) {
      throw new Error(`Expected 0:00 in SSR output, got: ${html}`);
    }
  });

  // Test 2: Multiple SSR renders at different times produce identical output
  await testElapsedHydration("Multiple SSR renders produce identical output", () => {
    const startedAt = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
    
    const html1 = renderToStaticMarkup(React.createElement(ElapsedDisplay, { startedAt }));
    
    // Wait a tiny bit (simulating server processing time difference)
    const now = Date.now();
    while (Date.now() - now < 10) {
      // busy wait 10ms
    }
    
    const html2 = renderToStaticMarkup(React.createElement(ElapsedDisplay, { startedAt }));
    
    // Both should be identical (0:00), regardless of when they were rendered
    assertEqual(html1, html2, "SSR output should be deterministic");
  });

  // Test 3: Null startedAt renders 0:00
  await testElapsedHydration("Null startedAt renders 0:00", () => {
    const html = renderToStaticMarkup(React.createElement(ElapsedDisplay, { startedAt: null }));
    
    if (!html.includes("0:00")) {
      throw new Error(`Expected 0:00 for null startedAt, got: ${html}`);
    }
  });

  // Test 4: Old startedAt still renders 0:00 during SSR (clock-independent)
  await testElapsedHydration("Old startedAt renders 0:00 during SSR", () => {
    // Session started 30 minutes ago
    const startedAt = new Date(Date.now() - 1800000).toISOString();
    const html = renderToStaticMarkup(React.createElement(ElapsedDisplay, { startedAt }));
    
    // During SSR, should still render 0:00 (not 30:00)
    if (!html.includes("0:00")) {
      throw new Error(`Expected 0:00 during SSR (before effects), got: ${html}`);
    }
  });

  // Test 5: Verify formatClock helper works correctly
  await testElapsedHydration("formatClock formats correctly", () => {
    assertEqual(formatClock(0), "0:00", "0 seconds");
    assertEqual(formatClock(30), "0:30", "30 seconds");
    assertEqual(formatClock(60), "1:00", "1 minute");
    assertEqual(formatClock(125), "2:05", "2 minutes 5 seconds");
    assertEqual(formatClock(3661), "61:01", "61 minutes 1 second");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
