/**
 * Test: Rest-day swap picker preselects next-in-rotation day
 * 
 * Verifies:
 * (d) A jsdom render of the rest-day swap picker has the next-in-rotation day actually preselected 
 *     (first in list) and labelled 'Next up'.
 * 
 * Run: npx tsx scripts/test-rest-day-swap-preselect-dom.tsx
 */

import "./helpers/setup-jsdom";
import { strict as assert } from "node:assert";

console.log("Test: Rest-day swap picker preselects next-in-rotation (DOM)\n");

async function main() {
  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  const { DayPlanPrompt } = await import("@/components/day-plan-prompt");

  type DayType = "weights" | "bodyweight" | "rest" | "yoga" | "meditation" | "active_recovery";
  
  type PlannableDay = {
    programDayId: string;
    label: string;
    dayType: DayType;
    nextUp?: boolean;
  };

  console.log("1. Next-in-rotation day is first in list and labeled 'Next up'");
  {
    const days: PlannableDay[] = [
      { programDayId: "day-b", label: "Full Body B", dayType: "weights" as const, nextUp: false },
      { programDayId: "day-c", label: "Full Body C", dayType: "weights" as const, nextUp: false },
      { programDayId: "day-a", label: "Full Body A", dayType: "weights" as const, nextUp: true },
    ];

    const mockPlanDay = async () => ({ ok: true as const });

    const { container } = render(
      React.createElement(DayPlanPrompt, {
        localDate: "2026-10-27",
        dayLabel: "Today",
        plannedLabel: "Rest",
        days,
        heading: "Or train today anyway",
        showRestOption: false,
        onPlan: mockPlanDay,
      })
    );

    // Click "Swap the day" to show the picker
    const swapButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Swap the day"));
    
    assert.ok(swapButton, "Should have 'Swap the day' button");
    
    await userEvent.click(swapButton);

    // Find all workout choice buttons
    const workoutButtons = Array.from(container.querySelectorAll('button'))
      .filter(b => {
        const text = b.textContent ?? "";
        return text.includes("Full Body A") || text.includes("Full Body B") || text.includes("Full Body C");
      });

    assert.ok(workoutButtons.length > 0, "Should have workout choice buttons");
    
    // First workout button should be Full Body A (nextUp)
    const firstButton = workoutButtons[0];
    assert.ok(firstButton.textContent?.includes("Full Body A"), "First button should be Full Body A");
    assert.ok(firstButton.textContent?.includes("Next up"), "First button should have 'Next up' label");
    
    console.log("  ✓ Next-in-rotation day is first and labeled 'Next up'");
    cleanup();
  }

  console.log("\n2. Next up badge only appears on the nextUp day");
  {
    const days: PlannableDay[] = [
      { programDayId: "day-a", label: "Full Body A", dayType: "weights" as const, nextUp: true },
      { programDayId: "day-b", label: "Full Body B", dayType: "weights" as const, nextUp: false },
      { programDayId: "day-c", label: "Full Body C", dayType: "weights" as const, nextUp: false },
    ];

    const mockPlanDay = async () => ({ ok: true as const });

    const { container } = render(
      React.createElement(DayPlanPrompt, {
        localDate: "2026-10-27",
        dayLabel: "Today",
        plannedLabel: "Rest",
        days,
        heading: "Or train today anyway",
        showRestOption: false,
        onPlan: mockPlanDay,
      })
    );

    // Click "Swap the day"
    const swapButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Swap the day"));
    
    assert.ok(swapButton, "Should have 'Swap the day' button");
    
    await userEvent.click(swapButton);

    // Check that only Full Body A has "Next up"
    const fullBodyAButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Full Body A"));
    const fullBodyBButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Full Body B"));
    const fullBodyCButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Full Body C"));

    assert.ok(fullBodyAButton?.textContent?.includes("Next up"), "Full Body A should have 'Next up'");
    assert.ok(!fullBodyBButton?.textContent?.includes("Next up"), "Full Body B should NOT have 'Next up'");
    assert.ok(!fullBodyCButton?.textContent?.includes("Next up"), "Full Body C should NOT have 'Next up'");
    
    console.log("  ✓ 'Next up' badge only on nextUp day");
    cleanup();
  }

  console.log("\n3. Sorting puts nextUp first regardless of input order");
  {
    const days: PlannableDay[] = [
      { programDayId: "day-c", label: "Full Body C", dayType: "weights" as const, nextUp: false },
      { programDayId: "day-a", label: "Full Body A", dayType: "weights" as const, nextUp: true },
      { programDayId: "day-b", label: "Full Body B", dayType: "weights" as const, nextUp: false },
    ];

    const mockPlanDay = async () => ({ ok: true as const });

    const { container } = render(
      React.createElement(DayPlanPrompt, {
        localDate: "2026-10-27",
        dayLabel: "Today",
        plannedLabel: "Rest",
        days,
        heading: "Or train today anyway",
        showRestOption: false,
        onPlan: mockPlanDay,
      })
    );

    const swapButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Swap the day"));
    
    assert.ok(swapButton, "Should have 'Swap the day' button");
    
    await userEvent.click(swapButton);

    const workoutButtons = Array.from(container.querySelectorAll('button'))
      .filter(b => {
        const text = b.textContent ?? "";
        return text.includes("Full Body");
      });

    // First button should be Full Body A despite being in the middle of input array
    const firstButton = workoutButtons[0];
    assert.ok(firstButton.textContent?.includes("Full Body A"), "First button should be Full Body A (nextUp)");
    
    console.log("  ✓ Sorting works regardless of input order");
    cleanup();
  }

  console.log("\n✅ All rest-day swap preselect DOM tests passed");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
