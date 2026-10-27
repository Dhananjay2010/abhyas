#!/usr/bin/env tsx
/**
 * Test: DayPlanPrompt rest-day variant (D7)
 *
 * When tomorrow is a rest day, the prompt shows a single-line question
 * ("Tomorrow: rest day. Train anyway?") with two choices:
 * - Train anyway → opens the training days list
 * - Keep rest → dismisses (keep behavior, no override written)
 *
 * After choosing, the settled state is the same as today ("Tomorrow is X." + Change it).
 * Non-rest days keep the original copy unchanged.
 */

import "./helpers/setup-jsdom";
import { render, fireEvent, act } from "@testing-library/react";
import { DayPlanPrompt } from "../src/components/day-plan-prompt";
import type { PlannableDay, DayPlan } from "../src/app/session/actions";

let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures++;
}

const button = (c: HTMLElement, re: RegExp) =>
  [...c.querySelectorAll("button")].find((b) => re.test(b.textContent?.trim() ?? ""));

const TRAINING_DAYS: PlannableDay[] = [
  { programDayId: "upper-1", label: "Upper", dayType: "weights" },
  { programDayId: "lower-1", label: "Lower", dayType: "weights" },
];

type PlanCall = { localDate: string; plan: DayPlan; describedAs: string };

function mockPlanDay() {
  const calls: PlanCall[] = [];
  return {
    fn: async (args: { localDate: string; plan: DayPlan }) => {
      calls.push({ localDate: args.localDate, plan: args.plan, describedAs: "" });
      return { ok: true as const };
    },
    calls,
    recordDescribedAs: (fn: (localDate: string, plan: DayPlan, describedAs: string) => Promise<{ ok: boolean }>) => {
      return async (args: { localDate: string; plan: DayPlan }) => {
        const result = await fn(args.localDate, args.plan, "");
        return result;
      };
    },
  };
}

async function click(el: Element | undefined, label: string) {
  if (!el) throw new Error(`button not found: ${label}`);
  await act(async () => {
    fireEvent.click(el);
    await new Promise((r) => setTimeout(r, 10));
  });
}

(async () => {
  console.log("DayPlanPrompt rest-day variant\n");

  console.log("Case 1: Rest day with Tomorrow label shows new single-line UI");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );
    
    const text = c.textContent ?? "";
    check("shows 'Tomorrow: rest day. Train anyway?' line", text.includes("Tomorrow: rest day. Train anyway?"));
    check("does NOT show 'Tomorrow is Rest' (old format)", !text.includes("Tomorrow is Rest"));
    check("shows 'Train anyway' button", !!button(c, /^Train anyway$/));
    check("shows 'Keep rest' button", !!button(c, /^Keep rest$/));
    check("does NOT show three-button grid (Keep it/Swap/Rest)", !button(c, /^Keep it$/));
    unmount();
  }

  console.log("\nCase 2: Train anyway opens training days list");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    
    const text = c.textContent ?? "";
    check("after Train anyway, shows Upper button", !!button(c, /^Upper$/));
    check("after Train anyway, shows Lower button", !!button(c, /^Lower$/));
    check("after Train anyway, does NOT show Yoga button", !button(c, /^Yoga$/));
    check("after Train anyway, does NOT show Breathing button", !button(c, /^Breathing$/));
    check("after Train anyway, shows 'Never mind' button", !!button(c, /^Never mind$/));

    await click(button(c, /^Upper$/), "Upper");
    await new Promise((r) => setTimeout(r, 20));
    
    check("clicking Upper calls onPlan with training plan", mock.calls.length === 1);
    check("plan is { kind: 'training', programDayId: 'upper-1' }", 
      mock.calls[0]?.plan.kind === "training" && 
      (mock.calls[0]?.plan as { kind: "training"; programDayId: string }).programDayId === "upper-1"
    );
    unmount();
  }

  console.log("\nCase 3: Keep rest dismisses (calls onPlan with keep)");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    await new Promise((r) => setTimeout(r, 20));
    
    check("clicking Keep rest calls onPlan", mock.calls.length === 1);
    check("plan is { kind: 'keep' }", mock.calls[0]?.plan.kind === "keep");
    unmount();
  }

  console.log("\nCase 4: Non-rest day (Upper) shows original copy unchanged");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="Upper"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );
    
    const text = c.textContent ?? "";
    check("shows original 'Tomorrow is Upper.' format", text.includes("Tomorrow is Upper."));
    check("does NOT show 'Tomorrow: rest day. Train anyway?'", !text.includes("Tomorrow: rest day. Train anyway?"));
    check("shows Keep it button", !!button(c, /^Keep it$/));
    check("shows Swap the day button", !!button(c, /^Swap the day$/));
    check("shows Rest button", !!button(c, /^Rest$/));
    unmount();
  }

  console.log("\nCase 5: Today label with Rest day shows original copy (not new UI)");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-27"
        dayLabel="Today"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about today?"
        showRestOption={false}
      />
    );
    
    const text = c.textContent ?? "";
    check("shows original 'Today is Rest.' format", text.includes("Today is Rest."));
    check("does NOT show 'Today: rest day. Train anyway?'", !text.includes("Today: rest day. Train anyway?"));
    check("shows Keep it button", !!button(c, /^Keep it$/));
    check("shows Swap the day button", !!button(c, /^Swap the day$/));
    check("does NOT show Rest button (showRestOption=false)", !button(c, /^Rest$/));
    unmount();
  }

  console.log("\nCase 6: After choosing, settled state shows 'Tomorrow is X.' + Change it");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    await click(button(c, /^Upper$/), "Upper");
    await new Promise((r) => setTimeout(r, 20));
    
    const text = c.textContent ?? "";
    check("settled state shows 'Tomorrow is Upper.'", text.includes("Tomorrow is Upper."));
    check("settled state shows 'Change it' button", !!button(c, /^Change it$/));
    check("settled state has green success styling", c.querySelector(".bg-success\\/10") !== null);
    unmount();
  }

  console.log("\nCase 7: Clicking 'Change it' returns to choosing state");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    await new Promise((r) => setTimeout(r, 20));
    await click(button(c, /^Change it$/), "Change it");
    await new Promise((r) => setTimeout(r, 10));
    
    const text = c.textContent ?? "";
    check("after Change it, shows training days list", !!button(c, /^Upper$/));
    check("after Change it, shows Lower button", !!button(c, /^Lower$/));
    check("after Change it, shows Never mind", !!button(c, /^Never mind$/));
    unmount();
  }

  console.log("\nCase 8: Rest with mixed-case label still shows new UI");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="Tomorrow"
        plannedLabel="rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );
    
    const text = c.textContent ?? "";
    check("'rest' (lowercase) triggers new UI", text.includes("Tomorrow: rest day. Train anyway?"));
    check("shows Train anyway button", !!button(c, /^Train anyway$/));
    unmount();
  }

  console.log("\nCase 9: Non-Tomorrow label (lowercase 'tomorrow') with Rest shows original UI");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        localDate="2026-10-28"
        dayLabel="tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );
    
    const text = c.textContent ?? "";
    check("'tomorrow' (lowercase) does NOT trigger new UI", !text.includes("tomorrow: rest day. Train anyway?"));
    check("shows original format 'tomorrow is Rest.'", text.includes("tomorrow is Rest."));
    check("shows Keep it button", !!button(c, /^Keep it$/));
    check("shows Swap the day button", !!button(c, /^Swap the day$/));
    unmount();
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All day-plan-rest-prompt checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
