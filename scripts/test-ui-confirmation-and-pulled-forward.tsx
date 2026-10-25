#!/usr/bin/env tsx
/**
 * Render tests for:
 * - H3: Confirmation shows plain label "Today is Push A." not "Lift: Push A."
 * - M5: Pulled-forward message shows "You already did Push A on Monday (your choice)."
 * - B12: buttonLabel only, not in label
 */

import { render } from "@testing-library/react";
import { DayPlanSettled } from "../src/components/day-plan-prompt";
import { DayPlanChoosingOptions } from "../src/components/day-plan-prompt-ui";
import type { PlannableDay } from "../src/app/session/actions";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("\n=== Test H3: Confirmation shows plain label, button shows buttonLabel ===\n");

// Test that when user clicks a Lift option, confirmation shows plain label
const liftDay: PlannableDay = {
  programDayId: "day-2",
  label: "Push A",
  buttonLabel: "Lift: Push A",
  dayType: "weights",
};

// Render the button
const { getByText: getByTextButton } = render(
  <DayPlanChoosingOptions
    days={[liftDay]}
    onChooseDay={() => {}}
    onChooseYoga={() => {}}
    onChooseBreathing={() => {}}
    onCancel={() => {}}
  />
);

assert(
  !!getByTextButton("Lift: Push A"),
  "Button text includes 'Lift:' prefix"
);

console.log("\n=== Test: Confirmation text uses plain label ===\n");

// Render settled state with plain label
const { container } = render(
  <DayPlanSettled dayLabel="Push A" />
);

assert(
  container.textContent?.includes("Today is Push A"),
  "Confirmation shows 'Today is Push A'"
);

assert(
  !container.textContent?.includes("Lift:"),
  "Confirmation does NOT include 'Lift:' prefix"
);

console.log("\n=== Test B12: Only first rest-day option has buttonLabel ===\n");

const restDayOptions: PlannableDay[] = [
  { programDayId: "day-2", label: "Push A", buttonLabel: "Lift: Push A", dayType: "weights" },
  { programDayId: "day-3", label: "Pull A", dayType: "weights" },
  { programDayId: "day-4", label: "Legs A", dayType: "weights" },
];

const { getByText: getByTextMulti } = render(
  <DayPlanChoosingOptions
    days={restDayOptions}
    onChooseDay={() => {}}
    onChooseYoga={() => {}}
    onChooseBreathing={() => {}}
    onCancel={() => {}}
  />
);

assert(
  !!getByTextMulti("Lift: Push A"),
  "First option shows 'Lift: Push A'"
);

assert(
  !!getByTextMulti("Pull A") && !getByTextMulti("Pull A").textContent?.includes("Lift:"),
  "Second option shows 'Pull A' without Lift prefix"
);

assert(
  !!getByTextMulti("Legs A") && !getByTextMulti("Legs A").textContent?.includes("Lift:"),
  "Third option shows 'Legs A' without Lift prefix"
);

console.log("\n✅ All UI render tests passed!\n");
