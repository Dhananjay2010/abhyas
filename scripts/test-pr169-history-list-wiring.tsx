#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 6: History list page wiring.
 * 
 * Tests that HistoryClient (list) actually uses buildHistoryListRow and shows '<1 min'.
 * 
 * Mutant that must FAIL this test:
 * - List stops calling buildHistoryListRow and computes duration inline
 * 
 *   npx tsx scripts/test-pr169-history-list-wiring.tsx
 */

import "./helpers/setup-jsdom";
import { render } from "@testing-library/react";
import { HistoryClient } from "../src/app/history/history-client";
import type { SessionListItem } from "../src/app/history/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

(function main() {
  console.log("\nPR #169 follow-up item 6: History list wiring test\n");

  console.log("Item 6 (list wiring): HistoryClient shows '<1 min' via buildHistoryListRow");
  {
    const items: SessionListItem[] = [
      {
        id: "session-1",
        localDate: "2026-10-27",
        startedAt: "2026-10-27T10:00:00Z",
        completedAt: "2026-10-27T10:00:30Z",
        status: "completed",
        actualType: "weights",
        durationSeconds: 30,
        isDeload: false,
        endedEarly: false,
        plannedSets: 1,
        programDayLabel: "Upper Body",
        setCount: 1,
        volumeKg: 1000,
        topSetWeight: 100,
        hasPR: false,
        breathing: null,
      },
      {
        id: "session-2",
        localDate: "2026-10-26",
        startedAt: "2026-10-26T10:00:00Z",
        completedAt: "2026-10-26T10:30:00Z",
        status: "completed",
        actualType: "weights",
        durationSeconds: 1800,
        isDeload: false,
        endedEarly: false,
        plannedSets: 3,
        programDayLabel: "Lower Body",
        setCount: 3,
        volumeKg: 1200,
        topSetWeight: 120,
        hasPR: false,
        breathing: null,
      },
    ];

    const { container } = render(
      <HistoryClient
        items={items}
        filter="lifts"
        page={1}
        totalCount={2}
        today="2026-10-28"
        timezone="UTC"
        units="metric"
        hasErrors={false}
        countsByFilter={{ lifts: 2, yoga: 0, breathing: 0 }}
      />
    );

    const html = container.innerHTML;

    // Check for '<1 min' in the rendered output
    const hasLessThanOneMin = html.includes("&lt;1 min") || html.includes("<1 min");
    assert(hasLessThanOneMin, "List shows '<1 min' for 30s session");

    // Check for '30 min' in the rendered output
    const hasThirtyMin = html.includes("30 min");
    assert(hasThirtyMin, "List shows '30 min' for 1800s session");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history list wiring tests passed!");
})();
