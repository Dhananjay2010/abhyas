#!/usr/bin/env tsx
/**
 * Test HistoryClient '—' duration rendering with jsdom.
 *
 * Tests that formatDurationMinutes status/type wiring is correct:
 * - Completed strength with null duration shows '—'
 * - In-progress strength with null duration shows no '—'
 * - Completed yoga with null duration shows no '—'
 *
 * Dropping status/type from formatDurationMinutes call must fail this test.
 *
 *   npx tsx scripts/test-history-client-dash.tsx
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HistoryClient } from "../src/app/history/history-client";
import type { SessionListItem } from "../src/app/history/types";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting HistoryClient '—' duration rendering\n");

(async () => {

// Test 1: Completed strength session with null duration shows '—'
console.log("1. Completed strength with null duration → shows '—'");
{
  const container = document.createElement("div");
  document.body.appendChild(container);

  const items: SessionListItem[] = [
    {
      id: "session-1",
      localDate: "2024-01-15",
      status: "completed",
      actualType: "weights",
      durationSeconds: null,
      startedAt: "2024-01-15T10:00:00Z",
      completedAt: "2024-01-15T11:00:00Z",
      isDeload: false,
      endedEarly: false,
      plannedSets: 10,
      programDayLabel: "Upper A",
      setCount: 10,
      volumeKg: 5000,
      topSetWeight: 100,
      hasPR: false,
      breathing: null,
    },
  ];

  await act(async () => {
    const root = createRoot(container);
    root.render(
      <HistoryClient
        items={items}
        filter="lifts"
        page={1}
        totalCount={1}
        today="2024-01-16"
        timezone="UTC"
        units="metric"
        hasErrors={false}
      countsByFilter={{ lifts: 1, yoga: 0, breathing: 0 }}
      />
    );
  });

  const text = container.textContent || "";
  check("Contains '—' for completed strength null duration", text.includes("—"), 
    text.includes("—") ? "found '—'" : "missing '—'");

  document.body.removeChild(container);
}

// Test 2: In-progress strength session with null duration shows NO '—'
console.log("\n2. In-progress strength with null duration → no '—'");
{
  const container = document.createElement("div");
  document.body.appendChild(container);

  const items: SessionListItem[] = [
    {
      id: "session-2",
      localDate: "2024-01-15",
      status: "in_progress",
      actualType: "weights",
      durationSeconds: null,
      startedAt: "2024-01-15T10:00:00Z",
      completedAt: null,
      isDeload: false,
      endedEarly: false,
      plannedSets: 10,
      programDayLabel: "Upper A",
      setCount: 0,
      volumeKg: 0,
      topSetWeight: null,
      hasPR: false,
      breathing: null,
    },
  ];

  await act(async () => {
    const root = createRoot(container);
    root.render(
      <HistoryClient
        items={items}
        filter="lifts"
        page={1}
        totalCount={1}
        today="2024-01-16"
        timezone="UTC"
        units="metric"
        hasErrors={false}
      countsByFilter={{ lifts: 1, yoga: 0, breathing: 0 }}
      />
    );
  });

  const text = container.textContent || "";
  check("Does NOT contain '—' for in_progress", !text.includes("—"), 
    text.includes("—") ? "incorrectly shows '—'" : "correctly no '—'");

  document.body.removeChild(container);
}

// Test 3: Completed yoga session with null duration shows NO '—'
console.log("\n3. Completed yoga with null duration → no '—'");
{
  const container = document.createElement("div");
  document.body.appendChild(container);

  const items: SessionListItem[] = [
    {
      id: "session-3",
      localDate: "2024-01-15",
      status: "completed",
      actualType: "yoga",
      durationSeconds: null,
      startedAt: "2024-01-15T10:00:00Z",
      completedAt: "2024-01-15T11:00:00Z",
      isDeload: false,
      endedEarly: false,
      plannedSets: null,
      programDayLabel: null,
      setCount: 0,
      volumeKg: 0,
      topSetWeight: null,
      hasPR: false,
      breathing: null,
    },
  ];

  await act(async () => {
    const root = createRoot(container);
    root.render(
      <HistoryClient
        items={items}
        filter="yoga"
        page={1}
        totalCount={1}
        today="2024-01-16"
        timezone="UTC"
        units="metric"
        hasErrors={false}
      countsByFilter={{ lifts: 1, yoga: 0, breathing: 0 }}
      />
    );
  });

  const text = container.textContent || "";
  check("Does NOT contain '—' for yoga", !text.includes("—"), 
    text.includes("—") ? "incorrectly shows '—'" : "correctly no '—'");

  document.body.removeChild(container);
}

// Test 4: Completed strength with valid duration shows formatted time
console.log("\n4. Completed strength with 1800s → shows '30 min'");
{
  const container = document.createElement("div");
  document.body.appendChild(container);

  const items: SessionListItem[] = [
    {
      id: "session-4",
      localDate: "2024-01-15",
      status: "completed",
      actualType: "weights",
      durationSeconds: 1800,
      startedAt: "2024-01-15T10:00:00Z",
      completedAt: "2024-01-15T10:30:00Z",
      isDeload: false,
      endedEarly: false,
      plannedSets: 10,
      programDayLabel: "Upper A",
      setCount: 10,
      volumeKg: 5000,
      topSetWeight: 100,
      hasPR: false,
      breathing: null,
    },
  ];

  await act(async () => {
    const root = createRoot(container);
    root.render(
      <HistoryClient
        items={items}
        filter="lifts"
        page={1}
        totalCount={1}
        today="2024-01-16"
        timezone="UTC"
        units="metric"
        hasErrors={false}
      countsByFilter={{ lifts: 1, yoga: 0, breathing: 0 }}
      />
    );
  });

  const text = container.textContent || "";
  check("Contains '30 min' for 1800s duration", text.includes("30 min"), 
    text.includes("30 min") ? "found '30 min'" : "missing '30 min'");
  check("Does NOT contain '—' when duration is valid", !text.includes("—"),
    text.includes("—") ? "incorrectly shows '—'" : "correctly no '—'");

  document.body.removeChild(container);
}

if (failures === 0) {
  console.log("\n✅ All tests passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}

})();