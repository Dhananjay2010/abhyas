#!/usr/bin/env tsx
/**
 * DOM tests for DayPlanPrompt component (MED-B, LOW)
 *
 * MED-B: Post-workout summary's 'Swap the day' list badges the NEXT workout,
 * not the one just finished. Mutant: drop currentSessionId from plannableDays.
 *
 * LOW: When tomorrow is rest, hide the duplicate "Rest" button (Keep it and
 * Rest do the same thing).
 */

import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import type { PlannableDay } from "../src/app/session/actions";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window","document","HTMLElement","Node","navigator","MouseEvent","Event","getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.self = dom.window;
(dom.window as unknown as Record<string, unknown>).requestIdleCallback ??= (cb: () => void) => setTimeout(cb, 0);

// Mock Next.js router BEFORE importing component
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "next/navigation") {
    return {
      useRouter: () => ({
        push() {},
        replace() {},
        refresh() {},
        back() {},
        forward() {},
        prefetch() {},
      }),
    };
  }
  // eslint-disable-next-line prefer-rest-params
  return originalRequire.apply(this, arguments);
};

async function main() {
  // Import AFTER mock is set up
  const { render } = await import("@testing-library/react");
  const { DayPlanPrompt } = await import("../src/components/day-plan-prompt");
  
  console.log("\nDay plan prompt DOM tests\n");

  // ──────────────────────────────────────────────────────────────────────────
  // MED-B: Post-workout summary badges the NEXT workout
  // ──────────────────────────────────────────────────────────────────────────
  console.log("MED-B: Summary badges NEXT workout (not just finished)\n");

  {
    console.log("1. 3-day Full Body: finish C → badge shows on A (not C)");

    const days: PlannableDay[] = [
      { programDayId: "pd-a", label: "Full Body A", dayType: "weights", nextUp: true },
      { programDayId: "pd-b", label: "Full Body B", dayType: "weights", nextUp: false },
      { programDayId: "pd-c", label: "Full Body C", dayType: "weights", nextUp: false },
    ];

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        programDayId={null}
        days={days}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
      />
    );

    // Find and click "Swap the day" button
    const swapButton = container.querySelector('button');
    const swapButtons = Array.from(container.querySelectorAll("button"));
    const swapBtn = swapButtons.find(b => b.textContent === "Swap the day");
    assert.ok(swapBtn, "Should find Swap the day button");
    swapBtn.click();

    // Wait for the list to appear
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check that Full Body A has the "Next up" badge
    const buttons = Array.from(container.querySelectorAll("button"));
    const aButton = buttons.find(b => b.textContent?.includes("Full Body A"));
    assert.ok(aButton, "Should find Full Body A button");
    assert.ok(aButton.textContent?.includes("Next up"), "Full Body A should have 'Next up' badge");

    // Check that Full Body C does NOT have the badge
    const cButton = buttons.find(b => b.textContent?.includes("Full Body C") && !b.textContent?.includes("Next up"));
    assert.ok(cButton, "Full Body C should NOT have 'Next up' badge");

    console.log("  ✓ A has badge, C does not (C just finished)\n");
  }

  {
    console.log("2. 6-day PPL: finish Pull → badge shows on Legs (not Pull)");

    const days: PlannableDay[] = [
      { programDayId: "pd-push", label: "Push", dayType: "weights", nextUp: false },
      { programDayId: "pd-pull", label: "Pull", dayType: "weights", nextUp: false },
      { programDayId: "pd-legs", label: "Legs", dayType: "weights", nextUp: true },
    ];

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        programDayId={null}
        days={days}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
      />
    );

    // Find and click "Swap the day"
    const swapButtons = Array.from(container.querySelectorAll("button"));
    const swapBtn = swapButtons.find(b => b.textContent === "Swap the day");
    assert.ok(swapBtn, "Should find Swap the day button");
    swapBtn.click();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Check that Legs has the badge
    const buttons = Array.from(container.querySelectorAll("button"));
    const legsButton = buttons.find(btn => btn.textContent?.includes("Legs"));
    assert.ok(legsButton, "Should find Legs button");
    assert.ok(legsButton.textContent?.includes("Next up"), "Legs should have 'Next up' badge");

    // Check that Pull does NOT have the badge
    const pullButton = buttons.find(btn => btn.textContent?.includes("Pull") && !btn.textContent?.includes("Next up"));
    assert.ok(pullButton, "Should find Pull button without badge");

    console.log("  ✓ Legs has badge, Pull does not (Pull just finished)\n");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LOW: Hide duplicate Rest button when tomorrow is rest
  // ──────────────────────────────────────────────────────────────────────────
  console.log("LOW: Hide duplicate Rest button when tomorrow is rest\n");

  {
    console.log("3. Tomorrow is Rest → only 'Keep it' and 'Swap the day' (no 'Rest')");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        programDayId={null}
        days={[]}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
      />
    );

    // Check that "Keep it" and "Swap the day" exist
    const buttons = Array.from(container.querySelectorAll("button"));
    const keepButton = buttons.find(btn => btn.textContent === "Keep it");
    const swapButton = buttons.find(btn => btn.textContent === "Swap the day");
    assert.ok(keepButton, "Should have 'Keep it' button");
    assert.ok(swapButton, "Should have 'Swap the day' button");

    // Check that "Rest" button does NOT exist
    const restButton = buttons.find(btn => btn.textContent === "Rest");
    assert.strictEqual(restButton, undefined, "Should NOT have separate 'Rest' button");

    console.log("  ✓ No duplicate Rest button (only Keep it and Swap the day)\n");
  }

  {
    console.log("4. Tomorrow is training → all three buttons (Keep it, Swap, Rest)");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Full Body A"
        programDayId="pd-a"
        days={[]}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
      />
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const keepButton = buttons.find(btn => btn.textContent === "Keep it");
    const swapButton = buttons.find(btn => btn.textContent === "Swap the day");
    const restButton = buttons.find(btn => btn.textContent === "Rest");

    assert.ok(keepButton, "Should have 'Keep it' button");
    assert.ok(swapButton, "Should have 'Swap the day' button");
    assert.ok(restButton, "Should have 'Rest' button");

    console.log("  ✓ All three buttons present (tomorrow is training)\n");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LOW: Never mind button is 44px min height
  // ──────────────────────────────────────────────────────────────────────────
  console.log("LOW: Never mind button is 44px min height\n");

  {
    console.log("5. Never mind button has min-h-11 (44px)");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        programDayId={null}
        days={[{ programDayId: "pd-a", label: "Full Body A", dayType: "weights", nextUp: false }]}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
      />
    );

    // Find and click "Swap the day" to show the list with "Never mind"
    const swapButtons = Array.from(container.querySelectorAll("button"));
    const swapBtn = swapButtons.find(b => b.textContent === "Swap the day");
    assert.ok(swapBtn, "Should find Swap the day button");
    swapBtn.click();

    await new Promise(resolve => setTimeout(resolve, 100));

    const buttons = Array.from(container.querySelectorAll("button"));
    const neverMindButton = buttons.find(b => b.textContent === "Never mind");
    assert.ok(neverMindButton, "Should find Never mind button");
    const classList = neverMindButton.className;

    assert.ok(classList.includes("min-h-11"), "Never mind button should have min-h-11 class");

    console.log("  ✓ Never mind button has min-h-11\n");
  }

  console.log("✓ All day plan prompt DOM tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
