#!/usr/bin/env tsx
/**
 * Test L-3: History rows display set count for ended-early sessions.
 *
 * Renders the actual History client component and verifies that
 * set counts are shown for in-progress sessions that ended early.
 *
 * Chain 403: L-3 render verification
 *   npx tsx scripts/test-history-ended-early-setcount-render.tsx
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { HistoryListItem } from "../src/lib/history/build-history-list-items";
import { HistoryClient } from "../src/app/history/history-client";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nL-3: History ended-early set count render test (ended-early-setcount-render)");

// Test fixture: ended-early session with sets
const items: HistoryListItem[] = [
  {
    id: "session1",
    localDate: "2025-01-10",
    label: "Day A",
    status: "in_progress",
    actualType: "weights",
    isDeload: false,
    setCount: 3,
    endedEarly: true,
    topSetWeight: null,
    volumeKg: 0,
    durationSeconds: 480,
    hasPB: false,
  },
];

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

try {
  act(() => {
    root.render(
      React.createElement(HistoryClient, {
        items,
        totalPages: 1,
        currentPage: 1,
        units: "metric" as const,
      })
    );
  });

  const text = container.textContent || "";
  
  check("Component rendered", text.includes("Day A"));
  check("Ended early text present", text.includes("Ended early"));
  check("Set count displayed", text.includes("3 sets"), `full text: ${text.substring(0, 200)}`);
  
  // The set count should be visible even though endedEarly is true
  const hasSets = /3\s+sets?/.test(text);
  check("Set count visible for ended-early session", hasSets, `text: ${text.substring(0, 300)}`);
  
} catch (error) {
  console.log(`  FAIL Exception during render: ${error}`);
  failures++;
} finally {
  root.unmount();
  document.body.removeChild(container);
}

if (failures > 0) {
  console.log(`\n❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("\n✨ All L-3 render tests passed!");
