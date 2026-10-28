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

async function main() {
  const { render } = await import("@testing-library/react");
  const { DayPlanPrompt } = await import("../src/components/day-plan-prompt");
  
  console.log("\nDay plan prompt DOM tests\n");

  // ──────────────────────────────────────────────────────────────────────────
  // LOW: Hide duplicate Rest button when tomorrow is rest
  // ──────────────────────────────────────────────────────────────────────────
  console.log("LOW: Hide duplicate Rest button when tomorrow is rest\n");

  {
    console.log("1. Tomorrow is Rest → #166 UI: 'Train anyway' and 'Keep rest' (not Keep it / Swap)");

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

    // #166 changed rest-day UI: "Tomorrow: rest day. Train anyway?" with buttons "Train anyway" and "Keep rest"
    const buttons = Array.from(container.querySelectorAll("button"));
    const trainButton = buttons.find(btn => btn.textContent === "Train anyway");
    const keepRestButton = buttons.find(btn => btn.textContent === "Keep rest");
    assert.ok(trainButton, "Should have 'Train anyway' button");
    assert.ok(keepRestButton, "Should have 'Keep rest' button");

    // Old buttons should not exist
    const keepItButton = buttons.find(btn => btn.textContent === "Keep it");
    const swapButton = buttons.find(btn => btn.textContent === "Swap the day");
    assert.ok(!keepItButton, "Should NOT have 'Keep it' button (replaced by #166 UI)");
    assert.ok(!swapButton, "Should NOT have 'Swap the day' button in rest UI");

    console.log("  ✓ #166 rest UI: Train anyway / Keep rest buttons present\n");
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
    console.log("3. Tomorrow is yoga → all three buttons (Keep it, Swap, Rest)");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Yoga"
        programDayId={null}
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
    assert.ok(restButton, "Should have 'Rest' button (yoga is not rest)");

    console.log("  ✓ All three buttons present (tomorrow is yoga, not rest)\n");
  }

  {
    console.log("4. Today missed-yesterday (null id, showRestOption true) still shows Rest");

    const { container } = render(
      <DayPlanPrompt
        localDate="2026-10-30"
        dayLabel="Today"
        plannedLabel="Full Body A"
        programDayId={null}
        days={[]}
        heading="Yesterday you missed"
        showRestOption={true}
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
    console.log("5. Never mind button has min-h-11 (44px), accessed via #166 Train anyway");

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

    // Find and click "Train anyway" (#166 rest UI) to show the list with "Never mind"
    const trainButtons = Array.from(container.querySelectorAll("button"));
    const trainBtn = trainButtons.find(b => b.textContent === "Train anyway");
    assert.ok(trainBtn, "Should find Train anyway button");
    trainBtn.click();

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
