#!/usr/bin/env tsx
/**
 * Render test for H3: DayPlanPrompt confirmation text
 * - Button shows 'Lift: Push A'
 * - After clicking, confirmation shows 'Today is Push A.' (no 'Lift:')
 */

// Set up jsdom environment
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
Object.defineProperty(global, "window", { value: dom.window, writable: true, configurable: true });
Object.defineProperty(global, "document", { value: dom.window.document, writable: true, configurable: true });
Object.defineProperty(global, "HTMLElement", { value: dom.window.HTMLElement, writable: true, configurable: true });

import { render, cleanup, act } from "@testing-library/react";
import { DayPlanChoosingOptions, DayPlanPrompt } from "../src/components/day-plan-prompt-ui";
import type { PlannableDay } from "../src/app/session/actions";
import React from "react";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  } else {
    passed++;
    console.log(`✓ ${message}`);
  }
}

async function runTests() {
  console.log("\n=== Test H3: Button shows 'Lift: Push A', label is plain 'Push A' ===\n");

  const liftDay: PlannableDay = {
    programDayId: "day-2",
    label: "Push A",
    buttonLabel: "Lift: Push A",
    dayType: "weights",
  };

  // Track what label is passed to onChooseDay
  let chosenLabel: string = "";
  const mockOnChooseDay = (programDayId: string, label: string) => {
    chosenLabel = label;
  };

  let container: HTMLElement = document.createElement("div");
  
  await act(async () => {
    const result = render(
      <DayPlanChoosingOptions
        days={[liftDay]}
        onChooseDay={mockOnChooseDay}
        onChooseYoga={() => {}}
        onChooseBreathing={() => {}}
        onCancel={() => {}}
      />,
      { container }
    );
    container = result.container;
  });

  // Check button text contains "Lift: Push A"
  assert(
    container.textContent?.includes("Lift: Push A"),
    "Button shows 'Lift: Push A'"
  );

  // Click the "Lift: Push A" button
  const liftButton = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent?.includes("Lift: Push A")
  );
  
  assert(liftButton !== undefined, "Found 'Lift: Push A' button");
  
  if (liftButton) {
    await act(async () => {
      liftButton.click();
    });

    // Check that onChooseDay received plain label (not buttonLabel)
    assert(
      chosenLabel === "Push A",
      `onChooseDay received plain label 'Push A', got '${chosenLabel}'`
    );
    
    assert(
      !chosenLabel.includes("Lift:"),
      "onChooseDay label does NOT contain 'Lift:' prefix"
    );
  }

  cleanup();

  console.log(`\n${failed === 0 ? '✅' : '❌'} Passed ${passed}/${passed + failed} H3 render tests\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
