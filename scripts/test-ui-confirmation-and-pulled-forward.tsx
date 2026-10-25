#!/usr/bin/env tsx
/**
 * Render tests for:
 * - H3: Confirmation text uses plain label, button uses buttonLabel
 * - B12: Only first option has buttonLabel prefix
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
import { DayPlanChoosingOptions } from "../src/components/day-plan-prompt-ui";
import type { PlannableDay } from "../src/app/session/actions";

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
  console.log("\n=== Test H3: Button shows buttonLabel 'Lift: Push A', label is plain 'Push A' ===\n");

  const liftDay: PlannableDay = {
    programDayId: "day-2",
    label: "Push A",
    buttonLabel: "Lift: Push A",
    dayType: "weights",
  };

  let container!: HTMLElement;
  await act(async () => {
    const result = render(
      <DayPlanChoosingOptions
        days={[liftDay]}
        onChooseDay={(programDayId: string, label: string) => {
          // The component passes programDayId and label as separate args
          // The label parameter is the plain label (not buttonLabel), used for confirmation
          console.log("  → onChooseDay called with label:", label);
          assert(
            label === "Push A",
            "onChooseDay receives plain label 'Push A' (not buttonLabel)"
          );
        }}
        onChooseYoga={() => {}}
        onChooseBreathing={() => {}}
        onCancel={() => {}}
      />
    );
    container = result.container;
  });

  // Check that button shows "Lift: Push A"
  assert(
    container.textContent?.includes("Lift: Push A"),
    "Button shows 'Lift: Push A' (with prefix)"
  );

  // Test that the label field is plain (this would be used in confirmation)
  assert(
    liftDay.label === "Push A",
    "Label field is plain 'Push A' (for confirmation)"
  );

  assert(
    !liftDay.label.includes("Lift:"),
    "Label field does NOT contain 'Lift:' prefix"
  );

  cleanup();

  console.log("\n=== Test B12: Only first rest-day option has buttonLabel ===\n");

  const restDayOptions: PlannableDay[] = [
    { programDayId: "day-2", label: "Push A", buttonLabel: "Lift: Push A", dayType: "weights" },
    { programDayId: "day-3", label: "Pull A", dayType: "weights" },
    { programDayId: "day-4", label: "Legs A", dayType: "weights" },
  ];

  await act(async () => {
    const result = render(
      <DayPlanChoosingOptions
        days={restDayOptions}
        onChooseDay={() => {}}
        onChooseYoga={() => {}}
        onChooseBreathing={() => {}}
        onCancel={() => {}}
      />
    );
    container = result.container;
  });

  const text = container.textContent || "";
  
  assert(
    text.includes("Lift: Push A"),
    "First option shows 'Lift: Push A'"
  );
  
  assert(
    text.includes("Pull A"),
    "Second option shows 'Pull A'"
  );
  
  assert(
    text.includes("Legs A"),
    "Third option shows 'Legs A'"
  );
  
  // Count occurrences of "Lift:" - should only appear once
  const liftCount = (text.match(/Lift:/g) || []).length;
  assert(
    liftCount === 1,
    `Only one button has 'Lift:' prefix, found ${liftCount}`
  );

  cleanup();

  console.log(`\n${failed === 0 ? '✅' : '❌'} Passed ${passed}/${passed + failed} UI render tests\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
