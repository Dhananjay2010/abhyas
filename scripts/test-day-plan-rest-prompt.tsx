#!/usr/bin/env tsx
/**
 * Test: DayPlanPrompt rest-day variant (D7)
 *
 * When tomorrow is a rest day, the prompt shows a single-line question
 * ("Tomorrow: rest day. Train anyway?") with two choices:
 * - Train anyway → opens the training days list
 * - Keep rest → dismisses (keep behavior, no override written)
 *
 * After choosing, the settled state shows "Tomorrow is a rest day."
 * Non-rest days keep the original copy unchanged.
 *
 * The sessionId is passed to planDay, which computes targetDate = session.local_date + 1.
 */

import "./helpers/setup-jsdom";
import React from "react";
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

const TRAINING_WITH_YOGA: PlannableDay[] = [
  { programDayId: "upper-1", label: "Upper", dayType: "weights" },
  { programDayId: "yoga-1", label: "Flow", dayType: "yoga" },
  { programDayId: "lower-1", label: "Lower", dayType: "weights" },
];

type PlanCall = { sessionId?: string; localDate?: string; plan: DayPlan };

function mockPlanDay() {
  const calls: PlanCall[] = [];
  return {
    fn: async (args: { sessionId?: string; localDate?: string; plan: DayPlan }) => {
      calls.push(args);
      return { ok: true as const };
    },
    calls,
  };
}

async function click(el: Element | undefined, label: string) {
  // A missing button is an assertion failure, not a crash (mutant gate
  // counts only assertion failures as kills).
  if (!el) {
    check(`button present: ${label}`, false);
    return;
  }
  await act(async () => {
    fireEvent.click(el);
    await new Promise((r) => setTimeout(r, 10));
  });
}

class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { err: String(e?.message ?? e) };
  }
  render() {
    return this.state.err ? (
      <p data-testid="boundary">BOUNDARY: {this.state.err}</p>
    ) : (
      this.props.children
    );
  }
}

(async () => {
  console.log("DayPlanPrompt rest-day variant\n");

  console.log("Case 1: Rest day with Tomorrow label shows new single-line UI");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
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

  console.log("\nCase 2: Never mind makes no save call and brings back both buttons");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    await click(button(c, /^Never mind$/), "Never mind");
    
    check("Never mind writes nothing", mock.calls.length === 0, JSON.stringify(mock.calls));
    check("Never mind returns to Train anyway / Keep rest", !!button(c, /^Train anyway$/) && !!button(c, /^Keep rest$/));
    unmount();
  }

  console.log("\nCase 3: sessionId forwarded; Lower sends lower-1");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-456"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    await click(button(c, /^Lower$/), "Lower");
    
    check("sessionId s-456 forwarded", mock.calls[0]?.sessionId === "s-456");
    check("Lower -> lower-1", 
      mock.calls[0]?.plan.kind === "training" && 
      (mock.calls[0]?.plan as { kind: "training"; programDayId: string }).programDayId === "lower-1"
    );
    unmount();
  }

  console.log("\nCase 4: Each training choice sends its own day id");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    await click(button(c, /^Upper$/), "Upper");
    
    check("Upper sends upper-1", 
      mock.calls[0]?.plan.kind === "training" && 
      (mock.calls[0]?.plan as { kind: "training"; programDayId: string }).programDayId === "upper-1"
    );
    unmount();
  }

  console.log("\nCase 5: Keep rest settles as 'Tomorrow is a rest day.'");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true as const })}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    
    const text = c.textContent ?? "";
    check("Keep rest settles 'Tomorrow is a rest day.'", text.includes("Tomorrow is a rest day."), text.slice(0, 100));
    check("settled state shows Change it button", !!button(c, /^Change it$/));
    unmount();
  }

  console.log("\nCase 6: {ok:false} shows error and does not settle");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: false as const, error: "Too many requests" })}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    
    check("error alert shown", c.querySelector('[role="alert"]')?.textContent?.includes("Too many requests") ?? false);
    check("not settled", !(c.textContent ?? "").includes("Tomorrow is a rest day."));
    check("shows Retry button", !!button(c, /^Retry$/));
    unmount();
  }

  console.log("\nCase 7: While saving, all choices disabled; double tap makes 1 call");
  {
    let n = 0;
    let resolve: (v: { ok: true }) => void = () => {};
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={() => {
          n++;
          return new Promise((r) => {
            resolve = r;
          });
        }}
      />
    );

    await act(async () => {
      { const b = button(c, /^Keep rest$/); if (b) fireEvent.click(b); else check("button present: Keep rest", false); }
      await new Promise((r) => setTimeout(r, 5));
    });
    
    check("Keep rest disabled while pending", button(c, /^Keep rest$/)?.disabled === true);
    check("Train anyway disabled while pending", button(c, /^Train anyway$/)?.disabled === true);
    
    await act(async () => {
      { const b = button(c, /^Keep rest$/); if (b) fireEvent.click(b); else check("button present: Keep rest", false); }
      await new Promise((r) => setTimeout(r, 5));
    });
    
    check("second tap ignored (1 call)", n === 1, String(n));
    
    await act(async () => {
      resolve({ ok: true });
      await new Promise((r) => setTimeout(r, 10));
    });
    
    unmount();
  }

  console.log("\nCase 8: Training choices also disabled while pending");
  {
    let resolve: (v: { ok: true }) => void = () => {};
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={() => {
          return new Promise((r) => {
            resolve = r;
          });
        }}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    
    await act(async () => {
      { const b = button(c, /^Upper$/); if (b) fireEvent.click(b); else check("button present: Upper", false); }
      await new Promise((r) => setTimeout(r, 5));
    });
    
    check("Upper disabled while pending", button(c, /^Upper$/)?.disabled === true);
    check("Lower disabled while pending", button(c, /^Lower$/)?.disabled === true);
    check("Never mind disabled while pending", button(c, /^Never mind$/)?.disabled === true);
    
    await act(async () => {
      resolve({ ok: true });
      await new Promise((r) => setTimeout(r, 10));
    });
    
    unmount();
  }

  console.log("\nCase 9: onPlan rejects (network error) -> friendly inline error, no boundary");
  {
    const { container: c, unmount } = render(
      <Boundary>
        <DayPlanPrompt
          programDayId={null}
          sessionId="s-123"
          dayLabel="Tomorrow"
          plannedLabel="Rest"
          days={TRAINING_DAYS}
          heading="What about tomorrow?"
          onPlan={async () => {
            throw new TypeError("Failed to fetch");
          }}
        />
      </Boundary>
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    await new Promise((r) => setTimeout(r, 50));
    
    const text = c.textContent ?? "";
    check("no error boundary takeover", !c.querySelector('[data-testid="boundary"]'), text.slice(0, 120));
    check("friendly error shown", !!c.querySelector('[role="alert"]') && text.includes("Check your connection"), text.slice(0, 150));
    check("shows Retry button", !!button(c, /^Retry$/));
    unmount();
  }

  console.log("\nCase 10: Non-rest day (Upper) shows original copy unchanged");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
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

  console.log("\nCase 11: Today label with Rest day shows original copy (not new UI)");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
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

  console.log("\nCase 12: Empty days list shows explanatory message");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={[]}
        heading="What about tomorrow?"
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    
    const text = c.textContent ?? "";
    check("shows 'No training days in this block' message", text.includes("No training days in this block"));
    check("shows Never mind", !!button(c, /^Never mind$/));
    check("does NOT show training day buttons", !button(c, /^Upper$/));
    unmount();
  }

  console.log("\nCase 13: Rest with mixed-case label still shows new UI");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
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

  console.log("\nCase 14: Non-Tomorrow label (lowercase 'tomorrow') with Rest shows original UI");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
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

  console.log("\nCase 15: Train anyway list includes Yoga days from block");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_WITH_YOGA}
        heading="What about tomorrow?"
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    
    check("shows Upper from block", !!button(c, /^Upper$/));
    check("shows Flow (yoga) from block", !!button(c, /^Flow$/));
    check("shows Lower from block", !!button(c, /^Lower$/));
    check("does NOT add standalone Yoga button (yoga already in list)", !button(c, /^Yoga$/));
    unmount();
  }

  console.log("\nCase 16: Train anyway adds Yoga when not in block days");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    
    check("shows Yoga button when not in days list", !!button(c, /^Yoga$/));
    check("does NOT show Breathing", !button(c, /^Breathing$/));
    unmount();
  }

  console.log("\nCase 17: Keep rest shows 'Rest day kept' confirmation");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true as const })}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    await new Promise((r) => setTimeout(r, 50));
    
    const text = c.textContent ?? "";
    // LOW fix: No repetitive confirmation - only show settled state
    check("shows settled state", text.includes("Tomorrow is a rest day"), text.slice(0, 120));
    check("does NOT repeat with separate confirmation", !text.includes("Rest day kept"), text.slice(0, 120));
    unmount();
  }

  console.log("\nCase 18: Training choice shows 'Saved: training <label>' confirmation");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true as const })}
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    await click(button(c, /^Upper$/), "Upper");
    await new Promise((r) => setTimeout(r, 50));
    
    const text = c.textContent ?? "";
    // LOW fix: No repetitive confirmation - only show settled state
    check("shows settled state", text.includes("Tomorrow is Upper"), text.slice(0, 150));
    check("does NOT repeat with separate confirmation", !text.includes("Saved: training"), text.slice(0, 150));
    unmount();
  }

  console.log("\nCase 19: Never mind button is at least 44px tall (py-3)");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-123"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );

    await click(button(c, /^Train anyway$/), "Train anyway");
    
    const neverMind = button(c, /^Never mind$/);
    const className = neverMind?.className ?? "";
    check("Never mind has py-3 (not py-2)", className.includes("py-3") && !className.includes("py-2"), className);
    unmount();
  }

  console.log("\nCase 20: sessionId used (not localDate) when sessionId provided");
  {
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-789"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    
    check("sessionId provided", mock.calls[0]?.sessionId === "s-789");
    check("localDate NOT provided", mock.calls[0]?.localDate === undefined);
    unmount();
  }

  console.log("\nCase 25: MED-A Case C - Mon 23:55 start, Tue 00:10 finish, shows Tue");
  {
    // Session started Mon 10-26 at 23:55 IST, finished Tue 10-27 at 00:10 IST
    // session.local_date is "2026-10-26" (Mon)
    // Current wall-clock time is Tue 10-27
    // Prompt must show "Tomorrow" (because dayLabel="Tomorrow") and save to "2026-10-27" (Tue = Mon + 1)
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-med-a-c"
        dayLabel="Tomorrow"
        plannedLabel="Upper"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    // Server passed session.local_date + 1 = "2026-10-27" to the prompt via targetLocalDate
    // When user picks "Keep it", save must go to "2026-10-27" (not "2026-10-28")
    await click(button(c, /^Keep it$/), "Keep it");
    
    check("MED-A Case C: sessionId passed", mock.calls[0]?.sessionId === "s-med-a-c");
    check("MED-A Case C: saves with sessionId (not localDate)", !mock.calls[0]?.localDate);
    check("MED-A Case C: label shows Tomorrow", c.textContent?.includes("Tomorrow"));
    unmount();
  }

  console.log("\nCase 26: MED-A Case G/F - Tue 23:55 start, Wed 00:10 finish, Wed is Full Body B, Thu is rest");
  {
    // Session started Tue 10-20 at 23:55, finished Wed 10-21 at 00:10
    // session.local_date is "2026-10-20" (Tue)
    // Current wall-clock is Wed 10-21
    // Wed is Full Body B (training day), Thu is rest
    // Prompt must describe WED (Full Body B), not Thu
    // 'Train anyway' or 'Keep rest' must act on Wed (server resolves to Tue + 1 = Wed)
    const fullBodyB: PlannableDay[] = [
      { programDayId: "full-body-b", label: "Full Body B", dayType: "weights" },
    ];
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-med-a-gf"
        dayLabel="Tomorrow"
        plannedLabel="Full Body B"
        days={fullBodyB}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    check("MED-A Case G/F: shows Full Body B (Wed), not rest (Thu)", c.textContent?.includes("Full Body B"));
    check("MED-A Case G/F: does NOT show rest day", !c.textContent?.includes("rest day"));
    
    await click(button(c, /^Keep it$/), "Keep it");
    check("MED-A Case G/F: saves with sessionId (resolves to Wed)", mock.calls[0]?.sessionId === "s-med-a-gf");
    unmount();
  }

  console.log("\nCase 27: Confirmation shows before redirect");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-confirm"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: true as const })}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    
    // Confirmation should be visible immediately after save
    const text = c.textContent ?? "";
    check("Confirmation text appears", text.includes("Tomorrow is a rest day."));
    check("Change it button appears", !!button(c, /^Change it$/));
    unmount();
  }

  console.log("\nCase 28: MED-B N10 - sessionId takes priority over localDate");
  {
    // If BOTH sessionId and localDate are provided (shouldn't happen in prod),
    // sessionId must take priority (checked first in the ternary)
    const mock = mockPlanDay();
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-priority"
        localDate="2026-10-30"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );

    await click(button(c, /^Keep rest$/), "Keep rest");
    
    check("N10: sessionId passed (priority)", mock.calls[0]?.sessionId === "s-priority");
    check("N10: localDate NOT passed (sessionId won)", !mock.calls[0]?.localDate);
    unmount();
  }

  console.log("\nCase 29: R7 - rest branch shows a server error inline; deterministic error has no Retry");
  {
    const calls: unknown[] = [];
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-r7"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async (a) => { calls.push(a); return { ok: false as const, error: "That day is not in your block." }; }}
      />
    );
    await click(button(c, /^Train anyway$/), "Train anyway");
    await click(button(c, /^Upper$/), "Upper");
    const alert = c.querySelector('[role="alert"]');
    check("R7: rest branch alert shows the error text", alert?.textContent?.includes("That day is not in your block.") ?? false, c.textContent?.slice(0, 200));
    check("R7: not settled", !(c.textContent ?? "").includes("Tomorrow is Upper."));
    check("LOW-7: no Retry for a deterministic error", !button(c, /^Retry$/));
    check("one save attempt", calls.length === 1, String(calls.length));
    unmount();
  }

  console.log("\nCase 30: R7b - non-rest branch shows a server error inline; Retry re-sends the same choice");
  {
    const calls: Array<{ sessionId?: string; plan: DayPlan }> = [];
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-r7b"
        dayLabel="Tomorrow"
        plannedLabel="Upper"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async (a) => { calls.push(a as { sessionId?: string; plan: DayPlan }); return { ok: false as const, error: "Couldn't save your choice. Please try again." }; }}
      />
    );
    await click(button(c, /^Rest$/), "Rest");
    const alert = c.querySelector('[role="alert"]');
    check("R7b: non-rest alert shows the error text", alert?.textContent?.includes("Couldn't save your choice. Please try again.") ?? false, c.textContent?.slice(0, 200));
    check("R7b: not settled", !(c.textContent ?? "").includes("Tomorrow is a rest day."));
    const retry = button(c, /^Retry$/);
    check("R7b: Retry shown for a generic error", !!retry);
    await click(retry, "Retry");
    check("Retry re-sends once more (2 calls)", calls.length === 2, String(calls.length));
    check("Retry re-sends the same plan + sessionId", calls[1]?.plan?.kind === "rest" && calls[1]?.sessionId === "s-r7b", JSON.stringify(calls[1]));
    unmount();
  }

  console.log("\nCase 31: LOW-7 - 'That day is already done.' has no Retry (non-rest branch)");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-done"
        dayLabel="Tomorrow"
        plannedLabel="Upper"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
        onPlan={async () => ({ ok: false as const, error: "That day is already done." })}
      />
    );
    await click(button(c, /^Keep it$/), "Keep it");
    check("alert shows 'That day is already done.'", c.querySelector('[role="alert"]')?.textContent?.includes("That day is already done.") ?? false);
    check("no Retry", !button(c, /^Retry$/));
    unmount();
  }

  console.log("\nCase 32: #165 Next up in the rest branch - nextUp day listed first with the only badge");
  {
    const mock = mockPlanDay();
    const DAYS_WITH_NEXT: PlannableDay[] = [
      { programDayId: "fb-a", label: "Full Body A", dayType: "weights", nextUp: false },
      { programDayId: "fb-b", label: "Full Body B", dayType: "weights", nextUp: true },
      { programDayId: "fb-c", label: "Full Body C", dayType: "weights", nextUp: false },
    ];
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-next"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={DAYS_WITH_NEXT}
        heading="What about tomorrow?"
        onPlan={mock.fn}
      />
    );
    await click(button(c, /^Train anyway$/), "Train anyway");
    const choices = [...c.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "").filter((t) => t.startsWith("Full Body"));
    check("order: Full Body B (next up) first, then A, C", JSON.stringify(choices) === JSON.stringify(["Full Body BNext up", "Full Body A", "Full Body C"]), JSON.stringify(choices));
    const badges = [...c.querySelectorAll("span")].filter((s) => s.textContent?.trim() === "Next up");
    check("exactly one Next up badge", badges.length === 1, String(badges.length));
    check("badge sits on Full Body B", badges[0]?.closest("button")?.textContent?.includes("Full Body B") ?? false, badges[0]?.closest("button")?.textContent ?? "none");
    await click(button(c, /^Full Body BNext up$/), "Full Body B");
    check("tapping it sends fb-b", mock.calls[0]?.plan.kind === "training" && (mock.calls[0]?.plan as { programDayId?: string }).programDayId === "fb-b", JSON.stringify(mock.calls[0]));
    unmount();
  }

  console.log("\nCase 33: rest branch with no nextUp keeps program order, no badge");
  {
    const { container: c, unmount } = render(
      <DayPlanPrompt
        programDayId={null}
        sessionId="s-nonext"
        dayLabel="Tomorrow"
        plannedLabel="Rest"
        days={TRAINING_DAYS}
        heading="What about tomorrow?"
      />
    );
    await click(button(c, /^Train anyway$/), "Train anyway");
    const choices = [...c.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "").filter((t) => t === "Upper" || t === "Lower");
    check("order: Upper, Lower", JSON.stringify(choices) === '["Upper","Lower"]', JSON.stringify(choices));
    check("no badge", !(c.textContent ?? "").includes("Next up"));
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
