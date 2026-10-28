#!/usr/bin/env tsx
/**
 * PR #166 r5 pins for the REAL DayPlanPrompt (QA3 r4 LOW-1/3/6, X4–X6):
 *
 *   T1 (X5)  Today page: choosing Rest settles as "Today is a rest day."
 *   T2 (X6)  Today page: Retry re-runs the last choice (same plan, same date).
 *   T3 (X4, LOW-6) No Retry for the non-retryable copy, including
 *            "That day has already been and gone." and "Session not found.";
 *            Retry is offered for the generic copy.
 *   T4 (LOW-1) End of session: the choice carries the shown day; when the
 *            server refuses it and sends a new day, the prompt shows that day
 *            unsaved, and the next choice carries the new day.
 *
 *   npx tsx scripts/test-day-plan-prompt-pins.tsx
 */
import "./helpers/setup-jsdom";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { DayPlanPrompt } from "../src/components/day-plan-prompt";
import type { DayPlan, PlannableDay, PlanDayResult } from "../src/app/session/actions";
import { DAY_CHANGED_ERROR } from "../src/lib/session/resolve-plan-target-date";

export {};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const DAYS: PlannableDay[] = [
  { programDayId: "pd-u", label: "Upper", dayType: "weights" },
  { programDayId: "pd-l", label: "Lower", dayType: "weights" },
];
type Call = { sessionId?: string; shownDate?: string; localDate?: string; plan: DayPlan };

const btn = (c: HTMLElement, re: RegExp) =>
  [...c.querySelectorAll("button")].find((b) => re.test(b.textContent?.trim() ?? ""));
async function click(c: HTMLElement, re: RegExp) {
  const b = btn(c, re);
  check(`button present: ${re}`, !!b);
  if (!b) return;
  await act(async () => {
    fireEvent.click(b);
    await new Promise((r) => setTimeout(r, 20));
  });
}

function planner(results: PlanDayResult[]) {
  const calls: Call[] = [];
  const fn = async (input: Call): Promise<PlanDayResult> => {
    calls.push(input);
    return results[Math.min(calls.length - 1, results.length - 1)];
  };
  return { fn, calls };
}

(async () => {
  console.log("T1 (X5): Today page, choose Rest -> 'Today is a rest day.'");
  {
    const p = planner([{ ok: true }]);
    const { container: c, unmount } = render(
      <DayPlanPrompt localDate="2026-10-28" dayLabel="Today" plannedLabel="Upper" programDayId="pd-u"
        days={DAYS} heading="What about today?" onPlan={p.fn as never} />,
    );
    await click(c, /^Rest$/);
    const text = c.textContent ?? "";
    check("settled 'Today is a rest day.'", text.includes("Today is a rest day."), text);
    check("never 'Tomorrow is'", !text.includes("Tomorrow is"));
    check("saved with the Today date", p.calls[0]?.localDate === "2026-10-28" && p.calls[0]?.plan.kind === "rest", JSON.stringify(p.calls));
    unmount();
  }

  console.log("\nT2 (X6): Today page, Retry re-runs the last choice");
  {
    const p = planner([{ ok: false, error: "Couldn't save your choice. Please try again." }, { ok: true }]);
    const { container: c, unmount } = render(
      <DayPlanPrompt localDate="2026-10-28" dayLabel="Today" plannedLabel="Upper" programDayId="pd-u"
        days={DAYS} heading="What about today?" onPlan={p.fn as never} />,
    );
    await click(c, /^Swap the day$/);
    await click(c, /^Lower/);
    check("first attempt failed and shows the error", (c.textContent ?? "").includes("Couldn't save your choice."));
    await click(c, /^Retry$/);
    check("planDay called twice", p.calls.length === 2, JSON.stringify(p.calls));
    check("retry sends the same plan and date", JSON.stringify(p.calls[1]) === JSON.stringify(p.calls[0]) && p.calls[1]?.plan.kind === "training", JSON.stringify(p.calls));
    check("retry settled 'Today is Lower.'", (c.textContent ?? "").includes("Today is Lower."), c.textContent ?? "");
    unmount();
  }

  console.log("\nT3 (X4, LOW-6): no Retry for non-retryable copy");
  for (const msg of [
    "That day has already been and gone.",
    "That day is already done.",
    "That day is not in your block.",
    "That session has already started.",
    "Session not found.",
    DAY_CHANGED_ERROR,
  ]) {
    const p = planner([{ ok: false, error: msg }]);
    const { container: c, unmount } = render(
      <DayPlanPrompt localDate="2026-10-28" dayLabel="Today" plannedLabel="Upper" programDayId="pd-u"
        days={DAYS} heading="What about today?" onPlan={p.fn as never} />,
    );
    await click(c, /^Keep it$/);
    check(`"${msg}" shown`, (c.textContent ?? "").includes(msg));
    check(`no Retry for "${msg}"`, !btn(c, /^Retry$/));
    unmount();
  }
  {
    const p = planner([{ ok: false, error: "Could not load session." }]);
    const { container: c, unmount } = render(
      <DayPlanPrompt localDate="2026-10-28" dayLabel="Today" plannedLabel="Upper" programDayId="pd-u"
        days={DAYS} heading="What about today?" onPlan={p.fn as never} />,
    );
    await click(c, /^Keep it$/);
    check("Retry offered for a transient error", !!btn(c, /^Retry$/));
    unmount();
  }

  console.log("\nT4 (LOW-1): shown day sent; refused -> new day shown, unsaved; next choice sends the new day");
  {
    const p = planner([
      {
        ok: false,
        error: DAY_CHANGED_ERROR,
        retarget: { localDate: "2026-10-30", label: "Tomorrow", plannedLabel: "Upper", programDayId: "pd-u2", days: DAYS },
      },
      { ok: true },
    ]);
    const { container: c, unmount } = render(
      <DayPlanPrompt sessionId="s-1" shownDate="2026-10-28" dayLabel="Tomorrow" displayLabel="Today"
        plannedLabel="Rest" programDayId={null} days={DAYS} heading="What about today?"
        onPlan={p.fn as never} onRefresh={async () => undefined} />,
    );
    check("starts on 'Today: rest day.'", (c.textContent ?? "").includes("Today: rest day. Train anyway?"));
    await click(c, /^Keep rest$/);
    check("first call carries the shown day 2026-10-28", p.calls[0]?.shownDate === "2026-10-28" && p.calls[0]?.sessionId === "s-1", JSON.stringify(p.calls[0]));
    const t = c.textContent ?? "";
    check("day-changed copy shown", t.includes(DAY_CHANGED_ERROR), t);
    check("nothing settled", !t.includes("is a rest day.") && !btn(c, /^Change it$/), t);
    check("new heading 'What about tomorrow?'", t.includes("What about tomorrow?"), t);
    check("new day shown: 'Tomorrow is Upper.'", t.includes("Tomorrow is Upper."), t);
    check("old day gone", !t.includes("Today: rest day."), t);
    check("no Retry for the day-changed copy", !btn(c, /^Retry$/));
    await click(c, /^Keep it$/);
    check("second call carries the new day 2026-10-30", p.calls[1]?.shownDate === "2026-10-30", JSON.stringify(p.calls[1]));
    check("second call keeps the new day's programDayId", JSON.stringify(p.calls[1]?.plan) === JSON.stringify({ kind: "training", programDayId: "pd-u2" }), JSON.stringify(p.calls[1]?.plan));
    check("settled 'Tomorrow is Upper.'", (c.textContent ?? "").includes("Tomorrow is Upper."));
    unmount();
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All day-plan prompt pin checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
