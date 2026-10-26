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
import type { SessionListItem } from "../src/app/history/types";
import { HistoryClient } from "../src/app/history/history-client";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nL-3: History ended-early set count render test (ended-early-setcount-render)");

// Test fixture: ended-early session with sets
const items: SessionListItem[] = [
  {
    id: "session1",
    localDate: "2025-01-10",
    programDayLabel: "Day A",
    status: "in_progress",
    actualType: "weights",
    isDeload: false,
    setCount: 3,
    endedEarly: true,
    topSetWeight: null,
    volumeKg: 0,
    durationSeconds: 480,
    hasPR: false,
    startedAt: "2025-01-10T08:00:00Z",
    completedAt: null,
    plannedSets: 4,
    breathing: null,
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
        filter: "lifts" as const,
        page: 1,
        totalCount: 1,
        today: "2025-01-11",
        timezone: "America/New_York",
        units: "metric" as const,
        hasErrors: false,
      })
    );
  });

  const text = container.textContent || "";
  
  check("Component rendered", text.includes("Day A"));
  check("Status shown", text.includes("Unfinished"));
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
