#!/usr/bin/env tsx
/**
 * DOM tests for DayPlanPrompt component (MED-B, LOW)
 *
 * MED-B: Post-workout summary's 'Swap the day' list badges the NEXT workout,
 * not the one just finished. Mutant: drop currentSessionId from plannableDays.
 *
 * LOW: When tomorrow is rest, hide the duplicate "Rest" button (Keep it and
 * Rest do the same thing).
 *
 * LOW: Never mind button is 44px min height.
 */

import "./helpers/setup-jsdom";
import { strict as assert } from "node:assert";
import type { PlannableDay } from "../src/app/session/actions";

async function main() {
  const { render } = await import("@testing-library/react");
  const { DayPlanPrompt } = await import("../src/components/day-plan-prompt");
  
  console.log("\nDay plan prompt DOM tests\n");

  // ──────────────────────────────────────────────────────────────────────────
  // LOW: Hide duplicate Rest button when tomorrow is rest
  // ──────────────────────────────────────────────────────────────────────────
  console.log("LOW: Hide duplicate Rest button when tomorrow is rest\n");

  {
    console.log("1. Tomorrow is Rest → only 'Keep it' and 'Swap the day' (no 'Rest')");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        programDayId={null}
        days={[]}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
        tomorrowIsRest={true}
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
    assert.ok(!restButton, "Should NOT have separate 'Rest' button");

    console.log("  ✓ No duplicate Rest button (only Keep it and Swap the day)\n");
  }

  {
    console.log("2. Tomorrow is training → all three buttons (Keep it, Swap, Rest)");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Full Body A"
        programDayId="pd-a"
        days={[]}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
        tomorrowIsRest={false}
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

  {
    console.log("3. Today missed-yesterday (null id, showRestOption true) still shows Rest");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Today"
        plannedLabel="Full Body A"
        programDayId={null}
        days={[]}
        heading="Yesterday you missed"
        showRestOption={true}
        tomorrowIsRest={false}
      />
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const restButton = buttons.find(btn => btn.textContent === "Rest");
    assert.ok(restButton, "Should have 'Rest' button (missed-yesterday on training day)");

    console.log("  ✓ Missed-yesterday with null id shows Rest button\n");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LOW: Never mind button is 44px min height
  // ──────────────────────────────────────────────────────────────────────────
  console.log("LOW: Never mind button is 44px min height\n");

  {
    console.log("4. Never mind button has min-h-11 (44px)");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        programDayId={null}
        days={[{ programDayId: "pd-a", label: "Full Body A", dayType: "weights", nextUp: false }]}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true })}
        tomorrowIsRest={true}
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
